import { branchCreateSchema, branchResponseSchema, branchUpdateSchema } from "@just4kids/contracts";
import type { BranchRepository } from "./branch.repository.js";

type Record = NonNullable<Awaited<ReturnType<BranchRepository["get"]>>>;

function serialize(record: Record) {
  return branchResponseSchema.parse({ ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() });
}

export function createBranchService(repository: BranchRepository) {
  return {
    async list() { return (await repository.list()).map(serialize); },
    async get(id: string) { const record = await repository.get(id); return record ? serialize(record) : undefined; },
    async create(body: unknown) {
      const record = await repository.create(branchCreateSchema.parse(body));
      if (!record) throw new Error("Created branch missing from database");
      return serialize(record);
    },
    async update(id: string, body: unknown) {
      const input = branchUpdateSchema.parse(body);
      if (!await repository.get(id)) return undefined;
      const record = await repository.update(id, input);
      return record ? serialize(record) : undefined;
    },
  };
}

export type BranchService = ReturnType<typeof createBranchService>;
