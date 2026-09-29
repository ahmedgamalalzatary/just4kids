import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { branches } from "@just4kids/db/schema";
import type { BranchCreate, BranchUpdate } from "@just4kids/contracts";

export function createBranchRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  return {
    async list() { return db.select().from(branches).orderBy(asc(branches.name), asc(branches.id)); },
    async get(id: string) {
      const [branch] = await db.select().from(branches).where(eq(branches.id, id));
      return branch;
    },
    async create(input: BranchCreate) {
      const now = new Date();
      const id = randomUUID();
      await db.insert(branches).values({ id, ...input, createdAt: now, updatedAt: now });
      return this.get(id);
    },
    async update(id: string, input: BranchUpdate) {
      await db.update(branches).set({ ...input, updatedAt: new Date() }).where(eq(branches.id, id));
      return this.get(id);
    },
  };
}

export type BranchRepository = ReturnType<typeof createBranchRepository>;
