import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, employees, clients, clientAddresses, employeeWorkIntervals, employeeScheduleExceptions, bookingVisitEvents, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL), auth = createAuth(connection, env), app = createApp({ auth, connection, env });
const employeeId = randomUUID(), otherId = randomUUID(), clientId = randomUUID(), addressId = randomUUID();
const phone = `+965${randomInt(10000000, 19999999)}`, otherPhone = `+965${randomInt(20000000, 29999999)}`;
type Session = { cookie: string; csrf: string; id: string };
let admin: Session, employee: Session, other: Session;
let day = 1, date: string, booking: { id: string; visitVersion: number };
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const login = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(login.status).toBe(200);
  return { cookie: (login.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: login.body.csrfToken as string, id: login.body.account.id as string };
}
function write(path: string, body: object, session = employee) { return request(app).post(path).set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body); }
function transition(status: string, version = 0, session = employee) { return write(`/bookings/${booking.id}/visit`, { status, expectedVersion: version }, session); }
function correction(status: string, version: number, reason = "تصحيح حالة الزيارة", session = admin) { return write(`/bookings/${booking.id}/visit/correction`, { status, expectedVersion: version, reason }, session); }
function at(time: string) { vi.spyOn(Date, "now").mockReturnValue(Date.parse(`${date}T${time}:00+03:00`)); }
async function detail() { return (await request(app).get(`/bookings/${booking.id}`).set("Cookie", admin.cookie)).body; }
async function history() { return request(app).get(`/bookings/${booking.id}/history`).set("Cookie", employee.cookie); }
const body = () => ({ clientId, addressId, employeeId, date, startTime: "09:00", endTime: "09:20", adultCount: 1, childCount: 1 });
beforeAll(async () => {
  await connection.db.delete(loginAttempts); await auth.initialize();
  const now = new Date(), passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values([{ id: employeeId, phone, role: "employee", passwordHash, createdAt: now, updatedAt: now }, { id: otherId, phone: otherPhone, role: "employee", passwordHash, createdAt: now, updatedAt: now }]);
  await connection.db.insert(employees).values([{ accountId: employeeId, displayName: "barber", createdAt: now, updatedAt: now }, { accountId: otherId, displayName: "other", createdAt: now, updatedAt: now }]);
  await connection.db.insert(clients).values({ id: clientId, phone: `+965${randomInt(30000000, 39999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values({ id: addressId, clientId, area: "area", block: "3", street: "street", houseNumber: "12", createdAt: now, updatedAt: now });
  await connection.db.insert(employeeWorkIntervals).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ employeeId, dayOfWeek, startTime: "08:00", endTime: "23:00" })));
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD); employee = await signIn(phone, "employee-password-123"); other = await signIn(otherPhone, "employee-password-123");
});
beforeEach(async () => {
  vi.restoreAllMocks(); date = `2099-01-${String(day++).padStart(2, "0")}`;
  const created = await write("/bookings", body(), admin); expect(created.status).toBe(201); booking = created.body;
});
afterAll(async () => {
  vi.restoreAllMocks();
  const [tables] = await connection.pool.query("SHOW TABLES LIKE 'booking_visit_events'");
  if ((tables as unknown[]).length) await connection.pool.execute("DELETE FROM booking_visit_events WHERE booking_id IN (SELECT id FROM bookings WHERE employee_id = ?)", [employeeId]);
  const [messageTables] = await connection.pool.query("SHOW TABLES LIKE 'booking_messages'");
  if ((messageTables as unknown[]).length) await connection.pool.execute("DELETE FROM booking_messages WHERE booking_id IN (SELECT id FROM bookings WHERE employee_id = ?)", [employeeId]);
  await connection.pool.execute("DELETE FROM bookings WHERE employee_id = ?", [employeeId]);
  await connection.db.delete(employeeScheduleExceptions).where(eq(employeeScheduleExceptions.employeeId, employeeId));
  await connection.db.delete(employeeWorkIntervals).where(eq(employeeWorkIntervals.employeeId, employeeId));
  await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, clientId)); await connection.db.delete(clients).where(eq(clients.id, clientId));
  for (const id of [employeeId, otherId]) { await connection.db.delete(employees).where(eq(employees.accountId, id)); await connection.db.delete(accounts).where(eq(accounts.id, id)); }
});
describe("employee visit actions and history", () => {
  it.each(["booked", "arrived", "completed"])("allows new weekly hours without changing a past %s visit", async status => {
    at("09:00");
    if (status !== "booked") expect((await transition("arrived")).status).toBe(200);
    if (status === "completed") expect((await transition("completed", 1)).status).toBe(200);
    const previous = await detail(), events = (await history()).body;
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(`${date}T00:00:00+03:00`) + 24 * 60 * 60 * 1000);
    const path = `/schedules/${employeeId}/weekly`;
    const save = (startTime: string) => request(app).put(path).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ days: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, active: true, intervals: [{ startTime, endTime: "23:00" }] })) });
    try {
      expect((await save("11:00")).status).toBe(200);
      expect(await detail()).toEqual(previous);
      expect((await history()).body).toEqual(events);
    } finally { expect((await save("08:00")).status).toBe(200); }
  });
  it.each(["booked", "arrived", "completed"])("protects a %s window until its exact Kuwait end time", async status => {
    at("09:00");
    if (status !== "booked") expect((await transition("arrived")).status).toBe(200);
    if (status === "completed") expect((await transition("completed", 1)).status).toBe(200);
    const path = `/schedules/${employeeId}/exceptions/${date}`;
    const close = () => request(app).put(path).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ intervals: [] });
    // Kuwait is already on this date while UTC is still on the previous date.
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(`${date}T00:00:00+03:00`));
    expect((await close()).status).toBe(409);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(`${date}T09:20:00+03:00`) - 1);
    expect((await close()).status).toBe(409);
    at("09:20");
    try {
      expect((await close()).status).toBe(200);
      expect((await detail()).visitStatus).toBe(status);
    } finally {
      expect((await request(app).delete(path).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)).status).toBe(204);
    }
  });
  it("records arrival and completion with ordered actor/time history", async () => {
    at("09:00"); expect((await transition("arrived")).status).toBe(200);
    expect((await transition("completed", 1)).status).toBe(200);
    const current = await detail();
    expect(current).toMatchObject({ visitStatus: "completed", visitVersion: 2, startTime: "09:00", endTime: "09:20" });
    const events = await history(); expect(events.status).toBe(200);
    expect(events.body.events.map((event: { toStatus: string }) => event.toStatus)).toEqual(["booked", "arrived", "completed"]);
    expect(events.body.events[1]).toMatchObject({ fromStatus: "booked", toStatus: "arrived", actorType: "employee", actorAccountId: employeeId, occurredAt: `${date}T06:00:00.000Z` });
    const eligible = await request(app).get(`/availability/eligible?date=${date}&startTime=09:00&endTime=09:20`).set("Cookie", admin.cookie);
    expect(eligible.body.barbers.some((barber: { id: string }) => barber.id === employeeId)).toBe(false);
    expect((await transition("cancelled", 2)).status).toBe(409);
  });
  it("enforces ownership, CSRF, and administrator-only corrections", async () => {
    expect((await transition("cancelled", 0, other)).status).toBe(403);
    expect((await request(app).post(`/bookings/${booking.id}/visit`).set("Origin", origin).set("Cookie", employee.cookie).send({ status: "cancelled", expectedVersion: 0 })).status).toBe(403);
    expect((await correction("cancelled", 0, "reason", employee)).status).toBe(403);
    expect((await request(app).get(`/bookings/${booking.id}/history`).set("Cookie", other.cookie)).status).toBe(403);
    expect((await request(app).patch(`/bookings/${booking.id}`).set("Origin", origin).set("Cookie", employee.cookie).set("X-CSRF-Token", employee.csrf).send({ employeeId: otherId })).status).toBe(403);
  });
  it("rejects early arrival/completion/no-show and completion without arrival", async () => {
    at("08:59"); expect((await transition("arrived")).status).toBe(409); expect((await transition("no_show")).status).toBe(409);
    at("09:00"); expect((await transition("completed")).status).toBe(409); expect((await transition("no_show")).status).toBe(409);
    at("09:20"); expect((await transition("no_show")).status).toBe(200);
    expect((await transition("arrived", 1)).status).toBe(409);
  });
  it("cancels the visit and releases availability", async () => {
    expect((await transition("cancelled")).status).toBe(200);
    const eligible = await request(app).get(`/availability/eligible?date=${date}&startTime=09:00&endTime=09:20`).set("Cookie", admin.cookie);
    expect(eligible.body.barbers.some((barber: { id: string }) => barber.id === employeeId)).toBe(true);
    expect((await detail()).visitStatus).toBe("cancelled");
  });
  it("serializes competing actions so only one version is accepted and one event is appended", async () => {
    at("09:00"); const results = await Promise.all([transition("arrived"), transition("cancelled")]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await history()).body.events).toHaveLength(2);
  });
  it.each(["cancelled", "no_show"])("allows %s after arrival", async status => {
    at("09:00"); expect((await transition("arrived")).status).toBe(200);
    at("09:20"); expect((await transition(status!, 1)).status).toBe(200);
  });
  it("requires a correction reason and records administrator reopening", async () => {
    expect((await transition("cancelled")).status).toBe(200);
    expect((await correction("booked", 1, " ")).status).toBe(400);
    expect((await correction("booked", 1)).status).toBe(200);
    expect((await detail())).toMatchObject({ visitStatus: "booked" });
    expect((await history()).body.events[2]).toMatchObject({ correction: true, reason: "تصحيح حالة الزيارة", actorType: "admin", actorAccountId: admin.id, fromStatus: "cancelled", toStatus: "booked" });
  });
  it("rejects restoring a blocking visit when another booking now occupies its window and rolls back history", async () => {
    expect((await transition("cancelled")).status).toBe(200);
    expect((await write("/bookings", body(), admin)).status).toBe(201);
    expect((await correction("booked", 1)).status).toBe(409);
    expect((await detail())).toMatchObject({ visitStatus: "cancelled", visitVersion: 1 });
    expect((await history()).body.events).toHaveLength(2);
  });
  it("rejects restoring a cancelled visit after its working hours are closed", async () => {
    expect((await transition("cancelled")).status).toBe(200);
    const closed = await request(app).put(`/schedules/${employeeId}/exceptions/${date}`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ intervals: [] });
    expect(closed.status).toBe(200); expect((await correction("booked", 1)).status).toBe(409);
  });
  it("rolls back visit changes if history persistence fails", async () => {
    const trigger = `verification_${randomUUID().replaceAll("-", "")}`;
    await connection.pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON booking_visit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'history failure'`);
    try { expect((await transition("cancelled")).status).toBe(500); expect((await detail())).toMatchObject({ visitStatus: "booked", visitVersion: 0 }); }
    finally { await connection.pool.query(`DROP TRIGGER ${trigger}`); }
  });
  it("allows administrator terminal corrections and rejects stale competing corrections", async () => {
    const completed = await correction("completed", 0);
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({ visitStatus: "completed" });
    const results = await Promise.all([correction("booked", 1), correction("cancelled", 1)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await history()).body.events).toHaveLength(3);
  });
  it("serializes reopening against a new booking for the released window", async () => {
    expect((await transition("cancelled")).status).toBe(200);
    const [reopened, created] = await Promise.all([correction("booked", 1), write("/bookings", body(), admin)]);
    expect([[200, 409], [409, 201]]).toContainEqual([reopened.status, created.status]);
  });
  it("preserves a legacy visit and records a system baseline without inventing its earlier actor history", async () => {
    await connection.pool.execute("DELETE FROM booking_visit_events WHERE booking_id = ?", [booking.id]);
    await connection.pool.execute("UPDATE bookings SET visit_status = 'completed' WHERE id = ?", [booking.id]);
    await connection.db.insert(bookingVisitEvents).values({ id: randomUUID(), bookingId: booking.id, version: 0, fromStatus: null, toStatus: "completed", actorType: "system", reason: "الحالة المسجلة عند ترقية النظام؛ تفاصيل التغييرات السابقة غير متوفرة", correction: false, occurredAt: new Date() });
    expect((await detail())).toMatchObject({ visitStatus: "completed", visitVersion: 0 });
    const recorded = await history();
    expect(recorded.body.events).toHaveLength(1);
    expect(recorded.body.events[0]).toMatchObject({ actorType: "system", actorAccountId: null, actorClientId: null, fromStatus: null, toStatus: "completed" });
  });
});

