import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, clientAddresses, clients, clientStatusEvents, employeeWorkIntervals, employees, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const employeeId = randomUUID();
const employeePhone = `+965${randomInt(70000000, 79999999)}`;
const createdClientIds: string[] = [];
let admin: { cookie: string; csrf: string };

async function signIn(phone: string, password: string) {
  const challenge = await request(app).get("/auth/csrf");
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: response.body.csrfToken as string };
}
async function createClient(phone: string) {
  const response = await request(app).post("/clients").set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
    .send({ phone, address: { area: "حولي", block: "3", street: "شارع 5", houseNumber: "12" } });
  expect(response.status).toBe(201);
  createdClientIds.push(response.body.id);
  return response.body;
}
function setStatus(id: string, body: object) {
  return request(app).patch(`/clients/${id}/status`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send(body);
}

beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date();
  await connection.db.insert(accounts).values({ id: employeeId, phone: employeePhone, role: "employee", passwordHash: await hashPassword("employee-password-123"), createdAt: now, updatedAt: now });
  await connection.db.insert(employees).values({ accountId: employeeId, displayName: "سالم", createdAt: now, updatedAt: now });
  await connection.db.insert(employeeWorkIntervals).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ employeeId, dayOfWeek, startTime: "08:00", endTime: "23:00" })));
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
});
afterAll(async () => {
  await connection.pool.execute("DELETE FROM booking_visit_events WHERE booking_id IN (SELECT id FROM bookings WHERE employee_id = ?)", [employeeId]);
  await connection.pool.execute("DELETE FROM bookings WHERE employee_id = ?", [employeeId]);
  await connection.db.delete(employeeWorkIntervals).where(eq(employeeWorkIntervals.employeeId, employeeId));
  for (const id of createdClientIds) {
    await connection.db.delete(clientStatusEvents).where(eq(clientStatusEvents.clientId, id));
    await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, id));
    await connection.db.delete(clients).where(eq(clients.id, id));
  }
  await connection.db.delete(employees).where(eq(employees.accountId, employeeId));
  await connection.db.delete(accounts).where(eq(accounts.id, employeeId));
  await connection.pool.end();
});

describe("client active/stopped status", () => {
  it("stops and reactivates a client with a recorded reason and filters the list", async () => {
    const client = await createClient(`+965${randomInt(60000000, 60999999)}`);
    expect(client.enabled).toBe(true);

    const stopped = await setStatus(client.id, { enabled: false, reason: "طلب العميل" });
    expect(stopped.status).toBe(200);
    expect(stopped.body.enabled).toBe(false);

    expect((await request(app).get("/clients?status=stopped").set("Cookie", admin.cookie)).body.clients).toEqual(expect.arrayContaining([expect.objectContaining({ id: client.id })]));
    expect((await request(app).get("/clients?status=active").set("Cookie", admin.cookie)).body.clients).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: client.id })]));
    expect((await request(app).get(`/clients/${client.id}`).set("Cookie", admin.cookie)).body.enabled).toBe(false);

    const events = await request(app).get(`/clients/${client.id}/status-events`).set("Cookie", admin.cookie);
    expect(events.status).toBe(200);
    expect(events.body.events).toHaveLength(1);
    expect(events.body.events[0]).toMatchObject({ enabled: false, previousEnabled: true, reason: "طلب العميل" });

    const reactivated = await setStatus(client.id, { enabled: true, reason: "عاد للطلب" });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.enabled).toBe(true);
    expect((await request(app).get(`/clients/${client.id}/status-events`).set("Cookie", admin.cookie)).body.events).toHaveLength(2);
  });

  it("requires the administrator, CSRF, a reason, and an actual change", async () => {
    const client = await createClient(`+965${randomInt(61000000, 61999999)}`);
    expect((await request(app).patch(`/clients/${client.id}/status`).set("Origin", origin).set("Cookie", admin.cookie).send({ enabled: false, reason: "x" })).status).toBe(403);
    expect((await setStatus(client.id, { enabled: false, reason: "  " })).status).toBe(400);
    expect((await setStatus(client.id, { enabled: true, reason: "بلا تغيير" })).status).toBe(409);
  });

  it("blocks new bookings for a stopped client while leaving existing bookings untouched", async () => {
    const client = await createClient(`+965${randomInt(62000000, 62999999)}`);
    const addressId = (await request(app).get(`/clients/${client.id}`).set("Cookie", admin.cookie)).body.addresses[0].id;
    const booking = { clientId: client.id, addressId, employeeId, date: "2099-03-10", startTime: "09:00", endTime: "09:20", adultCount: 1, childCount: 0 };
    const created = await request(app).post("/bookings").set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send(booking);
    expect(created.status).toBe(201);

    expect((await setStatus(client.id, { enabled: false, reason: "موقوف" })).status).toBe(200);
    const blocked = await request(app).post("/bookings").set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ ...booking, startTime: "10:00", endTime: "10:20" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("CLIENT_DISABLED");
    expect((await request(app).get(`/bookings/${created.body.id}`).set("Cookie", admin.cookie)).status).toBe(200);
  });
});
