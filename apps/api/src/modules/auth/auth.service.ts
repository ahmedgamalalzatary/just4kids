import { createHmac, randomBytes } from "node:crypto";
import { accountSchema } from "@just4kids/contracts";
import type { Account } from "@just4kids/contracts";
import type { ApiEnv } from "../../configs/env.js";
import { equalHex } from "../../lib/security.js";
import { ForbiddenError } from "../../lib/http-error.js";
import type { AuthRepository } from "./auth.repository.js";

export type Authenticated = { account: Account; token: string; expiresAt: Date };
const sessionLengthMs = 7 * 24 * 60 * 60 * 1000;

export function createAuthService(repository: AuthRepository, env: ApiEnv) {
  const secret = Buffer.from(env.AUTH_SECRET, "hex");
  function sign(value: string): string { return createHmac("sha256", secret).update(value).digest("hex"); }
  function csrf(value: string): string { return sign(`csrf:${value}`); }
  function publicAccount(record: { id: string; phone: string; role: "admin" | "employee" }): Account {
    return accountSchema.parse({ id: record.id, phone: record.phone, role: record.role });
  }

  return {
    initialize: () => repository.synchronizeAdministrator(env.ADMIN_PHONE, env.ADMIN_PASSWORD),
    csrf,

    createChallenge() {
      const expires = Date.now() + 10 * 60 * 1000;
      const payload = `${randomBytes(32).toString("hex")}.${expires}`;
      const challenge = `${payload}.${sign(`prelogin:${payload}`)}`;
      return { challenge, csrfToken: csrf(challenge) };
    },

    verifyChallenge(challenge: string | undefined, csrfToken: string | undefined): boolean {
      const match = /^([a-f0-9]{64})\.(\d{13})\.([a-f0-9]{64})$/.exec(challenge ?? "");
      if (!challenge || !match) return false;
      const payload = `${match[1]}.${match[2]}`;
      return equalHex(match[3] ?? "", sign(`prelogin:${payload}`)) && Number(match[2]) > Date.now() && equalHex(csrfToken ?? "", csrf(challenge));
    },

    async authenticate(phone: string, password: string, ip: string, oldToken?: string): Promise<{ kind: "success"; session: Authenticated } | { kind: "invalid" } | { kind: "limited"; retryAfter: number }> {
      const verified = await repository.verifyCredentials(phone, password, ip);
      if (verified.kind !== "valid") return verified;
      const { account } = verified;
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + sessionLengthMs);
      const created = await repository.createSession(account.id, account.phone, account.passwordHash, token, expiresAt, oldToken);
      return created ? { kind: "success", session: { account: publicAccount(account), token, expiresAt } } : { kind: "invalid" };
    },

    async loadSession(token: string | undefined): Promise<Authenticated | undefined> {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
      const row = await repository.findSession(token);
      return row ? { account: publicAccount(row.account), token, expiresAt: row.expiresAt } : undefined;
    },

    async revokeSession(token: string): Promise<void> { await repository.revokeSession(token); },

    assertCanAccessAccount(actor: Pick<Account, "id" | "role">, accountId: string): void {
      if (actor.role !== "admin" && actor.id !== accountId) throw new ForbiddenError();
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
