import { salonEntryCreateSchema, salonEntryEventSchema, salonEntryResponseSchema, salonEntryUpdateSchema, salonQuerySchema } from "@just4kids/contracts";
import type { SalonRepository } from "./salon.repository.js";

type EntryRow = NonNullable<Awaited<ReturnType<SalonRepository["get"]>>>;

function serializeEntry({ row, branchName }: EntryRow) {
  return salonEntryResponseSchema.parse({
    id: row.id, branchId: row.branchId, branchName, date: row.date, childCount: row.childCount,
    cash: row.cash, link: row.link, knet: row.knet, total: row.total, enteredBy: row.enteredBy,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  });
}

export function createSalonService(repository: SalonRepository) {
  return {
    async report(queryInput: unknown) {
      const query = salonQuerySchema.parse(queryInput);
      const [rows, totals] = await Promise.all([repository.list(query), repository.totals(query)]);
      return {
        timeZone: "Asia/Kuwait" as const, from: query.from ?? null, to: query.to ?? null,
        entries: rows.map(serializeEntry), totals,
      };
    },
    async create(body: unknown, actorId: string) {
      const input = salonEntryCreateSchema.parse(body);
      const row = await repository.create(input, actorId);
      if (!row) throw new Error("Created salon entry missing from database");
      return serializeEntry(row);
    },
    async update(id: string, body: unknown, actorId: string) {
      const input = salonEntryUpdateSchema.parse(body);
      const row = await repository.update(id, input, actorId);
      return row ? serializeEntry(row) : undefined;
    },
    async history(id: string) {
      if (!await repository.get(id)) return undefined;
      const rows = await repository.history(id);
      return { events: rows.map(row => salonEntryEventSchema.parse({ id: row.id, entryId: row.entryId, actorAccountId: row.actorAccountId, occurredAt: row.occurredAt.toISOString(), before: row.before, after: row.after })) };
    },
  };
}

export type SalonService = ReturnType<typeof createSalonService>;
