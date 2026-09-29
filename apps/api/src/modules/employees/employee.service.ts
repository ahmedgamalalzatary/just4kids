import { z } from "zod";
import { employeeAdminUpdateSchema, employeeCreateSchema, employeePasswordResetSchema, employeeResponseSchema, employeeSelfUpdateSchema } from "@just4kids/contracts";
import type { ApiEnv } from "../../configs/env.js";
import { HttpError } from "../../lib/http-error.js";
import { hashPassword } from "../../lib/password.js";
import type { EmployeeRepository } from "./employee.repository.js";

type Record = NonNullable<Awaited<ReturnType<EmployeeRepository["get"]>>>;

function serialize(row: Record) {
  return employeeResponseSchema.parse({
    id: row.account.id,
    displayName: row.employee.displayName,
    phone: row.account.phone,
    branchId: row.employee.branchId,
    branch: { id: row.branch.id, name: row.branch.name, location: row.branch.location },
    enabled: row.account.enabled,
    createdAt: row.employee.createdAt.toISOString(),
    updatedAt: row.employee.updatedAt.toISOString(),
  });
}

function rethrowDatabaseConflict(error: unknown): never {
  const underlying = typeof error === "object" && error !== null && "cause" in error ? error.cause : error;
  if (typeof underlying === "object" && underlying !== null && "code" in underlying) {
    if (underlying.code === "ER_DUP_ENTRY") throw new HttpError(409, "PHONE_ALREADY_USED", "رقم الهاتف مستخدم بالفعل");
    if (underlying.code === "ER_NO_REFERENCED_ROW_2") throw new HttpError(404, "BRANCH_NOT_FOUND", "الفرع غير موجود");
  }
  throw error;
}

export function createEmployeeService(repository: EmployeeRepository, env: ApiEnv) {
  function checkPassword(password: string) {
    if (env.NODE_ENV === "production") z.string().min(12).parse(password);
  }
  return {
    async list() { return (await repository.list()).map(serialize); },
    async get(id: string) { const row = await repository.get(id); return row ? serialize(row) : undefined; },

    async create(body: unknown) {
      const input = employeeCreateSchema.parse(body);
      checkPassword(input.password);
      if (!await repository.branchExists(input.branchId)) throw new HttpError(404, "BRANCH_NOT_FOUND", "الفرع غير موجود");
      try {
        const row = await repository.create({ displayName: input.displayName, phone: input.phone, branchId: input.branchId, passwordHash: await hashPassword(input.password) });
        if (!row) throw new Error("Created employee missing from database");
        return serialize(row);
      } catch (error) { rethrowDatabaseConflict(error); }
    },

    async updateByAdministrator(id: string, body: unknown) {
      const input = employeeAdminUpdateSchema.parse(body);
      if (input.branchId && !await repository.branchExists(input.branchId)) throw new HttpError(404, "BRANCH_NOT_FOUND", "الفرع غير موجود");
      try { const row = await repository.updateByAdministrator(id, input); return row ? serialize(row) : undefined; }
      catch (error) { rethrowDatabaseConflict(error); }
    },

    async updateOwnDisplayName(id: string, body: unknown) {
      const input = employeeSelfUpdateSchema.parse(body);
      const row = await repository.updateOwnDisplayName(id, input.displayName);
      return row ? serialize(row) : undefined;
    },

    async resetPassword(id: string, body: unknown): Promise<boolean> {
      const input = employeePasswordResetSchema.parse(body);
      checkPassword(input.password);
      return repository.resetPassword(id, await hashPassword(input.password));
    },
  };
}

export type EmployeeService = ReturnType<typeof createEmployeeService>;
