import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, areas, employees, clients, clientAddresses, employeeWorkIntervals, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL), auth = createAuth(connection, env), app = createApp({ auth, connection, env });
const employeeId = randomUUID(), areaId = randomUUID(), suffix = randomInt(100000, 999999);
const employeePhone = `+965${randomInt(70000000, 79999999)}`;
const phones: string[] = [];
const newPhone = () => { const phone = `+965${randomInt(30000000, 39999999)}`; phones.push(phone); return phone; };
const address = { areaId, area: `الفنطاس ${suffix}`, block: "1", street: "2", houseNumber: "3" };
const booking = { employeeId, date: "2099-01-05", startTime: "09:00", endTime: "09:30", adultCount: 0, childCount: 1, amountCash: "5.000", amountLink: "1.000" };
type Session = { cookie: string; csrf: string };
let admin: Session, employee: Session;
async function login(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: response.body.csrfToken as string };
}
const post = (body: object, session = admin) => request(app).post("/bookings/with-client").set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body);
beforeAll(async () => {
  await connection.db.delete(loginAttempts); await auth.initialize(); const now = new Date();
  await connection.db.insert(accounts).values({ id: employeeId, phone: employeePhone, role: "employee", passwordHash: await hashPassword("employee-password-123"), createdAt: now, updatedAt: now });
  await connection.db.insert(employees).values({ accountId: employeeId, displayName: "سالم", createdAt: now, updatedAt: now });
  await connection.db.insert(areas).values({ id: areaId, name: address.area, createdAt: now, updatedAt: now });
  await connection.db.insert(employeeWorkIntervals).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ employeeId, dayOfWeek, startTime: "08:00", endTime: "23:00" })));
  admin = await login(env.ADMIN_PHONE, env.ADMIN_PASSWORD); employee = await login(employeePhone, "employee-password-123");
});
afterAll(async () => {
  await connection.pool.execute("DELETE FROM booking_visit_events WHERE booking_id IN (SELECT id FROM bookings WHERE employee_id = ?)", [employeeId]);
  await connection.pool.execute("DELETE FROM invoices WHERE booking_id IN (SELECT id FROM bookings WHERE employee_id = ?)", [employeeId]);
  await connection.pool.execute("DELETE FROM bookings WHERE employee_id = ?", [employeeId]);
  for (const phone of phones) {
    const [client] = await connection.db.select().from(clients).where(eq(clients.phone, phone));
    if (client) { await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, client.id)); await connection.db.delete(clients).where(eq(clients.id, client.id)); }
  }
  await connection.db.delete(employeeWorkIntervals).where(eq(employeeWorkIntervals.employeeId, employeeId));
  await connection.db.delete(employees).where(eq(employees.accountId, employeeId)); await connection.db.delete(accounts).where(eq(accounts.id, employeeId)); await connection.db.delete(areas).where(eq(areas.id, areaId)); await connection.pool.end();
});
it("protects atomic phone booking with admin, CSRF and origin checks", async () => {
  const body = { ...booking, client: { phone: newPhone(), address } };
  expect((await request(app).post("/bookings/with-client").set("Origin", origin).send(body)).status).toBe(401);
  expect((await post(body, employee)).status).toBe(403);
  expect((await request(app).post("/bookings/with-client").set("Origin", origin).set("Cookie", admin.cookie).send(body)).status).toBe(403);
  expect((await request(app).post("/bookings/with-client").set("Origin", "https://attacker.example").set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send(body)).status).toBe(403);
});
it("saves a phone-only client, address, booking and invoice together, and returns the last-used address on lookup", async () => {
  const phone = newPhone();
  const created = await post({ ...booking, client: { phone, address } });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ client: { phone }, address: { area: address.area }, invoice: { total: "6.000" } });
  const extra = await request(app).post(`/clients/${created.body.clientId}/addresses`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ ...address, street: "جديد" });
  expect(extra.status).toBe(201);
  const lookup = await request(app).get(`/clients/lookup?phone=${encodeURIComponent(phone)}`).set("Cookie", admin.cookie);
  expect(lookup.body.lastUsedAddressId).toBe(created.body.addressId);
  expect((await post({ ...booking, startTime: "10:00", endTime: "10:30", client: { phone, address } })).status).toBe(409);
  const [stored] = await connection.db.select().from(clients).where(eq(clients.phone, phone));
  expect(stored?.phone).toBe(phone);
  await connection.db.update(clients).set({ enabled: false }).where(eq(clients.id, created.body.clientId));
  expect((await request(app).get(`/clients/lookup?phone=${encodeURIComponent(phone)}`).set("Cookie", admin.cookie)).body.enabled).toBe(false);
});
it("rolls back new client and address on an occupied time, invalid window or stopped area", async () => {
  for (const change of [{}, { startTime: "09:00", endTime: "09:10" }, { startTime: "07:00", endTime: "07:30" }]) {
    const phone = newPhone(); const response = await post({ ...booking, ...change, client: { phone, address } });
    expect([400, 409]).toContain(response.status);
    expect(await connection.db.select().from(clients).where(eq(clients.phone, phone))).toHaveLength(0);
  }
  await connection.db.update(areas).set({ enabled: false }).where(eq(areas.id, areaId));
  const phone = newPhone();
  expect((await post({ ...booking, startTime: "12:00", endTime: "12:30", client: { phone, address } })).status).toBe(409);
  expect(await connection.db.select().from(clients).where(eq(clients.phone, phone))).toHaveLength(0);
  await connection.db.update(areas).set({ enabled: true }).where(eq(areas.id, areaId));
});
it("keeps simultaneous bookings for the same phone unique without orphan clients", async () => {
  const phone = newPhone(), body = { ...booking, startTime: "13:00", endTime: "13:30", client: { phone, address } };
  const responses = await Promise.all([post(body), post(body)]);
  expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
  expect(await connection.db.select().from(clients).where(eq(clients.phone, phone))).toHaveLength(1);
});
