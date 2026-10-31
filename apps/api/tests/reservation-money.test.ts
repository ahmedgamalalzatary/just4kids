import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, barberCollections, clientAddresses, clients, employeeWorkIntervals, employees, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL), auth = createAuth(connection, env), app = createApp({ auth, connection, env });
const employeeId = randomUUID(), clientId = randomUUID(), addressId = randomUUID();
const employeePhone = `+965${randomInt(40000000, 49999999)}`;
const date = "2099-01-05";
type Session = { cookie: string; csrf: string; id: string };
let admin: Session;
const input = { clientId, addressId, employeeId, date, startTime: "09:00", endTime: "10:00", adultCount: 1, childCount: 0, specialChildCount: 0 };
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const login = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(login.status).toBe(200);
  return { cookie: (login.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: login.body.csrfToken as string, id: login.body.account.id as string };
}
function post(body: object) { return request(app).post("/bookings").set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send(body); }
beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  const now = new Date(), passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values({ id: employeeId, phone: employeePhone, role: "employee", passwordHash, createdAt: now, updatedAt: now });
  await connection.db.insert(employees).values({ accountId: employeeId, displayName: "سالم", createdAt: now, updatedAt: now });
  await connection.db.insert(clients).values({ id: clientId, phone: `+965${randomInt(50000000, 59999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values({ id: addressId, clientId, area: "حولي", block: "3", street: "شارع 5", houseNumber: "12", createdAt: now, updatedAt: now });
  await connection.db.insert(employeeWorkIntervals).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ employeeId, dayOfWeek, startTime: "08:00", endTime: "23:00" })));
  await connection.db.insert(barberCollections).values({ id: randomUUID(), employeeId, date, normalChildren: 2, specialChildren: 0, cash: "5.000", link: "1.000", knet: "2.000", total: "8.000", enteredBy: admin.id, createdAt: now, updatedAt: now });
});
afterAll(async () => {
  await connection.pool.execute("DELETE FROM booking_visit_events WHERE booking_id IN (SELECT id FROM bookings WHERE employee_id = ?)", [employeeId]);
  await connection.pool.execute("DELETE FROM bookings WHERE employee_id = ?", [employeeId]);
  await connection.db.delete(barberCollections).where(eq(barberCollections.employeeId, employeeId));
  await connection.db.delete(employeeWorkIntervals).where(eq(employeeWorkIntervals.employeeId, employeeId));
  await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, clientId));
  await connection.db.delete(clients).where(eq(clients.id, clientId));
  await connection.db.delete(employees).where(eq(employees.accountId, employeeId));
  await connection.db.delete(accounts).where(eq(accounts.id, employeeId));
  await connection.pool.end();
});
describe("reservations without money", () => {
  it("rejects caller-supplied money fields and never returns an invoice", async () => {
    expect((await post({ ...input, amountCash: "5.000" })).status).toBe(400);
    expect((await post({ ...input, amountLink: "0.000" })).status).toBe(400);
    const created = await post(input);
    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty("invoice");
    const detail = await request(app).get(`/bookings/${created.body.id}`).set("Cookie", admin.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body).not.toHaveProperty("invoice");
    for (const [method, path] of [["post", `/bookings/${created.body.id}/payment`], ["post", `/bookings/${created.body.id}/payment/undo`], ["get", `/bookings/${created.body.id}/payments`], ["get", `/bookings/${created.body.id}/invoice`], ["get", "/reports/invoices"]] as const) {
      expect((await request(app)[method](path).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)).status).toBe(404);
    }
  });
  it("keeps the barber and comprehensive reports' collection money", async () => {
    const barbers = await request(app).get("/reports/employees").query({ from: date, to: date }).set("Cookie", admin.cookie);
    expect(barbers.status).toBe(200);
    const person = barbers.body.employees.find((row: { employeeId: string }) => row.employeeId === employeeId);
    expect(person.cash).toEqual({ count: 1, total: "8.000", byMethod: { cash: { count: 1, total: "5.000" }, link: { count: 1, total: "1.000" }, knet: { count: 1, total: "2.000" } } });
    expect(person.invoices).toBeUndefined();
    expect(person.cash.total).toBe("8.000");
    const comprehensive = await request(app).get("/reports/comprehensive").query({ from: date, to: date }).set("Cookie", admin.cookie);
    expect(comprehensive.status).toBe(200);
    expect(comprehensive.body.totals.collected).toEqual({ count: 1, total: "8.000" });
  });
});
