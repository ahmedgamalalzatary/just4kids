import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, employees, clients, clientAddresses, employeeWorkIntervals, employeeScheduleExceptions, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const employeeId = randomUUID(), clientId = randomUUID(), addressId = randomUUID();
const employeePhone = `+965${randomInt(40000000, 49999999)}`;
const date = "2099-02-10";
type Session = { cookie: string; csrf: string };
let admin: Session;
let bookingId: string;

async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: response.body.csrfToken as string };
}
function postBooking(body: object) {
  return request(app).post("/bookings").set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ clientId, addressId, employeeId, date, startTime: "09:00", endTime: "09:20", amountCash: "9.000", amountLink: "0.000", ...body });
}
function report(path: string, session: Session) {
  return request(app).get(path).set("Cookie", session.cookie);
}

beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date();
  const passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values({ id: employeeId, phone: employeePhone, role: "employee", passwordHash, createdAt: now, updatedAt: now });
  await connection.db.insert(employees).values({ accountId: employeeId, displayName: "سالم", createdAt: now, updatedAt: now });
  await connection.db.insert(clients).values({ id: clientId, name: "مريم", phone: `+965${randomInt(50000000, 59999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values({ id: addressId, clientId, area: "حولي", block: "3", street: "شارع 5", houseNumber: "12", createdAt: now, updatedAt: now });
  await connection.db.insert(employeeWorkIntervals).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ employeeId, dayOfWeek, startTime: "08:00", endTime: "23:00" })));
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
});
afterAll(async () => {
  await connection.pool.execute("DELETE FROM booking_visit_events WHERE booking_id IN (SELECT id FROM bookings WHERE employee_id = ?)", [employeeId]);
  await connection.pool.execute("DELETE FROM booking_revisions WHERE booking_id IN (SELECT id FROM bookings WHERE employee_id = ?)", [employeeId]);
  await connection.pool.execute("DELETE FROM invoices WHERE booking_id IN (SELECT id FROM bookings WHERE employee_id = ?)", [employeeId]);
  await connection.pool.execute("DELETE FROM bookings WHERE employee_id = ?", [employeeId]);
  await connection.db.delete(employeeScheduleExceptions).where(eq(employeeScheduleExceptions.employeeId, employeeId));
  await connection.db.delete(employeeWorkIntervals).where(eq(employeeWorkIntervals.employeeId, employeeId));
  await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, clientId));
  await connection.db.delete(clients).where(eq(clients.id, clientId));
  await connection.db.delete(employees).where(eq(employees.accountId, employeeId));
  await connection.db.delete(accounts).where(eq(accounts.id, employeeId));
  await connection.pool.end();
});

describe("special-needs children on bookings", () => {
  it("stores the count and prices special children as ordinary children", async () => {
    const created = await postBooking({ startTime: "09:00", endTime: "09:20", adultCount: 0, childCount: 3, specialChildCount: 2 });
    expect(created.status).toBe(201);
    bookingId = created.body.id;
    expect(created.body.specialChildCount).toBe(2);
    expect(created.body.invoice).toMatchObject({ specialChildCount: 2, childCount: 3, amountCash: "9.000", amountLink: "0.000", total: "9.000" });
  });

  it("defaults the count to zero and rejects counts outside 0..childCount", async () => {
    const created = await postBooking({ startTime: "10:00", endTime: "10:20", adultCount: 1, childCount: 0 });
    expect(created.status).toBe(201);
    expect(created.body.specialChildCount).toBe(0);
    for (const patch of [{ childCount: 1, specialChildCount: 2 }, { childCount: 2, specialChildCount: -1 }, { childCount: 2, specialChildCount: 1.5 }]) {
      expect((await postBooking({ startTime: "11:00", endTime: "11:20", adultCount: 1, ...patch })).status).toBe(400);
    }
  });

  it("records the count through an edit and in the revision snapshot", async () => {
    const edited = await request(app).patch(`/bookings/${bookingId}`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ expectedVersion: 0, childCount: 3, specialChildCount: 1 });
    expect(edited.status).toBe(200);
    expect(edited.body.specialChildCount).toBe(1);
    const revisions = await request(app).get(`/bookings/${bookingId}/revisions`).set("Cookie", admin.cookie);
    expect(revisions.status).toBe(200);
    expect(revisions.body.revisions.at(-1).after.specialChildCount).toBe(1);
    expect(revisions.body.revisions.at(-1).before.specialChildCount).toBe(2);
  });

  it("shows special-needs counts next to child counts in the haircut, invoice, and booking reports", async () => {
    const range = `dateBasis=visit_date&from=${date}&to=${date}`;
    const haircuts = await report(`/reports/haircuts?${range}`, admin);
    expect(haircuts.status).toBe(200);
    expect(haircuts.body.totals.reserved).toEqual({ adult: 1, child: 3, special: 1 });
    expect(haircuts.body.totals.completed.special).toBe(0);

    const invoices = await report(`/reports/invoices?${range}`, admin);
    expect(invoices.status).toBe(200);
    expect(invoices.body.invoices.find((entry: { bookingId: string }) => entry.bookingId === bookingId)).toMatchObject({ specialChildCount: 1, childCount: 3 });

    const reservations = await report(`/reports/reservations?${range}`, admin);
    expect(reservations.status).toBe(200);
    expect(reservations.body.bookings.find((entry: { id: string }) => entry.id === bookingId).specialChildCount).toBe(1);
  });
});
