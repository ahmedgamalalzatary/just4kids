import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { createDatabase, Database } from "@just4kids/db";
import { areas } from "@just4kids/db/schema";
import type { AddressCreate, AreaCreate, AreaUpdate } from "@just4kids/contracts";
import { HttpError } from "../../lib/http-error.js";

// Selected catalogue entries are checked under the address transaction. Legacy
// free-text callers remain supported; saved names never follow catalogue edits.
export async function verifyAddressArea(transaction: Parameters<Parameters<Database["transaction"]>[0]>[0], input: AddressCreate) {
  if (!input.areaId) return;
  const [area] = await transaction.select().from(areas).where(eq(areas.id, input.areaId)).for("share");
  if (!area?.enabled || area.name !== input.area) throw new HttpError(409, "AREA_UNAVAILABLE", "المنطقة تغيرت أو تم إيقافها؛ اختر منطقة متاحة من القائمة");
}

export function createAreaRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  async function get(id: string) { const [row] = await db.select().from(areas).where(eq(areas.id, id)); return row; }
  return {
    async list(search: { q: string; status: "all" | "active" | "stopped" }) {
      const pattern = `%${search.q.replace(/[!%_]/g, character => `!${character}`)}%`;
      return db.select().from(areas).where(and(search.q ? sql`${areas.name} LIKE ${pattern} ESCAPE '!'` : undefined, search.status === "all" ? undefined : eq(areas.enabled, search.status === "active"))).orderBy(asc(areas.name), asc(areas.id));
    },
    async create(input: AreaCreate) {
      const id = randomUUID(), now = new Date();
      await db.insert(areas).values({ id, ...input, createdAt: now, updatedAt: now });
      return get(id);
    },
    async update(id: string, input: AreaUpdate) {
      const found = await db.transaction(async transaction => {
        const [row] = await transaction.select({ id: areas.id }).from(areas).where(eq(areas.id, id)).for("update");
        if (!row) return false;
        await transaction.update(areas).set({ ...input, updatedAt: new Date() }).where(eq(areas.id, id));
        return true;
      });
      return found ? get(id) : undefined;
    },
  };
}
