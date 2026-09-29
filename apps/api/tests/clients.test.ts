import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, branches, clientAddresses, clients, employees, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";
import { createAuth } from "../src/modules/auth/index.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const branchId = randomUUID();
const employeeId = randomUUID();
const employeePhone = `+965${randomInt(70000000, 79999999)}`;
const phoneA = `+965${randomInt(30000000, 39999999)}`;
const phoneB = `+965${randomInt(40000000, 49999999)}`;
const phoneC = `+965${randomInt(60000000, 69999999)}`;
const createdIds: string[] = [];
const baseAddress = { area: "حولي", block: "3", street: "شارع 5", houseNumber: "12" };

async function signIn(phone: string, password: string) {
  const challenge = await request(app).get("/auth/csrf");
  const preloginCookie = challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", preloginCookie).set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))?.split(";")[0] ?? "", csrf: response.body.csrfToken as string };
}

async function createClient(session: { cookie: string; csrf: string }, phone: string) {
  const response = await request(app).post("/clients").set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf)
    .send({ name: "مريم", phone, address: baseAddress });
  expect(response.status).toBe(201);
  createdIds.push(response.body.id);
  return response.body as { id: string; addresses: { id: string }[] };
}

beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date();
  await connection.db.insert(branches).values({ id: branchId, name: "حولي", location: "شارع 1", adultPrice: "5.000", childPrice: "3.000", adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now });
  await connection.db.insert(accounts).values({ id: employeeId, phone: employeePhone, role: "employee", passwordHash: await hashPassword("employee-password-123"), createdAt: now, updatedAt: now });
  await connection.db.insert(employees).values({ accountId: employeeId, branchId, displayName: "سالم", createdAt: now, updatedAt: now });
});
afterAll(async () => {
  for (const id of createdIds) {
    await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, id));
    await connection.db.delete(clients).where(eq(clients.id, id));
  }
  await connection.db.delete(employees).where(eq(employees.accountId, employeeId));
  await connection.db.delete(accounts).where(eq(accounts.id, employeeId));
  await connection.db.delete(branches).where(eq(branches.id, branchId));
  await connection.pool.end();
});

describe("clients and reusable visit addresses", () => {
  it("denies unauthenticated and employee access and requires CSRF for admin writes", async () => {
    expect((await request(app).get("/clients")).status).toBe(401);
    const employee = await signIn(employeePhone, "employee-password-123");
    expect((await request(app).get("/clients").set("Cookie", employee.cookie)).status).toBe(403);
    expect((await request(app).post("/clients").set("Origin", origin).set("Cookie", employee.cookie).set("X-CSRF-Token", employee.csrf).send({ name: "مريم", phone: phoneA, address: baseAddress })).status).toBe(403);
    const admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
    expect((await request(app).post("/clients").set("Origin", origin).set("Cookie", admin.cookie).send({ name: "مريم", phone: phoneA, address: baseAddress })).status).toBe(403);
  });

  it("atomically creates a client and address, supports search and phone lookup, and rejects duplicate phones", async () => {
    const admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
    const created = await request(app).post("/clients").set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ name: " مريم ", phone: phoneA, address: { ...baseAddress, floor: "2", latitude: "29.3375000", longitude: "47.9333000" } });
    expect(created.status).toBe(201);
    createdIds.push(created.body.id);
    expect(created.body).toMatchObject({ name: "مريم", phone: phoneA, addresses: [{ area: "حولي", block: "3", street: "شارع 5", houseNumber: "12", floor: "2", latitude: "29.3375000", longitude: "47.9333000" }] });
    const stored = await connection.db.select().from(clientAddresses).where(eq(clientAddresses.clientId, created.body.id));
    expect(stored).toHaveLength(1);
    const found = await request(app).get(`/clients/lookup?phone=${encodeURIComponent(phoneA)}`).set("Cookie", admin.cookie);
    expect(found.status).toBe(200);
    expect(found.body.id).toBe(created.body.id);
    const listed = await request(app).get(`/clients?q=${encodeURIComponent(phoneA)}&limit=1&offset=0`).set("Cookie", admin.cookie);
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ total: 1, limit: 1, offset: 0, clients: [{ id: created.body.id, phone: phoneA }] });
    const literalWildcard = await request(app).get(`/clients?q=${encodeURIComponent(`%${phoneA.slice(-4)}`)}`).set("Cookie", admin.cookie);
    expect(literalWildcard.status).toBe(200);
    expect(literalWildcard.body.clients).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id })]));
    const duplicate = await request(app).post("/clients").set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ name: "أخرى", phone: phoneA, address: baseAddress });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("PHONE_ALREADY_USED");
    expect(await connection.db.select().from(clientAddresses).where(eq(clientAddresses.clientId, created.body.id))).toHaveLength(1);
  });

  it("adds and edits addresses only under the correct client and validates merged address fields", async () => {
    const admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
    const first = await createClient(admin, phoneB);
    const second = await createClient(admin, phoneC);
    const added = await request(app).post(`/clients/${first.id}/addresses`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ area: "السالمية", block: "4", street: "شارع البحر", buildingName: "برج السلام", mapsUrl: "https://maps.app.goo.gl/AbCd123" });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ clientId: first.id, buildingName: "برج السلام", houseNumber: null });
    const crossClient = await request(app).patch(`/clients/${second.id}/addresses/${added.body.id}`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ floor: "5" });
    expect(crossClient.status).toBe(404);
    const updated = await request(app).patch(`/clients/${first.id}/addresses/${added.body.id}`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ floor: " 5 ", apartment: "8", mapsUrl: null });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ floor: "5", apartment: "8", mapsUrl: null });
    const invalid = await request(app).patch(`/clients/${first.id}/addresses/${added.body.id}`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ buildingName: null });
    expect(invalid.status).toBe(400);
    const detail = await request(app).get(`/clients/${first.id}`).set("Cookie", admin.cookie);
    expect(detail.body.addresses).toHaveLength(2);
    expect(detail.body.addresses).toEqual(expect.arrayContaining([expect.objectContaining({ id: added.body.id, buildingName: "برج السلام" })]));
  });

  it("updates client identity without changing its stable ID or accepting a duplicate phone", async () => {
    const admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
    const client = await createClient(admin, `+965${randomInt(80000000, 89999999)}`);
    const otherPhone = `+965${randomInt(20000000, 29999999)}`;
    await createClient(admin, otherPhone);
    const changed = await request(app).patch(`/clients/${client.id}`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ phone: `+965${randomInt(90000000, 99999999)}`, name: "مريم جديدة" });
    expect(changed.status).toBe(200);
    expect(changed.body.id).toBe(client.id);
    expect(changed.body.name).toBe("مريم جديدة");
    const duplicate = await request(app).patch(`/clients/${client.id}`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ phone: otherPhone });
    expect(duplicate.status).toBe(409);
    expect((await request(app).get(`/clients/${client.id}`).set("Cookie", admin.cookie)).body.name).toBe("مريم جديدة");
  });
});
