import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, employees, clients, clientAddresses, employeeWorkIntervals, employeeScheduleExceptions, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";
import { createBookingRepository, assertFutureStart } from "../src/modules/bookings/booking.repository.js";
import { createBookingService } from "../src/modules/bookings/booking.service.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const employeeId = randomUUID(), otherEmployeeId = randomUUID(), clientId = randomUUID(), addressId = randomUUID();
const employeePhone = `+965${randomInt(10000000, 19999999)}`, otherPhone = `+965${randomInt(20000000, 29999999)}`;
const date = "2099-01-05";
type Session = { cookie: string; csrf: string; accountId: string };
let admin: Session, employee: Session, other: Session;
let bookingId: string;
const input = { clientId, addressId, employeeId, date, startTime: "09:00", endTime: "10:00", adultCount: 3, childCount: 0 };
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: response.body.csrfToken as string, accountId: response.body.account.id as string };
}
function post(body: object, session = admin) {
  return request(app).post("/bookings").set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body);
}
function schedule(method: "put" | "delete", path: string, body?: object) {
  const action = request(app)[method](path).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf);
  return body === undefined ? action : action.send(body);
}
beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date();
  const passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values([{ id: employeeId, phone: employeePhone, role: "employee", passwordHash, createdAt: now, updatedAt: now }, { id: otherEmployeeId, phone: otherPhone, role: "employee", passwordHash, createdAt: now, updatedAt: now }]);
  await connection.db.insert(employees).values([{ accountId: employeeId, displayName: "سالم", createdAt: now, updatedAt: now }, { accountId: otherEmployeeId, displayName: "علي", createdAt: now, updatedAt: now }]);
  await connection.db.insert(clients).values({ id: clientId, phone: `+965${randomInt(30000000, 39999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values({ id: addressId, clientId, area: "حولي", block: "3", street: "شارع 5", houseNumber: "12", createdAt: now, updatedAt: now });
  await connection.db.insert(employeeWorkIntervals).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ employeeId, dayOfWeek, startTime: "08:00", endTime: "23:00" })));
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  employee = await signIn(employeePhone, "employee-password-123");
  other = await signIn(otherPhone, "employee-password-123");
});
afterAll(async () => {
  // Booking history prevents accidental production deletes; cleanup is isolated test SQL only.
  const [tables] = await connection.pool.query("SHOW TABLES LIKE 'bookings'");
  if ((tables as unknown[]).length) {
    const [historyTables] = await connection.pool.query("SHOW TABLES LIKE 'booking_visit_events'");
    if ((historyTables as unknown[]).length) await connection.pool.execute("DELETE FROM booking_visit_events WHERE booking_id IN (SELECT id FROM bookings WHERE employee_id = ?)", [employeeId]);
    await connection.pool.execute("DELETE FROM bookings WHERE employee_id = ?", [employeeId]);
  }
  await connection.db.delete(employeeScheduleExceptions).where(eq(employeeScheduleExceptions.employeeId, employeeId));
  await connection.db.delete(employeeWorkIntervals).where(eq(employeeWorkIntervals.employeeId, employeeId));
  await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, clientId));
  await connection.db.delete(clients).where(eq(clients.id, clientId));
  for (const id of [employeeId, otherEmployeeId]) {
    await connection.db.delete(employees).where(eq(employees.accountId, id));
    await connection.db.delete(accounts).where(eq(accounts.id, id));
  }
  await connection.pool.end();
});
describe("manual bookings", () => {
  it("requires administrator authentication, origin, and CSRF for creation", async () => {
    expect((await request(app).get("/bookings")).status).toBe(401);
    expect((await post(input, employee)).status).toBe(403);
    expect((await request(app).post("/bookings").set("Origin", origin).set("Cookie", admin.cookie).send(input)).status).toBe(403);
    expect((await request(app).post("/bookings").set("Origin", "https://attacker.example").set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send(input)).status).toBe(403);
  });
  it("creates one reservation for three haircuts in one hour", async () => {
    const response = await post(input);
    expect(response.status).toBe(201);
    bookingId = response.body.id;
    expect(response.body).not.toHaveProperty("source");
    expect(response.body).toMatchObject({ visitStatus: "booked", timeZone: "Asia/Kuwait", adultCount: 3, childCount: 0 });
    expect(response.body.reference).toMatch(/^J4K-/);
  });
  it("scopes booking list/detail reads to the assigned employee", async () => {
    expect((await request(app).get(`/bookings/${bookingId}`).set("Cookie", employee.cookie)).status).toBe(200);
    expect((await request(app).get(`/bookings/${bookingId}`).set("Cookie", other.cookie)).status).toBe(403);
    const listed = await request(app).get("/bookings").set("Cookie", other.cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.bookings).toEqual([]);
    expect((await request(app).get("/bookings").set("Cookie", employee.cookie)).body.bookings).toEqual(expect.arrayContaining([expect.objectContaining({ id: bookingId })]));
  });
  it("filters the list to one day and barber in start-time order, still scoped to the signed-in employee", async () => {
    const later = await post({ ...input, startTime: "22:00", endTime: "23:00" });
    const otherDay = await post({ ...input, date: "2099-01-06", startTime: "22:00", endTime: "23:00" });
    try {
      expect([later.status, otherDay.status]).toEqual([201, 201]);
      const day = await request(app).get("/bookings").query({ date, employeeId, limit: "100" }).set("Cookie", admin.cookie);
      expect(day.status).toBe(200);
      expect(day.body.bookings.map((booking: { id: string }) => booking.id)).toEqual([bookingId, later.body.id]);
      expect(day.body.total).toBe(2);
      expect(day.body).toMatchObject({ date, employeeId });
      expect((await request(app).get("/bookings").query({ date, employeeId: otherEmployeeId }).set("Cookie", admin.cookie)).body.bookings).toEqual([]);
      expect((await request(app).get("/bookings").query({ date, employeeId }).set("Cookie", other.cookie)).body.bookings).toEqual([]);
      expect((await request(app).get("/bookings").query({ date: "2099-02-30" }).set("Cookie", admin.cookie)).status).toBe(400);
    } finally {
      // Release the extra windows so later tests can reuse them.
      for (const id of [later.body.id, otherDay.body.id].filter(Boolean)) {
        const current = await request(app).get(`/bookings/${id}`).set("Cookie", admin.cookie);
        await request(app).post(`/bookings/${id}/visit`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ status: "cancelled", expectedVersion: current.body.visitVersion });
      }
    }
  });
  it("rejects past starts, invalid counts, outside-hours windows, and another client's address without saving bookings", async () => {
    for (const body of [{ ...input, date: "2000-01-01" }, { ...input, adultCount: 0 }, { ...input, adultCount: -1 }, { ...input, adultCount: 0.5 }, { ...input, endTime: "09:19" }, { ...input, endTime: "13:01" }]) expect((await post(body)).status).toBe(400);
    expect((await post({ ...input, startTime: "07:00", endTime: "08:00" })).status).toBe(409);
    expect((await post({ ...input, addressId: randomUUID() })).status).toBe(404);
    expect((await post({ ...input, clientId: randomUUID() })).status).toBe(404);
  });
  it("rejects overlapping concurrent bookings while accepting adjacent windows", async () => {
    const results = await Promise.all([post({ ...input, startTime: "10:00", endTime: "11:00", adultCount: 1, childCount: 1 }), post({ ...input, startTime: "10:00", endTime: "11:00", adultCount: 1, childCount: 1 })]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect((await post({ ...input, startTime: "11:00", endTime: "12:00" })).status).toBe(201);
    expect((await post({ ...input, startTime: "14:00", endTime: "18:00" })).status).toBe(201);
  });
  it("blocks booked, arrived, and completed visits in eligibility and releases cancelled/no-show visits", async () => {
    for (const [status, eligible] of [["booked", false], ["arrived", false], ["completed", false], ["cancelled", true], ["no_show", true]] as const) {
      await connection.pool.execute("UPDATE bookings SET visit_status = ? WHERE id = ?", [status, bookingId]);
      const response = await request(app).get(`/availability/eligible?date=${date}&startTime=09:00&endTime=10:00`).set("Cookie", admin.cookie);
      expect(response.status).toBe(200);
      expect(response.body.barbers.some((barber: { id: string }) => barber.id === employeeId)).toBe(eligible);
    }
    await connection.pool.execute("UPDATE bookings SET visit_status = 'booked' WHERE id = ?", [bookingId]);
  });
  it("refuses weekly edits and dated closures that exclude blocking bookings and preserves the old hours", async () => {
    const response = await schedule("put", `/schedules/${employeeId}/weekly`, { days: [] });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("SCHEDULE_BOOKING_CONFLICT");
    expect((await schedule("put", `/schedules/${employeeId}/exceptions/${date}`, { intervals: [] })).status).toBe(409);
    const stored = await request(app).get(`/schedules/${employeeId}`).set("Cookie", admin.cookie);
    expect(stored.body.days).toHaveLength(7);
    expect(stored.body.exceptions).toEqual([]);
  });
  it("refuses turning off a weekday that holds a future booking and accepts it when the day stays on", async () => {
    const allDays = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, active: dayOfWeek !== 1, intervals: [{ startTime: "08:00", endTime: "23:00" }] }));
    const off = await schedule("put", `/schedules/${employeeId}/weekly`, { days: allDays });
    expect(off.status).toBe(409);
    expect(off.body.error.code).toBe("SCHEDULE_BOOKING_CONFLICT");
    const on = await schedule("put", `/schedules/${employeeId}/weekly`, { days: allDays.map(day => ({ ...day, active: true })) });
    expect(on.status).toBe(200);
    expect(on.body.days.find((day: { dayOfWeek: number }) => day.dayOfWeek === 1)).toMatchObject({ active: true });
  });
  it("refuses restoring weekly hours when a special-hours booking would no longer fit", async () => {
    const exceptionDate = "2099-01-06";
    expect((await schedule("put", `/schedules/${employeeId}/exceptions/${exceptionDate}`, { intervals: [{ startTime: "06:00", endTime: "23:00" }] })).status).toBe(200);
    expect((await post({ ...input, date: exceptionDate, startTime: "06:00", endTime: "07:00" })).status).toBe(201);
    expect((await schedule("delete", `/schedules/${employeeId}/exceptions/${exceptionDate}`)).status).toBe(409);
  });
  it("lets only the enabled administrator create through the shared creation service", async () => {
    const service = createBookingService(createBookingRepository(connection));
    await expect(service.create(input, employeeId)).rejects.toMatchObject({ status: 403 });
    const created = await service.create({ ...input, startTime: "18:00", endTime: "19:00" }, admin.accountId);
    expect(created).not.toHaveProperty("source");
  });
  it("protects a booking racing with a closure using the same employee lock", async () => {
    const raceDate = "2099-01-08";
    const [created, closed] = await Promise.all([post({ ...input, date: raceDate }), schedule("put", `/schedules/${employeeId}/exceptions/${raceDate}`, { intervals: [] })]);
    expect([[201, 409], [409, 200]]).toContainEqual([created.status, closed.status]);
  });
  it("preserves address, client, and employee snapshots after current records change, without a branch", async () => {
    const before = (await request(app).get(`/bookings/${bookingId}`).set("Cookie", admin.cookie)).body;
    expect(before).not.toHaveProperty("branchId");
    expect(Object.keys(before.employee)).toEqual(["id", "displayName"]);
    await connection.db.update(clientAddresses).set({ street: "شارع جديد" }).where(eq(clientAddresses.id, addressId));
    await connection.db.update(clients).set({ phone: "+96559999998" }).where(eq(clients.id, clientId));
    await connection.db.update(employees).set({ displayName: "اسم جديد" }).where(eq(employees.accountId, employeeId));
    const after = (await request(app).get(`/bookings/${bookingId}`).set("Cookie", admin.cookie)).body;
    expect(after.address).toEqual(before.address);
    expect(after.client).toEqual(before.client);
    expect(after.employee).toEqual(before.employee);
  });
  it("rejects a booking at the current Kuwait minute without an extra lead-time cutoff", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-02T09:00:00Z"));
    expect(() => assertFutureStart({ date: "2026-10-02", startTime: "12:00" })).toThrow(expect.objectContaining({ code: "BOOKING_START_NOT_FUTURE" }));
    expect(() => assertFutureStart({ date: "2026-10-02", startTime: "12:01" })).not.toThrow();
  });
});
