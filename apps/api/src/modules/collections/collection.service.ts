import { barberCollectionCreateSchema, barberCollectionEventSchema, barberCollectionQuerySchema, barberCollectionResponseSchema, barberCollectionUpdateSchema } from "@just4kids/contracts";
import type { Account } from "@just4kids/contracts";
import { fils, money } from "../bookings/booking.repository.js";
import type { CollectionRepository } from "./collection.repository.js";

type EntryRow = NonNullable<Awaited<ReturnType<CollectionRepository["get"]>>>;

function serializeEntry({ row, displayName }: EntryRow) {
  return barberCollectionResponseSchema.parse({
    id: row.id, version: row.version, employeeId: row.employeeId, displayName, date: row.date,
    normalChildren: row.normalChildren, specialChildren: row.specialChildren,
    cash: row.cash, link: row.link, knet: row.knet, total: row.total, enteredBy: row.enteredBy,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  });
}

export function createCollectionService(repository: CollectionRepository) {
  return {
    async report(queryInput: unknown, actor: Account) {
      const query = barberCollectionQuerySchema.parse(queryInput);
      // Employees see only their own collections, whatever barber filter they send.
      const scoped = actor.role === "employee" ? { ...query, employeeId: actor.id } : query;
      const entries = (await repository.list(scoped)).map(serializeEntry);
      // Totals are derived from the returned rows so the table and its totals always describe the same read.
      const totals = entries.reduce((accumulator, entry) => ({
        normalChildren: accumulator.normalChildren + entry.normalChildren,
        specialChildren: accumulator.specialChildren + entry.specialChildren,
        cash: money(fils(accumulator.cash) + fils(entry.cash)),
        link: money(fils(accumulator.link) + fils(entry.link)),
        knet: money(fils(accumulator.knet) + fils(entry.knet)),
        total: money(fils(accumulator.total) + fils(entry.total)),
      }), { normalChildren: 0, specialChildren: 0, cash: "0.000", link: "0.000", knet: "0.000", total: "0.000" });
      return { timeZone: "Asia/Kuwait" as const, from: scoped.from ?? null, to: scoped.to ?? null, entries, totals };
    },
    async create(body: unknown, actorId: string) {
      const input = barberCollectionCreateSchema.parse(body);
      const row = await repository.create(input, actorId);
      if (!row) throw new Error("Created barber collection missing from database");
      return serializeEntry(row);
    },
    async update(id: string, body: unknown, actorId: string) {
      const input = barberCollectionUpdateSchema.parse(body);
      const row = await repository.update(id, input, actorId);
      return row ? serializeEntry(row) : undefined;
    },
    async history(id: string) {
      if (!await repository.get(id)) return undefined;
      const rows = await repository.history(id);
      return { events: rows.map(row => barberCollectionEventSchema.parse({ id: row.id, entryId: row.entryId, actorAccountId: row.actorAccountId, occurredAt: row.occurredAt.toISOString(), before: row.before, after: row.after })) };
    },
  };
}

export type CollectionService = ReturnType<typeof createCollectionService>;