describe("recording a booking message sent to the barber", () => {
  it("records every send with its administrator and time, and shows it in the booking history", async () => {
    at("09:00");
    const first = await write(`/bookings/${booking.id}/sent-to-barber`, {}, admin);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ bookingId: booking.id, kind: "sent_to_barber", actorAccountId: admin.id });
    expect(Date.parse(first.body.occurredAt)).toBe(Date.parse(`${date}T09:00:00+03:00`));
    at("09:05");
    expect((await write(`/bookings/${booking.id}/sent-to-barber`, {}, admin)).status).toBe(201);
    const all = await history();
    expect(all.status).toBe(200);
    expect(all.body.messages).toHaveLength(2);
    expect(all.body.messages[0]).toMatchObject({ kind: "sent_to_barber", actorAccountId: admin.id });
    expect(Date.parse(all.body.messages[1].occurredAt)).toBe(Date.parse(`${date}T09:05:00+03:00`));
  });
  it("refuses employees, requires CSRF, and rejects an unknown booking", async () => {
    expect((await write(`/bookings/${booking.id}/sent-to-barber`, {}, employee)).status).toBe(403);
    expect((await write(`/bookings/${booking.id}/sent-to-barber`, {}, other)).status).toBe(403);
    expect((await request(app).post(`/bookings/${booking.id}/sent-to-barber`).set("Origin", origin).set("Cookie", admin.cookie).send({})).status).toBe(403);
    expect((await write(`/bookings/${randomUUID()}/sent-to-barber`, {}, admin)).status).toBe(404);
  });
});
