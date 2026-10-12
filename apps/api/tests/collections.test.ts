import { randomInt, randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, barberCollectionEvents, barberCollections, employees, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL), auth = createAuth(connection, env), app = createApp({ auth, connection, env });
const barberA = randomUUID(), barberB = randomUUID();
const phoneA = `+965${randomInt(80000000, 84999999)}`, phoneB = `+965${randomInt(85000000, 89999999)}`;
type Session = { cookie: string; csrf: string; id: string };
let admin: Session, sessionA: Session, sessionB: Session;
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const login = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(login.status).toBe(200);
  return { cookie: (login.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: login.body.csrfToken as string, id: login.body.account.id as string };
}
function write(method: "post" | "patch", path: string, body: object, session = admin) { return request(app)[method](path).set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body); }
const entry = (employeeId: string, overrides: object = {}) => ({ employeeId, date: "2099-08-01", normalChildren: 2, specialChildren: 1, cash: "5.000", link: "1.000", knet: "2.000", ...overrides });
beforeAll(async () => {
  await connection.db.delete(loginAttempts); await auth.initialize();
  const now = new Date(), passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values([{ id: barberA, phone: phoneA, role: "employee", passwordHash, createdAt: now, updatedAt: now }, { id: barberB, phone: phoneB, role: "employee", passwordHash, createdAt: now, updatedAt: now }]);
  await connection.db.insert(employees).values([{ accountId: barberA, displayName: "حلاق أ" }, { accountId: barberB, displayName: "حلاق ب" }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD); sessionA = await signIn(phoneA, "employee-password-123"); sessionB = await signIn(phoneB, "employee-password-123");
});
afterAll(async () => {
  await connection.db.delete(barberCollectionEvents).where(inArray(barberCollectionEvents.entryId, (await connection.db.select({ id: barberCollections.id }).from(barberCollections).where(inArray(barberCollections.employeeId, [barberA, barberB]))).map(row => row.id)));
  await connection.db.delete(barberCollections).where(inArray(barberCollections.employeeId, [barberA, barberB]));
  await connection.db.delete(employees).where(inArray(employees.accountId, [barberA, barberB]));
  await connection.db.delete(accounts).where(inArray(accounts.id, [barberA, barberB]));
  await connection.pool.end();
});
describe("barber daily collections", () => {
  it("lets the administrator record one entry per barber per day and computes the total", async () => {
    const created = await write("post", "/collections", entry(barberA));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ employeeId: barberA, displayName: "حلاق أ", date: "2099-08-01", normalChildren: 2, specialChildren: 1, cash: "5.000", link: "1.000", knet: "2.000", total: "8.000", version: 0 });
    const duplicate = await write("post", "/collections", entry(barberA, { date: "2099-08-01" }));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("BARBER_COLLECTION_EXISTS");
  });
  it("requires the administrator and CSRF for writes and rejects a caller-controlled total", async () => {
    expect((await write("post", "/collections", entry(barberB), sessionA)).status).toBe(403);
    expect((await request(app).post("/collections").set("Origin", origin).set("Cookie", admin.cookie).send(entry(barberB))).status).toBe(403);
    expect((await write("post", "/collections", { ...entry(barberB), total: "0.000" })).status).toBe(400);
    expect((await write("post", "/collections", entry(randomUUID()))).status).toBe(404);
  });
  it("lets a barber read only their own entries and denies another barber's writes", async () => {
    await write("post", "/collections", entry(barberB, { date: "2099-08-02" }));
    const own = await request(app).get("/collections").query({ from: "2099-08-01", to: "2099-08-31" }).set("Cookie", sessionA.cookie);
    expect(own.status).toBe(200);
    expect(own.body.entries.map((row: { employeeId: string }) => row.employeeId)).toEqual([barberA]);
    // A barber-scoped filter cannot widen the scope to another barber.
    const scoped = await request(app).get("/collections").query({ employeeId: barberB }).set("Cookie", sessionA.cookie);
    expect(scoped.body.entries.map((row: { employeeId: string }) => row.employeeId)).toEqual([barberA]);
    const other = await request(app).get("/collections").set("Cookie", sessionB.cookie);
    expect(other.body.entries.map((row: { employeeId: string }) => row.employeeId)).toEqual([barberB]);
  });
  it("sums the period's collections and keeps history", async () => {
    const listed = await request(app).get("/collections").query({ from: "2099-08-01", to: "2099-08-31" }).set("Cookie", admin.cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.totals).toEqual({ normalChildren: 4, specialChildren: 2, cash: "10.000", link: "2.000", knet: "4.000", total: "16.000" });
    const id = listed.body.entries.find((row: { employeeId: string }) => row.employeeId === barberA).id;
    const updated = await write("patch", `/collections/${id}`, { expectedVersion: 0, cash: "6.000" });
    expect(updated.status).toBe(200);
    expect(updated.body.total).toBe("9.000");
    expect((await write("patch", `/collections/${id}`, { expectedVersion: 0, cash: "7.000" })).status).toBe(409);
    const history = await request(app).get(`/collections/${id}/history`).set("Cookie", admin.cookie);
    expect(history.status).toBe(200);
    expect(history.body.events).toHaveLength(2);
    expect(history.body.events[1]).toMatchObject({ after: { cash: "6.000", total: "9.000" }, before: { cash: "5.000", total: "8.000" } });
  });
});
