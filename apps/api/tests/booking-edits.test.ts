import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "@just4kids/db";
import { bookingCreateSchema } from "@just4kids/contracts";
import { accounts, branches, employees, clients, clientAddresses, employeeWorkIntervals, employeeScheduleExceptions, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL), auth = createAuth(connection, env), app = createApp({ auth, connection, env });
const branchId = randomUUID(), otherBranchId = randomUUID(), employeeId = randomUUID(), sameId = randomUUID(), otherId = randomUUID(), clientId = randomUUID(), addressId = randomUUID(), secondAddressId = randomUUID(), foreignClientId = randomUUID(), foreignAddressId = randomUUID();
const phone = `+965${randomInt(10000000, 19999999)}`, otherPhone = `+965${randomInt(20000000, 29999999)}`;
type Session = { cookie: string; csrf: string; id: string };
let admin: Session, employee: Session, other: Session;
let day = 1, date: string, booking: { id: string; reference: string; visitVersion: number; invoice: { id: string; issuedAt: string } };
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const login = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(login.status).toBe(200);
  return { cookie: (login.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: login.body.csrfToken as string, id: login.body.account.id as string };
}
function write(method: "post" | "patch", path: string, body: object, session = admin) { return request(app)[method](path).set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body); }
function edit(patch: object, version = 0, session = admin) { return write("patch", `/bookings/${booking.id}`, { expectedVersion: version, ...patch }, session); }
function detail(session = admin) { return request(app).get(`/bookings/${booking.id}`).set("Cookie", session.cookie); }
function revisions(session = admin) { return request(app).get(`/bookings/${booking.id}/revisions`).set("Cookie", session.cookie); }
const body = () => ({ clientId, addressId, employeeId, date, startTime: "09:00", endTime: "09:20", adultCount: 1, childCount: 1 });
beforeAll(async () => {
  await connection.db.delete(loginAttempts); await auth.initialize();
  const now = new Date(), passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(branches).values([
    { id: branchId, name: "edit-first", location: "Kuwait", adultPrice: "5.125", childPrice: "3.001", adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now },
    { id: otherBranchId, name: "edit-second", location: "Hawalli", adultPrice: "9.000", childPrice: "7.000", adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now },
  ]);
  await connection.db.insert(accounts).values([
    { id: employeeId, phone, role: "employee", passwordHash, createdAt: now, updatedAt: now },
    { id: sameId, phone: `+965${randomInt(40000000, 49999999)}`, role: "employee", passwordHash, createdAt: now, updatedAt: now },
    { id: otherId, phone: otherPhone, role: "employee", passwordHash, createdAt: now, updatedAt: now },
  ]);
  await connection.db.insert(employees).values([
    { accountId: employeeId, branchId, displayName: "first", createdAt: now, updatedAt: now },
    { accountId: sameId, branchId, displayName: "same", createdAt: now, updatedAt: now },
    { accountId: otherId, branchId: otherBranchId, displayName: "second", createdAt: now, updatedAt: now },
  ]);
  await connection.db.insert(clients).values({ id: clientId, name: "client", phone: `+965${randomInt(30000000, 39999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values([addressId, secondAddressId].map((id, index) => ({ id, clientId, area: "area", block: "3", street: index ? "new street" : "original street", houseNumber: "12", createdAt: now, updatedAt: now })));
  await connection.db.insert(clients).values({ id: foreignClientId, name: "other client", phone: `+965${randomInt(50000000, 59999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values({ id: foreignAddressId, clientId: foreignClientId, area: "area", block: "3", street: "private street", houseNumber: "12", createdAt: now, updatedAt: now });
  await connection.db.insert(employeeWorkIntervals).values([employeeId, sameId, otherId].flatMap(employeeId => Array.from({ length: 7 }, (_, dayOfWeek) => ({ employeeId, dayOfWeek, startTime: "08:00", endTime: "23:00" }))));
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD); employee = await signIn(phone, "employee-password-123"); other = await signIn(otherPhone, "employee-password-123");
});
beforeEach(async () => {
  vi.restoreAllMocks(); date = new Date(Date.UTC(2099, 0, day++)).toISOString().slice(0, 10);
  const created = await write("post", "/bookings", body()); expect(created.status).toBe(201); booking = created.body;
});
afterAll(async () => {
  vi.restoreAllMocks();
  const ids = [employeeId, sameId, otherId];
  const [tables] = await connection.pool.query("SHOW TABLES LIKE 'booking_revisions'");
  if ((tables as unknown[]).length) await connection.pool.execute("DELETE FROM booking_revisions WHERE booking_id IN (SELECT id FROM bookings WHERE client_id = ?)", [clientId]);
  await connection.pool.execute("DELETE FROM booking_visit_events WHERE booking_id IN (SELECT id FROM bookings WHERE client_id = ?)", [clientId]);
  await connection.pool.execute("DELETE FROM invoices WHERE booking_id IN (SELECT id FROM bookings WHERE client_id = ?)", [clientId]);
  await connection.pool.execute("DELETE FROM bookings WHERE client_id = ?", [clientId]);
  for (const id of ids) {
    await connection.db.delete(employeeScheduleExceptions).where(eq(employeeScheduleExceptions.employeeId, id));
    await connection.db.delete(employeeWorkIntervals).where(eq(employeeWorkIntervals.employeeId, id));
    await connection.db.delete(employees).where(eq(employees.accountId, id)); await connection.db.delete(accounts).where(eq(accounts.id, id));
  }
  await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, clientId)); await connection.db.delete(clients).where(eq(clients.id, clientId));
  await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, foreignClientId)); await connection.db.delete(clients).where(eq(clients.id, foreignClientId));
  for (const id of [branchId, otherBranchId]) await connection.db.delete(branches).where(eq(branches.id, id));
  await connection.pool.end();
});
describe("reservation edits and invoice revisions", () => {
  it("moves the window/address while preserving agreed prices, identity, and before/after history", async () => {
    const before = (await detail()).body;
    await connection.db.update(branches).set({ adultPrice: "99.000" }).where(eq(branches.id, branchId));
    try {
      const updated = await edit({ startTime: "10:00", endTime: "10:20", addressId: secondAddressId, reason: "requested move" });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ id: booking.id, reference: booking.reference, visitVersion: 1, startTime: "10:00", address: { street: "new street" }, invoice: { id: booking.invoice.id, issuedAt: booking.invoice.issuedAt, adultUnitPrice: "5.125", total: "8.126" } });
      const history = await revisions(); expect(history.status).toBe(200); expect(history.body.revisions).toHaveLength(1);
      expect(history.body.revisions[0]).toMatchObject({ version: 1, actorAccountId: admin.id, reason: "requested move", before, after: updated.body });
    } finally { await connection.db.update(branches).set({ adultPrice: "5.125" }).where(eq(branches.id, branchId)); }
  });
  it("recalculates counts and same-branch assignment with booked unit prices", async () => {
    await connection.db.update(branches).set({ adultPrice: "99.000" }).where(eq(branches.id, branchId));
    try {
      const updated = await edit({ adultCount: 3, childCount: 0, employeeId: sameId });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ employeeId: sameId, branchId, invoice: { id: booking.invoice.id, adultUnitPrice: "5.125", adultAmount: "15.375", childAmount: "0.000", total: "15.375" } });
    } finally { await connection.db.update(branches).set({ adultPrice: "5.125" }).where(eq(branches.id, branchId)); }
  });
  it("uses current new-branch prices and changes employee ownership without another invoice", async () => {
    const changed = await edit({ employeeId: otherId, adultCount: 2 }); expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ employeeId: otherId, branchId: otherBranchId, employee: { id: otherId, branchName: "edit-second" }, invoice: { id: booking.invoice.id, adultUnitPrice: "9.000", childUnitPrice: "7.000", total: "25.000" } });
    for (const suffix of ["", "/invoice", "/history", "/revisions"]) {
      expect((await request(app).get(`/bookings/${booking.id}${suffix}`).set("Cookie", employee.cookie)).status).toBe(403);
      expect((await request(app).get(`/bookings/${booking.id}${suffix}`).set("Cookie", other.cookie)).status).toBe(200);
    }
    const [rows] = await connection.pool.execute("SELECT COUNT(*) AS n FROM invoices WHERE booking_id = ?", [booking.id]); expect(rows).toMatchObject([{ n: 1 }]);
  });
  it("preserves snapshots/prices for count edits after the current barber transfers branches", async () => {
    const before = (await detail()).body;
    await connection.db.update(employees).set({ branchId: otherBranchId }).where(eq(employees.accountId, employeeId));
    try {
      const changed = await edit({ adultCount: 2 }); expect(changed.status).toBe(200);
      expect(changed.body.employee).toEqual(before.employee); expect(changed.body.branchId).toBe(branchId);
      expect(changed.body.invoice).toMatchObject({ adultUnitPrice: "5.125", total: "13.251" });
    } finally { await connection.db.update(employees).set({ branchId }).where(eq(employees.accountId, employeeId)); }
  });
  it("denies employees, unauthenticated changes, missing CSRF, and caller-controlled prices", async () => {
    expect((await edit({ adultCount: 2 }, 0, employee)).status).toBe(403);
    expect((await request(app).patch(`/bookings/${booking.id}`).set("Origin", origin).send({ adultCount: 2, expectedVersion: 0 })).status).toBe(401);
    expect((await request(app).patch(`/bookings/${booking.id}`).set("Origin", origin).set("Cookie", admin.cookie).send({ adultCount: 2, expectedVersion: 0 })).status).toBe(403);
    expect((await edit({ adultCount: 2, total: "0.001" })).status).toBe(400);
    expect((await edit({ adultCount: 0, childCount: 0 })).status).toBe(400);
    expect((await edit({ endTime: "09:19" })).status).toBe(400);
    expect((await edit({ addressId: randomUUID() })).status).toBe(404);
    expect((await edit({ addressId: foreignAddressId })).status).toBe(404);
    expect((await edit({ adultCount: 1 })).status).toBe(409);
    expect((await revisions()).body.revisions).toEqual([]);
  });
  it("rejects past starts and terminal/arrived visits without changing history", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(`${date}T09:00:00+03:00`));
    expect((await edit({ startTime: "10:00", endTime: "10:20" })).status).toBe(409);
    vi.restoreAllMocks();
    for (const status of ["arrived", "completed", "cancelled", "no_show"]) {
      await connection.pool.execute("UPDATE bookings SET visit_status = ? WHERE id = ?", [status, booking.id]);
      expect((await edit({ adultCount: 2 })).status).toBe(409);
    }
    await connection.pool.execute("UPDATE bookings SET visit_status = 'booked' WHERE id = ?", [booking.id]);
    expect((await edit({ date: "2000-01-01" })).status).toBe(400);
    expect((await revisions()).body.revisions).toEqual([]);
  });
  it("rejects paid edits when the corresponding cash record is missing", async () => {
    await connection.pool.execute("UPDATE invoices SET payment_status = 'paid' WHERE booking_id = ?", [booking.id]);
    const before = (await detail()).body;
    for (const patch of [{ adultCount: 2 }, { addressId: secondAddressId }, { startTime: "10:00", endTime: "10:20" }]) expect((await edit(patch)).status).toBe(409);
    expect((await detail()).body).toEqual(before); expect((await revisions()).body.revisions).toEqual([]);
  });
  it("rolls back a conflicting reschedule/reassignment and rejects disabled barbers", async () => {
    expect((await write("post", "/bookings", { ...body(), employeeId: otherId })).status).toBe(201);
    expect((await write("post", "/bookings", { ...body(), startTime: "10:00", endTime: "10:20" })).status).toBe(201);
    const before = (await detail()).body;
    expect((await edit({ employeeId: otherId })).status).toBe(409);
    expect((await edit({ startTime: "10:00", endTime: "10:20" })).status).toBe(409);
    await connection.db.update(accounts).set({ enabled: false }).where(eq(accounts.id, sameId));
    try { expect((await edit({ employeeId: sameId })).status).toBe(409); }
    finally { await connection.db.update(accounts).set({ enabled: true }).where(eq(accounts.id, sameId)); }
    expect((await detail()).body).toEqual(before); expect((await revisions()).body.revisions).toEqual([]);
  });
  it("accepts adjacent windows and the inclusive four-hour bound independently of counts", async () => {
    expect((await write("post", "/bookings", { ...body(), startTime: "10:00", endTime: "10:20" })).status).toBe(201);
    expect((await edit({ startTime: "10:20", endTime: "14:20", adultCount: 3 })).status).toBe(200);
  });
  it("serializes competing edits and prevents stale visit actions after reassignment", async () => {
    const changed = await Promise.all([edit({ employeeId: otherId }), edit({ adultCount: 2 })]);
    expect(changed.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await revisions()).body.revisions).toHaveLength(1);
    expect((await write("post", `/bookings/${booking.id}/visit`, { status: "cancelled", expectedVersion: 0 })).status).toBe(409);
  });
  it("serializes opposite barber swaps without deadlocks and leaves conflicting reservations intact", async () => {
    const second = await write("post", "/bookings", { ...body(), employeeId: otherId }); expect(second.status).toBe(201);
    const results = await Promise.all([edit({ employeeId: otherId }), write("patch", `/bookings/${second.body.id}`, { expectedVersion: 0, employeeId })]);
    expect(results.map(result => result.status)).toEqual([409, 409]); expect((await detail()).body.employeeId).toBe(employeeId);
  });
  it("rechecks the original start before saving if the clock advances during an edit", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(`${date}T08:59:00+03:00`));
    const parse = bookingCreateSchema.parse.bind(bookingCreateSchema);
    // Keep real validation and MySQL; advance only the clock after the initial eligibility check.
    vi.spyOn(bookingCreateSchema, "parse").mockImplementation((...args) => {
      const result = parse(...args); clock.mockReturnValue(Date.parse(`${date}T09:00:00+03:00`)); return result;
    });
    const changed = await edit({ startTime: "10:00", endTime: "10:20" });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe("BOOKING_EDIT_NOT_ALLOWED");
    expect((await detail()).body).toMatchObject({ startTime: "09:00", visitVersion: 0 });
  });
  it("protects a reschedule racing with a new reservation for the requested window", async () => {
    const results = await Promise.all([edit({ startTime: "10:00", endTime: "10:20" }), write("post", "/bookings", { ...body(), startTime: "10:00", endTime: "10:20" })]);
    expect([[200, 409], [409, 201]]).toContainEqual(results.map(result => result.status));
    expect((await detail()).body.startTime).toBe(results[0]!.status === 200 ? "10:00" : "09:00");
  });
  it("retains ordered immutable revisions across later parent changes and visit actions", async () => {
    const first = await edit({ employeeId: otherId }); expect(first.status).toBe(200);
    const second = await edit({ adultCount: 2 }, 1); expect(second.status).toBe(200);
    expect((await write("post", `/bookings/${booking.id}/visit`, { status: "cancelled", expectedVersion: 2 })).status).toBe(200);
    await connection.db.update(clientAddresses).set({ street: "changed later" }).where(eq(clientAddresses.id, addressId));
    await connection.db.update(branches).set({ adultPrice: "99.000" }).where(eq(branches.id, otherBranchId));
    try {
      const history = await revisions();
      expect(history.body.revisions.map((revision: { version: number }) => revision.version)).toEqual([1, 2]);
      expect(history.body.revisions[0].after).toEqual(first.body);
      expect(history.body.revisions[1].before).toEqual(first.body);
      expect(history.body.revisions[1].after).toEqual(second.body);
      const visits = await request(app).get(`/bookings/${booking.id}/history`).set("Cookie", other.cookie);
      expect(visits.body.events.map((event: { version: number }) => event.version)).toEqual([0, 3]);
      expect((await detail()).body.visitVersion).toBe(3);
    } finally {
      await connection.db.update(clientAddresses).set({ street: "original street" }).where(eq(clientAddresses.id, addressId));
      await connection.db.update(branches).set({ adultPrice: "9.000" }).where(eq(branches.id, otherBranchId));
    }
  });
  it("rolls back the booking/invoice if revision persistence fails", async () => {
    const trigger = `verification_${randomUUID().replaceAll("-", "")}`;
    await connection.pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON booking_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'revision failure'`);
    try {
      const before = (await detail()).body; expect((await edit({ adultCount: 2, employeeId: otherId })).status).toBe(500);
      expect((await detail()).body).toEqual(before); expect((await revisions()).body.revisions).toEqual([]);
    } finally { await connection.pool.query(`DROP TRIGGER ${trigger}`); }
  });
});
