import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, branches, employees, clients, clientAddresses, employeeWorkIntervals, employeeScheduleExceptions, loginAttempts } from "@just4kids/db/schema";
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
const branchId = randomUUID(), transferBranchId = randomUUID(), employeeId = randomUUID(), otherEmployeeId = randomUUID(), clientId = randomUUID(), addressId = randomUUID();
const employeePhone = `+965${randomInt(10000000, 19999999)}`, otherPhone = `+965${randomInt(20000000, 29999999)}`;
const date = "2099-01-05";
type Session = { cookie: string; csrf: string; accountId: string };
let admin: Session, employee: Session, other: Session;
let bookingId: string;
const input = { clientId, addressId, employeeId, date, startTime: "09:00", endTime: "09:20", adultCount: 3, childCount: 0 };
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
  await connection.db.insert(branches).values({ id: branchId, name: "فرع الاختبار", location: "حولي", adultPrice: "5.125", childPrice: "3.001", adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now });
  await connection.db.insert(branches).values({ id: transferBranchId, name: "فرع آخر", location: "السالمية", adultPrice: "9.000", childPrice: "7.000", adultDurationMinutes: 30, childDurationMinutes: 30, createdAt: now, updatedAt: now });
  const passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values([{ id: employeeId, phone: employeePhone, role: "employee", passwordHash, createdAt: now, updatedAt: now }, { id: otherEmployeeId, phone: otherPhone, role: "employee", passwordHash, createdAt: now, updatedAt: now }]);
  await connection.db.insert(employees).values([{ accountId: employeeId, branchId, displayName: "سالم", createdAt: now, updatedAt: now }, { accountId: otherEmployeeId, branchId, displayName: "علي", createdAt: now, updatedAt: now }]);
  await connection.db.insert(clients).values({ id: clientId, name: "مريم", phone: `+965${randomInt(30000000, 39999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values({ id: addressId, clientId, area: "حولي", block: "3", street: "شارع 5", houseNumber: "12", createdAt: now, updatedAt: now });
  await connection.db.insert(employeeWorkIntervals).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ employeeId, dayOfWeek, startTime: "08:00", endTime: "23:00" })));
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  employee = await signIn(employeePhone, "employee-password-123");
  other = await signIn(otherPhone, "employee-password-123");
});
afterAll(async () => {
  // Invoice history prevents accidental production deletes; cleanup is isolated test SQL only.
  const [tables] = await connection.pool.query("SHOW TABLES LIKE 'bookings'");
  if ((tables as unknown[]).length) {
    await connection.pool.execute("DELETE FROM invoices WHERE booking_id IN (SELECT id FROM bookings WHERE employee_id = ?)", [employeeId]);
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
  await connection.db.delete(branches).where(eq(branches.id, branchId));
  await connection.db.delete(branches).where(eq(branches.id, transferBranchId));
  await connection.pool.end();
});
describe("manual bookings and initial invoices", () => {
  it("requires administrator authentication, origin, and CSRF for creation", async () => {
    expect((await request(app).get("/bookings")).status).toBe(401);
    expect((await post(input, employee)).status).toBe(403);
    expect((await request(app).post("/bookings").set("Origin", origin).set("Cookie", admin.cookie).send(input)).status).toBe(403);
    expect((await request(app).post("/bookings").set("Origin", "https://attacker.example").set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send(input)).status).toBe(403);
  });
  it("creates one reservation and combined exact invoice for three haircuts in 20 minutes", async () => {
    const response = await post(input);
    expect(response.status).toBe(201);
    bookingId = response.body.id;
    expect(response.body).toMatchObject({ source: "manual", visitStatus: "booked", timeZone: "Asia/Kuwait", adultCount: 3, childCount: 0, invoice: { currency: "KWD", status: "issued", paymentStatus: "unpaid", adultUnitPrice: "5.125", adultAmount: "15.375", childAmount: "0.000", total: "15.375" } });
    expect(response.body.reference).toMatch(/^J4K-/);
    expect(response.body.invoice.bookingId).toBe(bookingId);
    const [rows] = await connection.pool.execute("SELECT COUNT(*) AS n FROM invoices WHERE booking_id = ?", [bookingId]);
    expect(rows).toMatchObject([{ n: 1 }]);
  });
  it("scopes booking and invoice list/detail reads to the assigned employee", async () => {
    expect((await request(app).get(`/bookings/${bookingId}`).set("Cookie", employee.cookie)).status).toBe(200);
    const ownInvoice = await request(app).get(`/bookings/${bookingId}/invoice`).set("Cookie", employee.cookie);
    expect(ownInvoice.status).toBe(200);
    expect(ownInvoice.body.total).toBe("15.375");
    expect((await request(app).get(`/bookings/${bookingId}`).set("Cookie", other.cookie)).status).toBe(403);
    expect((await request(app).get(`/bookings/${bookingId}/invoice`).set("Cookie", other.cookie)).status).toBe(403);
    const listed = await request(app).get("/bookings").set("Cookie", other.cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.bookings).toEqual([]);
    expect((await request(app).get("/bookings").set("Cookie", employee.cookie)).body.bookings).toEqual(expect.arrayContaining([expect.objectContaining({ id: bookingId })]));
  });
  it("rejects past starts, invalid counts, outside-hours windows, and another client's address without saving bookings", async () => {
    for (const body of [{ ...input, date: "2000-01-01" }, { ...input, adultCount: 0 }, { ...input, adultCount: -1 }, { ...input, adultCount: 0.5 }, { ...input, endTime: "09:19" }, { ...input, endTime: "13:01" }]) expect((await post(body)).status).toBe(400);
    expect((await post({ ...input, startTime: "07:00", endTime: "07:20" })).status).toBe(409);
    expect((await post({ ...input, addressId: randomUUID() })).status).toBe(404);
    expect((await post({ ...input, clientId: randomUUID() })).status).toBe(404);
  });
  it("rejects overlapping concurrent bookings while accepting adjacent windows", async () => {
    const results = await Promise.all([post({ ...input, startTime: "10:00", endTime: "10:20", adultCount: 1, childCount: 1 }), post({ ...input, startTime: "10:00", endTime: "10:20", adultCount: 1, childCount: 1 })]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(results.find(result => result.status === 201)!.body.invoice.total).toBe("8.126");
    expect((await post({ ...input, startTime: "10:20", endTime: "10:40" })).status).toBe(201);
    expect((await post({ ...input, startTime: "14:00", endTime: "18:00" })).status).toBe(201);
  });
  it("blocks booked, arrived, and completed visits in eligibility and releases cancelled/no-show visits", async () => {
    for (const [status, eligible] of [["booked", false], ["arrived", false], ["completed", false], ["cancelled", true], ["no_show", true]] as const) {
      await connection.pool.execute("UPDATE bookings SET visit_status = ? WHERE id = ?", [status, bookingId]);
      const response = await request(app).get(`/availability/eligible?date=${date}&startTime=09:00&endTime=09:20`).set("Cookie", admin.cookie);
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
  it("refuses restoring weekly hours when a special-hours booking would no longer fit", async () => {
    const exceptionDate = "2099-01-06";
    expect((await schedule("put", `/schedules/${employeeId}/exceptions/${exceptionDate}`, { intervals: [{ startTime: "06:00", endTime: "23:00" }] })).status).toBe(200);
    expect((await post({ ...input, date: exceptionDate, startTime: "06:00", endTime: "06:20" })).status).toBe(201);
    expect((await schedule("delete", `/schedules/${employeeId}/exceptions/${exceptionDate}`)).status).toBe(409);
  });
  it("rolls back the reservation if invoice persistence fails", async () => {
    const trigger = `verification_${randomUUID().replaceAll("-", "")}`;
    await connection.pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON invoices FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'verification invoice failure'`);
    try {
      expect((await post({ ...input, startTime: "19:00", endTime: "19:20" })).status).toBe(500);
      const [rows] = await connection.pool.execute("SELECT COUNT(*) AS n FROM bookings WHERE employee_id = ? AND start_time = '19:00'", [employeeId]);
      expect(rows).toMatchObject([{ n: 0 }]);
    } finally { await connection.pool.query(`DROP TRIGGER ${trigger}`); }
  });
  it("enforces trusted AI source and sender-scoped client identity in the shared creation service", async () => {
    const service = createBookingService(createBookingRepository(connection));
    await expect(service.create(input, { kind: "whatsapp", accountId: admin.accountId, clientId: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await expect(service.create(input, { kind: "administrator", accountId: employeeId })).rejects.toMatchObject({ status: 403 });
    const created = await service.create({ ...input, startTime: "11:00", endTime: "11:20" }, { kind: "whatsapp", accountId: admin.accountId, clientId });
    expect(created.source).toBe("ai");
    expect(created.invoice.total).toBe("15.375");
  });
  it("protects a booking racing with a closure using the same employee lock", async () => {
    const raceDate = "2099-01-08";
    const [created, closed] = await Promise.all([post({ ...input, date: raceDate }), schedule("put", `/schedules/${employeeId}/exceptions/${raceDate}`, { intervals: [] })]);
    expect([[201, 409], [409, 200]]).toContainEqual([created.status, closed.status]);
  });
  it("keeps large KWD totals exact and enforces one invoice in MySQL", async () => {
    await connection.db.update(branches).set({ adultPrice: "999999999.999", childPrice: "999999999.999" }).where(eq(branches.id, branchId));
    try {
      const created = await post({ ...input, startTime: "21:00", endTime: "21:20", adultCount: 2147483647, childCount: 2147483647 });
      expect(created.status).toBe(201);
      expect(created.body.invoice.total).toBe("4294967293995705032.706");
      await expect(connection.pool.execute("INSERT INTO invoices (id, booking_id, adult_unit_price, child_unit_price, adult_amount, child_amount, total, status, payment_status, issued_at) SELECT UUID(), booking_id, adult_unit_price, child_unit_price, adult_amount, child_amount, total, status, payment_status, issued_at FROM invoices WHERE booking_id = ?", [created.body.id])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    } finally { await connection.db.update(branches).set({ adultPrice: "5.125", childPrice: "3.001" }).where(eq(branches.id, branchId)); }
  });
  it("preserves address, client, employee/branch, and price snapshots after current records change", async () => {
    const before = (await request(app).get(`/bookings/${bookingId}`).set("Cookie", admin.cookie)).body;
    await connection.db.update(clientAddresses).set({ street: "شارع جديد" }).where(eq(clientAddresses.id, addressId));
    await connection.db.update(clients).set({ name: "اسم جديد" }).where(eq(clients.id, clientId));
    await connection.db.update(branches).set({ name: "فرع جديد", adultPrice: "99.000" }).where(eq(branches.id, branchId));
    await connection.db.update(employees).set({ displayName: "اسم جديد", branchId: transferBranchId }).where(eq(employees.accountId, employeeId));
    const after = (await request(app).get(`/bookings/${bookingId}`).set("Cookie", admin.cookie)).body;
    expect(after.address).toEqual(before.address);
    expect(after.client).toEqual(before.client);
    expect(after.employee).toEqual(before.employee);
    expect(after.invoice).toEqual(before.invoice);
  });
  it("rejects a booking at the current Kuwait minute without an extra lead-time cutoff", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-02T09:00:00Z"));
    expect(() => assertFutureStart({ date: "2026-10-02", startTime: "12:00" })).toThrow(expect.objectContaining({ code: "BOOKING_START_NOT_FUTURE" }));
    expect(() => assertFutureStart({ date: "2026-10-02", startTime: "12:01" })).not.toThrow();
  });
});
