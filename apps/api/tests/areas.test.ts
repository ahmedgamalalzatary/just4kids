import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, clientAddresses, clients, employees, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { createAuth } from "../src/modules/auth/index.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const areaIds: string[] = [], clientIds: string[] = [];
const employeeId = randomUUID(), employeePhone = `+965${randomInt(70000000, 79999999)}`;
const suffix = randomInt(100000, 999999);
const base = { area: "الفنطاس", block: "1", street: "2", houseNumber: "3" };
async function login(phone = env.ADMIN_PHONE, password = env.ADMIN_PASSWORD) {
  const challenge = await request(app).get("/auth/csrf");
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: response.body.csrfToken as string };
}
type Session = Awaited<ReturnType<typeof login>>;
const write = (session: Session, path: string, body: object, method: "post" | "patch" = "post") => request(app)[method](path).set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body);
async function add(session: Session, name: string) {
  const response = await write(session, "/areas", { name });
  expect(response.status).toBe(201);
  areaIds.push(response.body.id);
  return response.body as { id: string; name: string; enabled: boolean };
}
beforeAll(async () => {
  await connection.db.delete(loginAttempts); await auth.initialize();
  const now = new Date();
  await connection.db.insert(accounts).values({ id: employeeId, phone: employeePhone, role: "employee", passwordHash: await hashPassword("employee-password-123"), createdAt: now, updatedAt: now });
  await connection.db.insert(employees).values({ accountId: employeeId, displayName: "سالم", createdAt: now, updatedAt: now });
});
afterAll(async () => {
  for (const id of clientIds) { await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, id)); await connection.db.delete(clients).where(eq(clients.id, id)); }
  for (const id of areaIds) await connection.pool.execute("DELETE FROM areas WHERE id = ?", [id]);
  await connection.db.delete(employees).where(eq(employees.accountId, employeeId)); await connection.db.delete(accounts).where(eq(accounts.id, employeeId)); await connection.pool.end();
});
describe("Arabic area catalogue", () => {
  it("requires admin access, CSRF and the app origin for writes", async () => {
    expect((await request(app).get("/areas")).status).toBe(401);
    const admin = await login(), employee = await login(employeePhone, "employee-password-123");
    expect((await request(app).get("/areas").set("Cookie", employee.cookie)).status).toBe(403);
    expect((await write(employee, "/areas", { name: "الفنطاس" })).status).toBe(403);
    expect((await write(employee, `/areas/${randomUUID()}`, { enabled: false }, "patch")).status).toBe(403);
    expect((await request(app).patch(`/areas/${randomUUID()}`).set("Origin", origin).set("Cookie", admin.cookie).send({ enabled: false })).status).toBe(403);
    expect((await request(app).post("/areas").set("Origin", origin).set("Cookie", admin.cookie).send({ name: "الفنطاس" })).status).toBe(403);
    expect((await request(app).post("/areas").set("Origin", "https://attacker.example").set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ name: "الفنطاس" })).status).toBe(403);
  });
  it("adds, searches, renames, stops and reactivates areas without duplicate names", async () => {
    const admin = await login(), name = `الفنطاس ${suffix}`;
    const area = await add(admin, ` ${name} `);
    expect(area).toMatchObject({ name, enabled: true });
    expect((await write(admin, "/areas", { name })).status).toBe(409);
    for (const body of [{ name: "" }, { name: "a".repeat(121) }, { name, role: "admin" }]) expect((await write(admin, "/areas", body)).status).toBe(400);
    expect((await request(app).get(`/areas?q=${encodeURIComponent(String(suffix))}`).set("Cookie", admin.cookie)).body.areas).toEqual([expect.objectContaining({ id: area.id })]);
    expect((await request(app).get(`/areas?q=${encodeURIComponent(`%${suffix}`)}`).set("Cookie", admin.cookie)).body.areas).toEqual([]);
    const other = await add(admin, `حولي ${suffix}`);
    expect((await write(admin, `/areas/${other.id}`, { name }, "patch")).status).toBe(409);
    expect((await write(admin, `/areas/${area.id}`, { name: `الفنطاس الجديدة ${suffix}`, enabled: false }, "patch")).status).toBe(200);
    expect((await request(app).get(`/areas?status=active&q=${suffix}`).set("Cookie", admin.cookie)).body.areas).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: area.id })]));
    expect((await write(admin, `/areas/${area.id}`, { enabled: true }, "patch")).body.enabled).toBe(true);
    expect((await write(admin, `/areas/${randomUUID()}`, { enabled: false }, "patch")).status).toBe(404);
    expect((await write(admin, `/areas/${area.id}`, {}, "patch")).status).toBe(400);
  });
  it("rechecks selected areas atomically while keeping old free-text addresses unchanged", async () => {
    const admin = await login(), area = await add(admin, `السالمية ${suffix}`);
    const phone = `+965${randomInt(30000000, 39999999)}`;
    const created = await write(admin, "/clients", { phone, address: { ...base, area: area.name, areaId: area.id } });
    expect(created.status).toBe(201); clientIds.push(created.body.id);
    expect(created.body.addresses[0].area).toBe(area.name);
    await write(admin, `/areas/${area.id}`, { name: `اسم جديد ${suffix}`, enabled: false }, "patch");
    expect((await request(app).get(`/clients/${created.body.id}`).set("Cookie", admin.cookie)).body.addresses[0].area).toBe(area.name);
    expect((await write(admin, `/clients/${created.body.id}/addresses`, { ...base, area: area.name, areaId: area.id })).status).toBe(409);
    expect((await write(admin, `/clients/${created.body.id}/addresses/${created.body.addresses[0].id}`, { area: area.name, areaId: area.id }, "patch")).status).toBe(409);
    const failedPhone = `+965${randomInt(40000000, 49999999)}`;
    expect((await write(admin, "/clients", { phone: failedPhone, address: { ...base, area: area.name, areaId: area.id } })).status).toBe(409);
    expect(await connection.db.select().from(clients).where(eq(clients.phone, failedPhone))).toHaveLength(0);
    const addressId = created.body.addresses[0].id;
    expect((await write(admin, `/clients/${created.body.id}/addresses/${addressId}`, { street: "5" }, "patch")).body.area).toBe(area.name);
    await write(admin, `/areas/${area.id}`, { enabled: true }, "patch");
    expect((await write(admin, `/clients/${created.body.id}/addresses`, { ...base, area: area.name, areaId: area.id })).status).toBe(409);
    expect((await write(admin, `/clients/${created.body.id}/addresses`, { ...base, area: `اسم جديد ${suffix}`, areaId: area.id })).status).toBe(201);
    expect((await write(admin, `/clients/${created.body.id}/addresses`, { ...base, areaId: randomUUID() })).status).toBe(409);
  });
});
