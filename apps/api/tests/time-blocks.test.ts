import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, employees, clients, clientAddresses, employeeWorkIntervals, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { createAuth } from "../src/modules/auth/index.js";
import { hashPassword } from "../src/lib/password.js";
import { createBookingRepository } from "../src/modules/bookings/booking.repository.js";
import { createBookingService } from "../src/modules/bookings/booking.service.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const employeeId = randomUUID(), otherId = randomUUID(), clientId = randomUUID(), addressId = randomUUID();
const phone = `+965${randomInt(10000000, 19999999)}`;
const date = "2099-01-05";
type Session = { cookie: string; csrf: string; id: string };
let admin: Session, employee: Session;
const base = `/schedules/${employeeId}/blocks`;
const booking = (visitDate = date) => ({ clientId, addressId, employeeId, date: visitDate, startTime: "12:30", endTime: "13:30", childCount: 1, adultCount: 0 });
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: response.body.csrfToken, id: response.body.account.id };
}
function write(method: "post" | "patch" | "delete", path: string, body = {}, session = admin) {
  return request(app)[method](path).set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body);
}
function end(startTime: string, minutes: number): string {
  const total = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
async function lock(visitDate = date, startTime = "13:00", id = employeeId) {
  const result = await write("post", `/schedules/${id}/blocks`, { date: visitDate, startTime, endTime: end(startTime, 30), reason: "موعد خاص" });
  expect(result.status).toBe(201);
  return result.body as { id: string; startTime: string; endTime: string };
}
beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date(), passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values([employeeId, otherId].map((id, index) => ({ id, role: "employee" as const, phone: index ? `+965${randomInt(20000000, 29999999)}` : phone, passwordHash, createdAt: now, updatedAt: now })));
  await connection.db.insert(employees).values([employeeId, otherId].map(accountId => ({ accountId, displayName: "حلاق", createdAt: now, updatedAt: now })));
  await connection.db.insert(employeeWorkIntervals).values([employeeId, otherId].flatMap(employeeId => Array.from({ length: 7 }, (_, dayOfWeek) => ({ employeeId, dayOfWeek, startTime: "08:00", endTime: "23:00" }))));
  await connection.db.insert(clients).values({ id: clientId, phone: `+965${randomInt(30000000, 39999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values({ id: addressId, clientId, area: "حولي", block: "1", street: "2", houseNumber: "3", createdAt: now, updatedAt: now });
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  employee = await signIn(phone, "employee-password-123");
});
afterAll(async () => {
  for (const table of ["booking_revisions", "booking_visit_events"]) await connection.pool.execute(`DELETE FROM ${table} WHERE booking_id IN (SELECT id FROM bookings WHERE client_id = ?)`, [clientId]);
  await connection.pool.execute("DELETE FROM bookings WHERE client_id = ?", [clientId]);
  for (const id of [employeeId, otherId]) {
    await connection.db.delete(employees).where(eq(employees.accountId, id));
    await connection.db.delete(accounts).where(eq(accounts.id, id));
  }
  await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, clientId));
  await connection.db.delete(clients).where(eq(clients.id, clientId));
  await connection.pool.end();
});

describe("manual half-hour locks", () => {
  it("requires admin, origin and CSRF for both writes and scopes schedule reads", async () => {
    expect((await request(app).post(base).set("Origin", origin).send({ date, startTime: "13:00" })).status).toBe(401);
    expect((await write("post", base, { date, startTime: "13:00" }, employee)).status).toBe(403);
    expect((await request(app).post(base).set("Origin", origin).set("Cookie", admin.cookie).send({ date, startTime: "13:00" })).status).toBe(403);
    expect((await request(app).post(base).set("Origin", "https://attacker.example").set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ date, startTime: "13:00" })).status).toBe(403);
    const block = await lock();
    expect((await write("delete", `${base}/${block.id}`, {}, employee)).status).toBe(403);
    expect((await request(app).delete(`${base}/${block.id}`).set("Origin", origin).set("Cookie", admin.cookie)).status).toBe(403);
    expect((await request(app).get(`/schedules/${otherId}`).set("Cookie", employee.cookie)).status).toBe(403);
    const own = await request(app).get("/schedules/me").set("Cookie", employee.cookie);
    expect(own.body.blocks).toEqual([expect.objectContaining({ id: block.id, reason: "موعد خاص", startTime: "13:00", endTime: "13:30" })]);
    expect((await write("delete", `/schedules/${otherId}/blocks/${block.id}`)).status).toBe(404);
    expect((await write("delete", `${base}/${block.id}`)).status).toBe(204);
  });
  it("rejects invalid/past/nonworking locks, overlaps and unknown barbers", async () => {
    for (const body of [
      { date, startTime: "13:15", endTime: "14:00" },
      { date, startTime: "13:00", endTime: "14:15" },
      { date: "2099-02-30", startTime: "13:00", endTime: "14:00" },
      { date, startTime: "13:00", endTime: "13:00" },
      { date, startTime: "14:00", endTime: "13:00" },
      { date, startTime: "23:30", endTime: "23:59" },
      { date, startTime: "13:00" },
    ]) expect((await write("post", base, body)).status).toBe(400);
    expect((await write("post", base, { date: "2000-01-01", startTime: "13:00", endTime: "14:00" })).status).toBe(400);
    expect((await write("post", base, { date, startTime: "07:00", endTime: "08:00" })).status).toBe(409);
    expect((await write("post", `/schedules/${randomUUID()}/blocks`, { date, startTime: "13:00", endTime: "14:00" })).status).toBe(404);
    const block = await lock();
    expect((await write("post", base, { date, startTime: "13:00", endTime: "13:30" })).status).toBe(409);
    expect((await write("post", base, { date, startTime: "13:15", endTime: "14:00" })).status).toBe(400);
    await write("delete", `${base}/${block.id}`);
  });
  it("locks a multi-hour window, blocks every half-hour inside it, and keeps touching endpoints free", async () => {
    const visitDate = "2099-01-09";
    const created = await write("post", base, { date: visitDate, startTime: "13:00", endTime: "15:00", reason: "ظهيرة" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ startTime: "13:00", endTime: "15:00", reason: "ظهيرة" });
    for (const [startTime, endTime] of [["13:00", "14:00"], ["14:30", "15:00"]]) expect((await write("post", "/bookings", { ...booking(visitDate), startTime, endTime })).status).toBe(409);
    expect((await write("post", "/bookings", { ...booking(visitDate), startTime: "12:00", endTime: "13:00" })).status).toBe(201);
    expect((await write("post", base, { date: visitDate, startTime: "14:00", endTime: "16:00" })).status).toBe(409);
    expect((await write("post", base, { date: visitDate, startTime: "15:00", endTime: "16:00" })).status).toBe(201);
    const own = await request(app).get(`/schedules/${employeeId}`).set("Cookie", admin.cookie);
    expect(own.body.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id, startTime: "13:00", endTime: "15:00" })]));
  });
  it("allows a lock longer than the four-hour booking limit", async () => {
    const visitDate = "2099-01-10";
    const created = await write("post", base, { date: visitDate, startTime: "08:00", endTime: "13:00", reason: "طويل" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ startTime: "08:00", endTime: "13:00" });
    expect((await write("delete", `${base}/${created.body.id}`)).status).toBe(204);
  });
  it("blocks full-window creation and eligibility, preserves touching endpoints, and restores availability on unlock", async () => {
    const block = await lock();
    const query = { date, startTime: "12:30", endTime: "13:30" };
    const eligible = await request(app).get("/availability/eligible").set("Cookie", admin.cookie).query(query);
    expect(eligible.body.barbers.map((row: { id: string }) => row.id)).not.toContain(employeeId);
    const denied = await write("post", "/bookings", booking());
    expect(denied.status).toBe(409);
    expect(denied.body.error.code).toBe("BARBER_UNAVAILABLE");
    const [counts] = await connection.pool.execute("SELECT COUNT(*) AS n FROM bookings WHERE employee_id = ? AND date = ?", [employeeId, date]);
    expect(counts).toMatchObject([{ n: 0 }]);
    for (const [startTime, endTime] of [["12:30", "13:00"], ["13:30", "14:00"]]) expect((await write("post", "/bookings", { ...booking(), startTime, endTime })).status).toBe(201);
    const service = createBookingService(createBookingRepository(connection));
    await expect(service.create({ ...booking(), startTime: "13:00", endTime: "13:30" }, admin.id)).rejects.toMatchObject({ code: "BARBER_UNAVAILABLE" });
    expect((await write("delete", `${base}/${block.id}`)).status).toBe(204);
    expect((await write("post", "/bookings", { ...booking(), startTime: "13:00", endTime: "13:30" })).status).toBe(201);
  });
  it("rejects locks over existing bookings and blocks edits, reassignment and cancelled-visit restoration", async () => {
    const visitDate = "2099-01-06";
    const created = await write("post", "/bookings", { ...booking(visitDate), startTime: "09:00", endTime: "09:30" });
    expect(created.status).toBe(201);
    expect((await write("post", base, { date: visitDate, startTime: "09:00", endTime: "09:30" })).status).toBe(409);
    const block = await lock(visitDate);
    expect((await write("patch", `/bookings/${created.body.id}`, { expectedVersion: 0, startTime: "12:30", endTime: "13:30" })).body.error.code).toBe("BARBER_UNAVAILABLE");
    const other = await write("post", "/bookings", { ...booking(visitDate), employeeId: otherId });
    expect(other.status).toBe(201);
    expect((await write("patch", `/bookings/${other.body.id}`, { expectedVersion: 0, employeeId })).body.error.code).toBe("BARBER_UNAVAILABLE");
    expect((await write("delete", `${base}/${block.id}`)).status).toBe(204);
    const moved = await write("patch", `/bookings/${created.body.id}`, { expectedVersion: 0, startTime: "13:00", endTime: "13:30" });
    expect(moved.status).toBe(200);
    const cancelled = await write("post", `/bookings/${created.body.id}/visit`, { expectedVersion: moved.body.visitVersion, status: "cancelled" });
    expect(cancelled.status).toBe(200);
    await lock(visitDate);
    const restored = await write("post", `/bookings/${created.body.id}/visit/correction`, { expectedVersion: cancelled.body.visitVersion, status: "booked", reason: "restore" });
    expect(restored.body.error.code).toBe("BARBER_UNAVAILABLE");
  });
  it("serializes concurrent locks and a booking racing with a lock", async () => {
    const visitDate = "2099-01-07";
    const results = await Promise.all([write("post", base, { date: visitDate, startTime: "13:00", endTime: "13:30" }), write("post", base, { date: visitDate, startTime: "13:00", endTime: "13:30" })]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const raceDate = "2099-01-08";
    const [locked, created] = await Promise.all([write("post", base, { date: raceDate, startTime: "13:00", endTime: "13:30" }), write("post", "/bookings", booking(raceDate))]);
    expect([[201, 409], [409, 201]]).toContainEqual([locked.status, created.status]);
  });
});
