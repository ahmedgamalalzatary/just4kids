import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, employees, sessions } from "@just4kids/db/schema";
import type { EmployeeAdminUpdate } from "@just4kids/contracts";

export function createEmployeeRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  return {
    async list() {
      return db.select({ account: accounts, employee: employees }).from(employees)
        .innerJoin(accounts, eq(employees.accountId, accounts.id))
        .orderBy(asc(employees.displayName), asc(accounts.id));
    },

    async get(id: string) {
      const [row] = await db.select({ account: accounts, employee: employees }).from(employees)
        .innerJoin(accounts, eq(employees.accountId, accounts.id))
        .where(and(eq(accounts.id, id), eq(accounts.role, "employee")));
      return row;
    },

    async create(input: { displayName: string; phone: string; passwordHash: string }) {
      const id = randomUUID();
      const now = new Date();
      await db.transaction(async transaction => {
        await transaction.insert(accounts).values({ id, phone: input.phone, role: "employee", passwordHash: input.passwordHash, createdAt: now, updatedAt: now });
        await transaction.insert(employees).values({ accountId: id, displayName: input.displayName, createdAt: now, updatedAt: now });
      });
      return this.get(id);
    },

    async updateByAdministrator(id: string, input: EmployeeAdminUpdate) {
      const found = await db.transaction(async transaction => {
        const [account] = await transaction.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.role, "employee"))).for("update");
        if (!account) return false;
        const [employee] = await transaction.select().from(employees).where(eq(employees.accountId, id)).for("update");
        if (!employee) return false;
        const now = new Date();
        if (input.phone !== undefined || input.enabled !== undefined || input.accessUntil !== undefined) {
          await transaction.update(accounts).set({
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(input.accessUntil !== undefined ? { accessUntil: input.accessUntil } : {}),
            updatedAt: now,
          }).where(eq(accounts.id, id));
        }
        await transaction.update(employees).set({
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          updatedAt: now,
        }).where(eq(employees.accountId, id));
        if ((input.phone !== undefined && input.phone !== account.phone) || input.enabled === false) {
          await transaction.delete(sessions).where(eq(sessions.accountId, id));
        }
        return true;
      });
      return found ? this.get(id) : undefined;
    },

    async updateOwnDisplayName(id: string, displayName: string) {
      const found = await db.transaction(async transaction => {
        const [account] = await transaction.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.role, "employee"))).for("update");
        if (!account?.enabled) return false;
        const [employee] = await transaction.select().from(employees).where(eq(employees.accountId, id)).for("update");
        if (!employee) return false;
        await transaction.update(employees).set({ displayName, updatedAt: new Date() }).where(eq(employees.accountId, id));
        return true;
      });
      return found ? this.get(id) : undefined;
    },

    async setPhotoUpdatedAt(id: string, value: Date | null): Promise<void> {
      await db.update(employees).set({ photoUpdatedAt: value, updatedAt: new Date() }).where(eq(employees.accountId, id));
    },

    async resetPassword(id: string, passwordHash: string): Promise<boolean> {
      return db.transaction(async transaction => {
        const [account] = await transaction.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.role, "employee"))).for("update");
        if (!account) return false;
        const [employee] = await transaction.select().from(employees).where(eq(employees.accountId, id)).for("update");
        if (!employee) return false;
        await transaction.update(accounts).set({ passwordHash, updatedAt: new Date() }).where(eq(accounts.id, id));
        await transaction.delete(sessions).where(eq(sessions.accountId, id));
        return true;
      });
    },
  };
}

export type EmployeeRepository = ReturnType<typeof createEmployeeRepository>;
