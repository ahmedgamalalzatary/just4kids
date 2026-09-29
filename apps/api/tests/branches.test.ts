import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { branches, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { createAuth } from "../src/modules/auth/index.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const createdBranchIds: string[] = [];

async function adminSession() {
  const challenge = await request(app).get("/auth/csrf");
  const preloginCookie = challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const login = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", preloginCookie).set("X-CSRF-Token", challenge.body.csrfToken)
    .send({ phone: env.ADMIN_PHONE, password: env.ADMIN_PASSWORD });
  expect(login.status).toBe(200);
  const cookie = (login.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))?.split(";")[0] ?? "";
  return { cookie, csrf: login.body.csrfToken as string };
}

beforeAll(async () => { await connection.db.delete(loginAttempts); await auth.initialize(); });
afterAll(async () => {
  for (const id of createdBranchIds) await connection.db.delete(branches).where(eq(branches.id, id));
  await connection.pool.end();
});

describe("branch management", () => {
  it("requires administrator authentication and a session-bound CSRF token for changes", async () => {
    expect((await request(app).get("/branches")).status).toBe(401);
    const session = await adminSession();
    const body = { name: "حولي", location: "شارع 1", adultPrice: "5.125", childPrice: "3", adultDurationMinutes: 20, childDurationMinutes: 20 };
    const missingCsrf = await request(app).post("/branches").set("Origin", origin).set("Cookie", session.cookie).send(body);
    expect(missingCsrf.status).toBe(403);
    const wrongOrigin = await request(app).post("/branches").set("Origin", "https://attacker.example").set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body);
    expect(wrongOrigin.status).toBe(403);
  });

  it("creates, lists, and updates a branch with exact KWD prices", async () => {
    const session = await adminSession();
    const created = await request(app).post("/branches").set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf)
      .send({ name: " حولي ", location: "شارع 1", adultPrice: "5.125", childPrice: "3", adultDurationMinutes: 20, childDurationMinutes: 25 });
    expect(created.status).toBe(201);
    createdBranchIds.push(created.body.id);
    expect(created.body).toMatchObject({ name: "حولي", location: "شارع 1", adultPrice: "5.125", childPrice: "3.000", adultDurationMinutes: 20, childDurationMinutes: 25 });
    expect(created.body.passwordHash).toBeUndefined();
    const [stored] = await connection.db.select().from(branches).where(eq(branches.id, created.body.id));
    expect(stored?.adultPrice).toBe("5.125");
    expect(stored?.childPrice).toBe("3.000");
    const listed = await request(app).get("/branches").set("Cookie", session.cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.branches).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id })]));
    const updated = await request(app).patch(`/branches/${created.body.id}`).set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf)
      .send({ childPrice: "3.25", location: "شارع 2" });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ childPrice: "3.250", location: "شارع 2", adultPrice: "5.125" });
    expect((await request(app).get(`/branches/${created.body.id}`).set("Cookie", session.cookie)).body.childPrice).toBe("3.250");
  });

  it("rejects malformed prices and unsupported branch fields", async () => {
    const session = await adminSession();
    const base = { name: "حولي", location: "شارع 1", adultPrice: "5.000", childPrice: "3.000", adultDurationMinutes: 20, childDurationMinutes: 20 };
    for (const body of [{ ...base, adultPrice: "5.0001" }, { ...base, role: "admin" }, { ...base, adultDurationMinutes: 0 }]) {
      const response = await request(app).post("/branches").set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body);
      expect(response.status).toBe(400);
    }
  });
});
