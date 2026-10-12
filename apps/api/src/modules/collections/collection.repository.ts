import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { barberCollectionEvents, barberCollections, employees } from "@just4kids/db/schema";
import type { BarberCollectionCreate, BarberCollectionQuery, BarberCollectionUpdate } from "@just4kids/contracts";
import { HttpError } from "../../lib/http-error.js";
import { fils, money } from "../bookings/booking.repository.js";

type EntryRow = typeof barberCollections.$inferSelect;
function snapshot(row: EntryRow) {
  return { employeeId: row.employeeId, date: row.date, normalChildren: row.normalChildren, specialChildren: row.specialChildren, cash: row.cash, link: row.link, knet: row.knet, total: row.total };
}
// The stored total shares the DECIMAL(24,3) bound with its columns, so reject a sum that would overflow it.
const MAX_TOTAL = fils("999999999999999999999.999");
function total(cash: string, link: string, knet: string) {
  const value = fils(cash) + fils(link) + fils(knet);
  if (value > MAX_TOTAL) throw new HttpError(400, "BARBER_COLLECTION_TOTAL_TOO_LARGE", "إجمالي التحصيل يتجاوز الحد المسموح");
  return money(value);
}
function conflict(error: unknown): never {
  const underlying = typeof error === "object" && error !== null && "cause" in error ? (error as { cause?: unknown }).cause : error;
  const code = typeof underlying === "object" && underlying !== null && "code" in underlying ? (underlying as { code?: string }).code : undefined;
  if (code === "ER_DUP_ENTRY" || code === "ER_LOCK_DEADLOCK") throw new HttpError(409, "BARBER_COLLECTION_EXISTS", "يوجد إدخال لهذا الحلاق في هذا اليوم");
  throw error;
}

export function createCollectionRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  const scope = (query: BarberCollectionQuery) => and(
    query.from ? gte(barberCollections.date, query.from) : undefined,
    query.to ? lte(barberCollections.date, query.to) : undefined,
    query.employeeId ? eq(barberCollections.employeeId, query.employeeId) : undefined,
  );
  async function get(id: string) {
    const [row] = await db.select({ row: barberCollections, displayName: employees.displayName }).from(barberCollections)
      .innerJoin(employees, eq(employees.accountId, barberCollections.employeeId)).where(eq(barberCollections.id, id));
    return row;
  }
  return {
    get,
    async list(query: BarberCollectionQuery) {
      return db.select({ row: barberCollections, displayName: employees.displayName }).from(barberCollections)
        .innerJoin(employees, eq(employees.accountId, barberCollections.employeeId)).where(scope(query))
        .orderBy(asc(barberCollections.date), asc(employees.displayName), asc(barberCollections.id));
    },
    async create(input: BarberCollectionCreate, actorId: string) {
      const id = randomUUID(), now = new Date(), sum = total(input.cash, input.link, input.knet);
      try {
        await db.transaction(async transaction => {
          const [barber] = await transaction.select({ id: employees.accountId }).from(employees).where(eq(employees.accountId, input.employeeId)).for("share");
          if (!barber) throw new HttpError(404, "EMPLOYEE_NOT_FOUND", "الموظف غير موجود");
          await transaction.insert(barberCollections).values({ id, employeeId: input.employeeId, date: input.date, normalChildren: input.normalChildren, specialChildren: input.specialChildren, cash: input.cash, link: input.link, knet: input.knet, total: sum, version: 0, enteredBy: actorId, createdAt: now, updatedAt: now });
          await transaction.insert(barberCollectionEvents).values({ id: randomUUID(), entryId: id, actorAccountId: actorId, occurredAt: now, before: null, after: { employeeId: input.employeeId, date: input.date, normalChildren: input.normalChildren, specialChildren: input.specialChildren, cash: input.cash, link: input.link, knet: input.knet, total: sum } });
        });
      } catch (error) {
        if (error instanceof HttpError) throw error;
        conflict(error);
      }
      return get(id);
    },
    async update(id: string, input: BarberCollectionUpdate, actorId: string) {
      const found = await db.transaction(async transaction => {
        const [current] = await transaction.select().from(barberCollections).where(eq(barberCollections.id, id)).for("update");
        if (!current) return false;
        if (current.version !== input.expectedVersion) throw new HttpError(409, "BARBER_COLLECTION_CONFLICT", "تم تعديل الإدخال، أعد تحميله");
        const date = input.date ?? current.date;
        const normalChildren = input.normalChildren ?? current.normalChildren;
        const specialChildren = input.specialChildren ?? current.specialChildren;
        const cash = input.cash ?? current.cash, link = input.link ?? current.link, knet = input.knet ?? current.knet;
        const sum = total(cash, link, knet);
        if (date !== current.date) {
          const [existing] = await transaction.select({ id: barberCollections.id }).from(barberCollections)
            .where(and(eq(barberCollections.employeeId, current.employeeId), eq(barberCollections.date, date))).for("update");
          if (existing) throw new HttpError(409, "BARBER_COLLECTION_EXISTS", "يوجد إدخال لهذا الحلاق في هذا اليوم");
        }
        const before = snapshot(current), after = { employeeId: current.employeeId, date, normalChildren, specialChildren, cash, link, knet, total: sum };
        if (JSON.stringify(before) === JSON.stringify(after)) throw new HttpError(409, "BARBER_COLLECTION_UNCHANGED", "لا يوجد تغيير في الإدخال");
        const now = new Date();
        await transaction.update(barberCollections).set({ date, normalChildren, specialChildren, cash, link, knet, total: sum, version: current.version + 1, updatedAt: now }).where(eq(barberCollections.id, id));
        await transaction.insert(barberCollectionEvents).values({ id: randomUUID(), entryId: id, actorAccountId: actorId, occurredAt: now, before, after });
        return true;
      });
      return found ? get(id) : undefined;
    },
    async history(id: string) {
      return db.select().from(barberCollectionEvents).where(eq(barberCollectionEvents.entryId, id))
        .orderBy(asc(barberCollectionEvents.occurredAt), asc(barberCollectionEvents.id));
    },
  };
}

export type CollectionRepository = ReturnType<typeof createCollectionRepository>;
