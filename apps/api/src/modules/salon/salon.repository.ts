import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { branches, salonEntries, salonEntryEvents } from "@just4kids/db/schema";
import type { SalonEntryCreate, SalonEntryUpdate, SalonQuery } from "@just4kids/contracts";
import { HttpError } from "../../lib/http-error.js";
import { fils, money } from "../bookings/booking.repository.js";

type EntryRow = typeof salonEntries.$inferSelect;
function snapshot(row: EntryRow) {
  return { branchId: row.branchId, date: row.date, childCount: row.childCount, cash: row.cash, link: row.link, knet: row.knet, total: row.total };
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
    async totals(query: SalonQuery) {
      const [row] = await db.select({
        childCount: sql<number>`COALESCE(SUM(${salonEntries.childCount}), 0)`.mapWith(Number),
        cash: sql<string>`CAST(COALESCE(SUM(${salonEntries.cash}), 0) AS DECIMAL(65, 3))`.mapWith(String),
        link: sql<string>`CAST(COALESCE(SUM(${salonEntries.link}), 0) AS DECIMAL(65, 3))`.mapWith(String),
        knet: sql<string>`CAST(COALESCE(SUM(${salonEntries.knet}), 0) AS DECIMAL(65, 3))`.mapWith(String),
        total: sql<string>`CAST(COALESCE(SUM(${salonEntries.total}), 0) AS DECIMAL(65, 3))`.mapWith(String),
      }).from(salonEntries).where(scope(query));
      return row!;
    },
    async create(input: SalonEntryCreate, actorId: string) {
      const id = randomUUID(), now = new Date();
      const total = money(fils(input.cash) + fils(input.link) + fils(input.knet));
      const created = await db.transaction(async transaction => {
        const [branch] = await transaction.select({ id: branches.id }).from(branches).where(eq(branches.id, input.branchId)).for("share");
        if (!branch) throw new HttpError(404, "BRANCH_NOT_FOUND", "الفرع غير موجود");
        const [existing] = await transaction.select({ id: salonEntries.id }).from(salonEntries)
          .where(and(eq(salonEntries.branchId, input.branchId), eq(salonEntries.date, input.date))).for("update");
        if (existing) throw new HttpError(409, "SALON_ENTRY_EXISTS", "يوجد إدخال لهذا الفرع في هذا اليوم");
        await transaction.insert(salonEntries).values({ id, branchId: input.branchId, date: input.date, childCount: input.childCount, cash: input.cash, link: input.link, knet: input.knet, total, enteredBy: actorId, createdAt: now, updatedAt: now });
        await transaction.insert(salonEntryEvents).values({ id: randomUUID(), entryId: id, actorAccountId: actorId, occurredAt: now, before: null, after: { branchId: input.branchId, date: input.date, childCount: input.childCount, cash: input.cash, link: input.link, knet: input.knet, total } });
        return true;
      });
      return created ? get(id) : undefined;
    },
    async update(id: string, input: SalonEntryUpdate, actorId: string) {
      const found = await db.transaction(async transaction => {
        const [current] = await transaction.select().from(salonEntries).where(eq(salonEntries.id, id)).for("update");
        if (!current) return false;
        const date = input.date ?? current.date;
        const childCount = input.childCount ?? current.childCount;
        const cash = input.cash ?? current.cash, link = input.link ?? current.link, knet = input.knet ?? current.knet;
        const total = money(fils(cash) + fils(link) + fils(knet));
        if (date !== current.date) {
          const [conflict] = await transaction.select({ id: salonEntries.id }).from(salonEntries)
            .where(and(eq(salonEntries.branchId, current.branchId), eq(salonEntries.date, date))).for("update");
          if (conflict) throw new HttpError(409, "SALON_ENTRY_EXISTS", "يوجد إدخال لهذا الفرع في هذا اليوم");
        }
        const before = snapshot(current), after = { branchId: current.branchId, date, childCount, cash, link, knet, total };
        if (JSON.stringify(before) === JSON.stringify(after)) throw new HttpError(409, "SALON_ENTRY_UNCHANGED", "لا يوجد تغيير في الإدخال");
        const now = new Date();
        await transaction.update(salonEntries).set({ date, childCount, cash, link, knet, total, updatedAt: now }).where(eq(salonEntries.id, id));
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
