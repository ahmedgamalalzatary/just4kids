import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { branches, salonEntries, salonEntryEvents } from "@just4kids/db/schema";
import type { SalonEntryCreate, SalonEntryUpdate, SalonQuery } from "@just4kids/contracts";
import { HttpError } from "../../lib/http-error.js";
import { fils, money } from "../bookings/booking.repository.js";

type EntryRow = typeof salonEntries.$inferSelect;
function snapshot(row: EntryRow) {
  return { branchId: row.branchId, date: row.date, childCount: row.childCount, cash: row.cash, link: row.link, knet: row.knet, total: row.total };
}
// The stored total shares the DECIMAL(24,3) bound with its columns, so reject a sum that would overflow it.
const MAX_TOTAL = fils("999999999999999999999.999");
function total(cash: string, link: string, knet: string) {
  const value = fils(cash) + fils(link) + fils(knet);
  if (value > MAX_TOTAL) throw new HttpError(400, "SALON_TOTAL_TOO_LARGE", "إجمالي التحصيل يتجاوز الحد المسموح");
  return money(value);
}
function conflict(error: unknown): never {
  const underlying = typeof error === "object" && error !== null && "cause" in error ? (error as { cause?: unknown }).cause : error;
  const code = typeof underlying === "object" && underlying !== null && "code" in underlying ? (underlying as { code?: string }).code : undefined;
  if (code === "ER_DUP_ENTRY" || code === "ER_LOCK_DEADLOCK") throw new HttpError(409, "SALON_ENTRY_EXISTS", "يوجد إدخال لهذا الفرع في هذا اليوم");
  throw error;
}

export function createSalonRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  const scope = (query: SalonQuery) => and(
    query.from ? gte(salonEntries.date, query.from) : undefined,
    query.to ? lte(salonEntries.date, query.to) : undefined,
    query.branchId ? eq(salonEntries.branchId, query.branchId) : undefined,
  );
  async function get(id: string) {
    const [row] = await db.select({ row: salonEntries, branchName: branches.name }).from(salonEntries)
      .innerJoin(branches, eq(branches.id, salonEntries.branchId)).where(eq(salonEntries.id, id));
    return row;
  }
  return {
    get,
    async list(query: SalonQuery) {
      return db.select({ row: salonEntries, branchName: branches.name }).from(salonEntries)
        .innerJoin(branches, eq(branches.id, salonEntries.branchId)).where(scope(query))
        .orderBy(asc(salonEntries.date), asc(branches.name), asc(salonEntries.id));
    },
    async create(input: SalonEntryCreate, actorId: string) {
      const id = randomUUID(), now = new Date(), sum = total(input.cash, input.link, input.knet);
      try {
        await db.transaction(async transaction => {
          const [branch] = await transaction.select({ id: branches.id }).from(branches).where(eq(branches.id, input.branchId)).for("share");
          if (!branch) throw new HttpError(404, "BRANCH_NOT_FOUND", "الفرع غير موجود");
          await transaction.insert(salonEntries).values({ id, branchId: input.branchId, date: input.date, childCount: input.childCount, cash: input.cash, link: input.link, knet: input.knet, total: sum, version: 0, enteredBy: actorId, createdAt: now, updatedAt: now });
          await transaction.insert(salonEntryEvents).values({ id: randomUUID(), entryId: id, actorAccountId: actorId, occurredAt: now, before: null, after: { branchId: input.branchId, date: input.date, childCount: input.childCount, cash: input.cash, link: input.link, knet: input.knet, total: sum } });
        });
      } catch (error) {
        if (error instanceof HttpError) throw error;
        conflict(error);
      }
      return get(id);
    },
    async update(id: string, input: SalonEntryUpdate, actorId: string) {
      const found = await db.transaction(async transaction => {
        const [current] = await transaction.select().from(salonEntries).where(eq(salonEntries.id, id)).for("update");
        if (!current) return false;
        if (current.version !== input.expectedVersion) throw new HttpError(409, "SALON_ENTRY_CONFLICT", "تم تعديل الإدخال، أعد تحميله");
        const date = input.date ?? current.date;
        const childCount = input.childCount ?? current.childCount;
        const cash = input.cash ?? current.cash, link = input.link ?? current.link, knet = input.knet ?? current.knet;
        const sum = total(cash, link, knet);
        if (date !== current.date) {
          const [existing] = await transaction.select({ id: salonEntries.id }).from(salonEntries)
            .where(and(eq(salonEntries.branchId, current.branchId), eq(salonEntries.date, date))).for("update");
          if (existing) throw new HttpError(409, "SALON_ENTRY_EXISTS", "يوجد إدخال لهذا الفرع في هذا اليوم");
        }
        const before = snapshot(current), after = { branchId: current.branchId, date, childCount, cash, link, knet, total: sum };
        if (JSON.stringify(before) === JSON.stringify(after)) throw new HttpError(409, "SALON_ENTRY_UNCHANGED", "لا يوجد تغيير في الإدخال");
        const now = new Date();
        await transaction.update(salonEntries).set({ date, childCount, cash, link, knet, total: sum, version: current.version + 1, updatedAt: now }).where(eq(salonEntries.id, id));
        await transaction.insert(salonEntryEvents).values({ id: randomUUID(), entryId: id, actorAccountId: actorId, occurredAt: now, before, after });
        return true;
      });
      return found ? get(id) : undefined;
    },
    async history(id: string) {
      return db.select().from(salonEntryEvents).where(eq(salonEntryEvents.entryId, id))
        .orderBy(asc(salonEntryEvents.occurredAt), asc(salonEntryEvents.id));
    },
  };
}

export type SalonRepository = ReturnType<typeof createSalonRepository>;
