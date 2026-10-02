import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, loginAttempts, sessions } from "@just4kids/db/schema";
import { sha256 } from "../../lib/security.js";
import { dummyPasswordHash, hashPassword, verifyPassword } from "../../lib/password.js";

type Connection = ReturnType<typeof createDatabase>;
const attemptWindowMs = 15 * 60 * 1000;

export function createAuthRepository(connection: Connection) {
  const { db } = connection;
  return {
    async synchronizeAdministrator(phone: string, password: string): Promise<void> {
      const now = new Date();
      // The generated unique admin slot and row lock make concurrent starts converge on one administrator.
      await db.transaction(async transaction => {
        await transaction.insert(accounts).values({
          id: randomUUID(), phone, role: "admin", passwordHash: await hashPassword(password), createdAt: now, updatedAt: now,
        }).onDuplicateKeyUpdate({ set: { id: sql`${accounts.id}` } });
        const [admin] = await transaction.select().from(accounts).where(eq(accounts.role, "admin")).for("update");
        if (!admin) throw new Error("Administrator phone conflicts with an existing account");
        const passwordUnchanged = await verifyPassword(password, admin.passwordHash);
        if (admin.phone !== phone || !passwordUnchanged || !admin.enabled) {
          await transaction.update(accounts).set({ phone, passwordHash: await hashPassword(password), enabled: true, updatedAt: now }).where(eq(accounts.id, admin.id));
          await transaction.delete(sessions).where(eq(sessions.accountId, admin.id));
        }
      });
    },

    async findSession(token: string) {
      const [row] = await db.select({ account: accounts, expiresAt: sessions.expiresAt }).from(sessions)
        .innerJoin(accounts, eq(sessions.accountId, accounts.id))
        .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date()), eq(accounts.enabled, true)));
      return row;
    },

    async createSession(accountId: string, expectedPhone: string, expectedPasswordHash: string, token: string, expiresAt: Date, oldToken?: string): Promise<boolean> {
      return db.transaction(async transaction => {
        const [current] = await transaction.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
        if (!current || !current.enabled || current.phone !== expectedPhone || current.passwordHash !== expectedPasswordHash) return false;
        await transaction.insert(sessions).values({ tokenHash: sha256(token), accountId, createdAt: new Date(), expiresAt });
        if (oldToken && /^[a-f0-9]{64}$/.test(oldToken)) await transaction.delete(sessions).where(eq(sessions.tokenHash, sha256(oldToken)));
        return true;
      });
    },

    async revokeSession(token: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
    },

    async verifyCredentials(phone: string, password: string, ip: string) {
      const now = new Date();
      const nextExpiry = new Date(now.getTime() + attemptWindowMs);
      return db.transaction(async transaction => {
        const counters: { keyHash: string; attempts: number; expiresAt: Date }[] = [];
        for (const [key, limit] of [[`ip:${ip}`, 30], [`phone-ip:${phone}:${ip}`, 5]] as const) {
          const keyHash = sha256(key);
          await transaction.insert(loginAttempts).values({ keyHash, attempts: 0, expiresAt: nextExpiry }).onDuplicateKeyUpdate({ set: { keyHash: sql`${loginAttempts.keyHash}` } });
          const [entry] = await transaction.select().from(loginAttempts).where(eq(loginAttempts.keyHash, keyHash)).for("update");
          if (!entry) throw new Error("Login attempt counter unavailable");
          const expired = entry.expiresAt <= now;
          const attempts = expired ? 0 : entry.attempts;
          if (attempts >= limit) return { kind: "limited" as const, retryAfter: Math.max(1, Math.ceil((entry.expiresAt.getTime() - now.getTime()) / 1000)) };
          counters.push({ keyHash, attempts, expiresAt: expired ? nextExpiry : entry.expiresAt });
        }
        const [account] = await transaction.select().from(accounts).where(eq(accounts.phone, phone));
        if (!await verifyPassword(password, account?.passwordHash ?? dummyPasswordHash) || !account?.enabled) {
          for (const counter of counters) {
            await transaction.update(loginAttempts).set({ attempts: counter.attempts + 1, expiresAt: counter.expiresAt }).where(eq(loginAttempts.keyHash, counter.keyHash));
          }
          return { kind: "invalid" as const };
        }
        await transaction.delete(loginAttempts).where(eq(loginAttempts.keyHash, sha256(`phone-ip:${phone}:${ip}`)));
        return { kind: "valid" as const, account };
      });
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
