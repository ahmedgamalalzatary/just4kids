import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accounts, loginAttempts, sessions } from "@just4kids/db/schema";
import { createDatabase } from "@just4kids/db";
import { createApp } from "../src/app.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword, verifyPassword } from "../src/lib/password.js";
import { createAuth } from "../src/modules/auth/index.js";
import type { AuthModule } from "../src/modules/auth/index.js";

const phone = "+96555551234";
const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: phone, ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);

let auth: AuthModule;
let app: ReturnType<typeof createApp>;

async function login(loginPhone = phone, password = "admin1234") {
  const challenge = await request(app).get("/auth/csrf");
  const challengeCookie = challenge.headers["set-cookie"]?.[0]?.split(";")[0];
  expect(challenge.status).toBe(200);
  expect(challengeCookie).toBeDefined();
  return request(app).post("/auth/login").set("Origin", origin).set("Cookie", challengeCookie ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone: loginPhone, password });
}

function sessionCookie(response: Awaited<ReturnType<typeof login>>): { header: string; cookie: string } {
  const header = (response.headers["set-cookie"] as unknown as string[] | undefined)?.find(value => value.startsWith("j4k_session=")) ?? "";
  return { header, cookie: header.split(";")[0] ?? "" };
}

beforeAll(async () => {
  auth = createAuth(connection, env);
  await auth.initialize();
  app = createApp({ auth });
});

beforeEach(async () => {
  if (!auth) return;
  await connection.db.delete(loginAttempts);
  await connection.db.delete(sessions);
  await auth.initialize();
});

afterAll(async () => {
  await connection.db.delete(accounts).where(eq(accounts.phone, phone));
  await connection.pool.end();
});

describe("administrator authentication", () => {
  it("prevents caching an unauthenticated session response", async () => {
    const response = await request(app).get("/auth/session");
    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("requires an unpredictable login CSRF challenge and the configured origin", async () => {
    const noChallenge = await request(app).post("/auth/login").set("Origin", origin).send({ phone, password: "admin1234" });
    expect(noChallenge.status).toBe(403);
    const challenge = await request(app).get("/auth/csrf");
    const cookie = challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
    const wrongOrigin = await request(app).post("/auth/login").set("Origin", "https://attacker.example").set("Cookie", cookie).set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password: "admin1234" });
    expect(wrongOrigin.status).toBe(403);
    const wrongToken = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", cookie).set("X-CSRF-Token", "b".repeat(64)).send({ phone, password: "admin1234" });
    expect(wrongToken.status).toBe(403);
  });

  it("uses a server-side cookie session without exposing a bearer token or password hash", async () => {
    const response = await login();
    expect(response.status).toBe(200);
    expect(response.body.account).toMatchObject({ phone, role: "admin" });
    expect(response.body.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(response.body.token).toBeUndefined();
    const cookieHeader = sessionCookie(response).header;
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Strict");
    expect(cookieHeader).toContain("Max-Age=604800");
    const cookie = cookieHeader.split(";")[0] ?? "";
    const rawToken = cookie.split("=")[1] ?? "";
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    const sessionRows = await connection.db.select().from(sessions);
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]?.tokenHash).not.toBe(rawToken);
    const accountRows = await connection.db.select().from(accounts).where(eq(accounts.phone, phone));
    expect(accountRows[0]?.passwordHash).not.toBe("admin1234");
    expect(await verifyPassword("admin1234", accountRows[0]?.passwordHash ?? "")).toBe(true);
    const current = await request(app).get("/auth/session").set("Cookie", cookie);
    expect(current.status).toBe(200);
    expect(current.body.account).toMatchObject({ id: response.body.account.id, phone });
    expect(current.headers["cache-control"]).toContain("no-store");
  });

  it("returns one generic error for a wrong password or unknown phone", async () => {
    const wrong = await login(phone, "wrong-password");
    const unknown = await login("+96555550001", "wrong-password");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("enforces logout CSRF and revokes the session immediately", async () => {
    const signedIn = await login();
    const cookie = sessionCookie(signedIn).cookie;
    const rejected = await request(app).post("/auth/logout").set("Origin", origin).set("Cookie", cookie).set("X-CSRF-Token", "0".repeat(64)).send({});
    expect(rejected.status).toBe(403);
    expect((await request(app).get("/auth/session").set("Cookie", cookie)).status).toBe(200);
    const logout = await request(app).post("/auth/logout").set("Origin", origin).set("Cookie", cookie).set("X-CSRF-Token", signedIn.body.csrfToken).send({});
    expect(logout.status).toBe(204);
    expect((await request(app).get("/auth/session").set("Cookie", cookie)).status).toBe(401);
  });

  it("rejects an expired database session even when its cookie is present", async () => {
    const signedIn = await login();
    const cookie = sessionCookie(signedIn).cookie;
    await connection.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1) });
    expect((await request(app).get("/auth/session").set("Cookie", cookie)).status).toBe(401);
  });

  it("updates the sole administrator from environment changes and revokes old sessions", async () => {
    const first = await login();
    const oldCookie = sessionCookie(first).cookie;
    const changed = apiEnvSchema.parse({ ...env, ADMIN_PHONE: "+96555550002", ADMIN_PASSWORD: "different-password" });
    const restarted = createAuth(connection, changed);
    try {
      await restarted.initialize();
      app = createApp({ auth: restarted });
      expect((await request(app).get("/auth/session").set("Cookie", oldCookie)).status).toBe(401);
      expect((await login(phone)).status).toBe(401);
      expect((await login("+96555550002", "different-password")).status).toBe(200);
      expect((await connection.db.select().from(accounts)).filter(row => row.role === "admin")).toHaveLength(1);
    } finally {
      await auth.initialize();
      app = createApp({ auth });
    }
  });

  it("keeps an existing session when the administrator environment is unchanged", async () => {
    const first = await login();
    const cookie = sessionCookie(first).cookie;
    await auth.initialize();
    expect((await request(app).get("/auth/session").set("Cookie", cookie)).status).toBe(200);
  });

  it("limits repeated invalid attempts and rejects a valid password after the limit", async () => {
    for (let attempt = 0; attempt < 5; attempt++) expect((await login(phone, "incorrect-password")).status).toBe(401);
    const blocked = await login(phone);
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("does not spend the IP failure budget on a successful login", async () => {
    expect((await login("+96555550001", "incorrect-password")).status).toBe(401);
    expect((await login("+96555550002", "incorrect-password")).status).toBe(401);
    const [ipCounter] = await connection.db.select().from(loginAttempts).where(eq(loginAttempts.attempts, 2));
    expect(ipCounter).toBeDefined();
    await connection.db.update(loginAttempts).set({ attempts: 29 }).where(eq(loginAttempts.keyHash, ipCounter!.keyHash));
    expect((await login()).status).toBe(200);
    expect((await login(phone, "incorrect-password")).status).toBe(401);
    expect((await login(phone, "incorrect-password")).status).toBe(429);
  });

  it("clears the phone failure budget after a successful login", async () => {
    for (let attempt = 0; attempt < 4; attempt++) expect((await login(phone, "incorrect-password")).status).toBe(401);
    expect((await login()).status).toBe(200);
    for (let attempt = 0; attempt < 5; attempt++) expect((await login(phone, "incorrect-password")).status).toBe(401);
    expect((await login(phone, "incorrect-password")).status).toBe(429);
  });

  it("allows employee sign-in but denies administrator and other-employee access", async () => {
    const firstId = randomUUID();
    const secondId = randomUUID();
    const now = new Date();
    await connection.db.insert(accounts).values([
      { id: firstId, phone: "+96555550003", role: "employee", passwordHash: await hashPassword("employee-pass-1"), createdAt: now, updatedAt: now },
      { id: secondId, phone: "+96555550004", role: "employee", passwordHash: await hashPassword("employee-pass-2"), createdAt: now, updatedAt: now },
    ]);
    try {
      const signedIn = await login("+96555550003", "employee-pass-1");
      expect(signedIn.status).toBe(200);
      expect(signedIn.body.account.role).toBe("employee");
      expect(() => auth.assertCanAccessAccount({ id: firstId, role: "employee" }, firstId)).not.toThrow();
      expect(() => auth.assertCanAccessAccount({ id: firstId, role: "employee" }, secondId)).toThrow(expect.objectContaining({ status: 403, code: "FORBIDDEN" }));
      expect(() => auth.assertCanAccessAccount({ id: firstId, role: "employee" }, "admin-only")).toThrow(expect.objectContaining({ status: 403, code: "FORBIDDEN" }));
    } finally {
      await connection.db.delete(accounts).where(eq(accounts.id, firstId));
      await connection.db.delete(accounts).where(eq(accounts.id, secondId));
    }
  });
});
