import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, branches, employees, clients, clientAddresses, employeeWorkIntervals, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL), auth = createAuth(connection, env), app = createApp({ auth, connection, env });
const branchId = randomUUID(), otherBranchId = randomUUID(), employeeId = randomUUID(), otherId = randomUUID(), clientId = randomUUID(), addressId = randomUUID();
const phone = `+965${randomInt(10000000, 19999999)}`, otherPhone = `+965${randomInt(20000000, 29999999)}`;
type Session = { cookie: string; csrf: string; id: string };
let admin: Session, employee: Session, other: Session;
let day = 1, date: string, booking: { id: string; invoice: { id: string } };
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const login = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(login.status).toBe(200);
  return { cookie: (login.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: login.body.csrfToken as string, id: login.body.account.id as string };
}
function write(method: "post" | "patch", path: string, body: object, session = admin) { return request(app)[method](path).set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body); }
function record(version: number, session = employee) { return write("post", `/bookings/${booking.id}/payment`, { expectedVersion: version }, session); }
function correct(status: string, expectedVersion: number) { return write("post", `/bookings/${booking.id}/visit/correction`, { status, expectedVersion, reason: "correct visit status" }); }
function undo(paymentId: string, expectedVersion: number, session = admin, reason = "mistaken cash entry") { return write("post", `/bookings/${booking.id}/payment/undo`, { paymentId, expectedVersion, reason }, session); }
function edit(patch: object, expectedVersion: number) { return write("patch", `/bookings/${booking.id}`, { expectedVersion, ...patch }); }
function detail() { return request(app).get(`/bookings/${booking.id}`).set("Cookie", admin.cookie); }
function payments(session = admin) { return request(app).get(`/bookings/${booking.id}/payments`).set("Cookie", session.cookie); }
async function paidFutureBooking() {
  // Authorized administrator corrections can restore a future booked visit; every correction is retained.
  expect((await correct("arrived", 0)).status).toBe(200);
  const paid = await record(1); expect(paid.status).toBe(200);
  expect((await correct("booked", 2)).status).toBe(200);
  return paid.body.payment.id as string;
}
beforeAll(async () => {
  await connection.db.delete(loginAttempts); await auth.initialize();
  const now = new Date(), passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(branches).values([
    { id: branchId, name: "cash-first", location: "Kuwait", adultPrice: "5.125", childPrice: "3.001", adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now },
    { id: otherBranchId, name: "cash-second", location: "Hawalli", adultPrice: "9.000", childPrice: "7.000", adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now },
  ]);
  await connection.db.insert(accounts).values([{ id: employeeId, phone, role: "employee", passwordHash, createdAt: now, updatedAt: now }, { id: otherId, phone: otherPhone, role: "employee", passwordHash, createdAt: now, updatedAt: now }]);
  await connection.db.insert(employees).values([{ accountId: employeeId, branchId, displayName: "first", createdAt: now, updatedAt: now }, { accountId: otherId, branchId: otherBranchId, displayName: "second", createdAt: now, updatedAt: now }]);
  await connection.db.insert(clients).values({ id: clientId, name: "client", phone: `+965${randomInt(30000000, 39999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values({ id: addressId, clientId, area: "area", block: "3", street: "street", houseNumber: "12", createdAt: now, updatedAt: now });
  await connection.db.insert(employeeWorkIntervals).values([employeeId, otherId].flatMap(employeeId => Array.from({ length: 7 }, (_, dayOfWeek) => ({ employeeId, dayOfWeek, startTime: "08:00", endTime: "23:00" }))));
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD); employee = await signIn(phone, "employee-password-123"); other = await signIn(otherPhone, "employee-password-123");
});
beforeEach(async () => {
  date = new Date(Date.UTC(2099, 0, day++)).toISOString().slice(0, 10);
  const created = await write("post", "/bookings", { clientId, addressId, employeeId, date, startTime: "09:00", endTime: "09:20", adultCount: 1, childCount: 1 });
  expect(created.status).toBe(201); booking = created.body;
});
afterAll(async () => {
  for (const table of ["cash_payment_events", "cash_payments"]) {
    const [tables] = await connection.pool.query("SHOW TABLES LIKE ?", [table]);
    if ((tables as unknown[]).length) await connection.pool.execute(`DELETE FROM ${table} WHERE booking_id IN (SELECT id FROM bookings WHERE client_id = ?)`, [clientId]);
  }
  for (const table of ["booking_revisions", "booking_visit_events", "invoices"]) await connection.pool.execute(`DELETE FROM ${table} WHERE booking_id IN (SELECT id FROM bookings WHERE client_id = ?)`, [clientId]);
  await connection.pool.execute("DELETE FROM bookings WHERE client_id = ?", [clientId]);
  for (const id of [employeeId, otherId]) {
    await connection.db.delete(employeeWorkIntervals).where(eq(employeeWorkIntervals.employeeId, id));
    await connection.db.delete(employees).where(eq(employees.accountId, id)); await connection.db.delete(accounts).where(eq(accounts.id, id));
  }
  await connection.db.delete(clientAddresses).where(eq(clientAddresses.clientId, clientId)); await connection.db.delete(clients).where(eq(clients.id, clientId));
  for (const id of [branchId, otherBranchId]) await connection.db.delete(branches).where(eq(branches.id, id)); await connection.pool.end();
});
describe("full cash receipts and administrator corrections", () => {
  it("reconciles extra cash and refunds exactly while retaining the original full receipt", async () => {
    const paymentId = await paidFutureBooking();
    const increased = await edit({ adultCount: 2, reconciliation: { action: "extra_cash", amount: "5.125", reason: "additional cash received" } }, 3);
    expect(increased.status).toBe(200); expect(increased.body.invoice).toMatchObject({ id: booking.invoice.id, total: "13.251", paymentStatus: "paid" });
    const decreased = await edit({ childCount: 0, reconciliation: { action: "refund", amount: "3.001", reason: "cash returned" } }, 4);
    expect(decreased.status).toBe(200); expect(decreased.body.invoice.total).toBe("10.250");
    const history = await payments(); expect(history.body.payments).toHaveLength(1);
    expect(history.body.payment).toMatchObject({ id: paymentId, originalAmount: "8.126", amount: "10.250", bookingAtReceipt: { invoice: { total: "8.126" } } });
    expect(history.body.events.map((event: { kind: string }) => event.kind)).toEqual(["recorded", "extra_cash", "refund"]);
    expect(history.body.events[2]).toMatchObject({ amount: "3.001", reason: "cash returned", actorAccountId: admin.id, before: { amount: "13.251" }, after: { amount: "10.250" } });
    const revisions = await request(app).get(`/bookings/${booking.id}/revisions`).set("Cookie", admin.cookie);
    expect(revisions.body.revisions[0].id).toBe(history.body.events[1].revisionId);
    expect(revisions.body.revisions[1].id).toBe(history.body.events[2].revisionId);
  });
  it("requires the precise cash difference/direction/reason and preserves originals on rejection", async () => {
    await paidFutureBooking(); const before = (await detail()).body;
    for (const patch of [{ adultCount: 2 }, { adultCount: 2, reconciliation: { action: "refund", amount: "5.125", reason: "wrong direction" } }, { adultCount: 2, reconciliation: { action: "extra_cash", amount: "5.124", reason: "wrong amount" } }]) expect((await edit(patch, 3)).status).toBe(409);
    expect((await edit({ adultCount: 2, reconciliation: { action: "extra_cash", amount: "5.125", reason: " " } }, 3)).status).toBe(400);
    expect((await detail()).body).toEqual(before); expect((await payments()).body.events).toHaveLength(1);
  });
  it("allows a paid time-only edit without a cash adjustment and rejects unnecessary adjustments", async () => {
    await paidFutureBooking();
    expect((await edit({ startTime: "10:00", endTime: "10:20", reconciliation: { action: "extra_cash", amount: "1.000", reason: "unnecessary" } }, 3)).status).toBe(409);
    expect((await edit({ startTime: "10:00", endTime: "10:20" }, 3)).status).toBe(200);
    expect((await payments()).body.events).toHaveLength(1); expect((await detail()).body.invoice.paymentStatus).toBe("paid");
  });
  it("reconciles branch reassignment without moving the original cash attribution or former employee access", async () => {
    await paidFutureBooking();
    expect((await edit({ employeeId: otherId, reconciliation: { action: "extra_cash", amount: "7.874", reason: "new branch difference received" } }, 3)).status).toBe(200);
    expect((await payments(employee)).status).toBe(403);
    const history = await payments(other); expect(history.status).toBe(200);
    expect(history.body.payment).toMatchObject({ amount: "16.000", bookingAtReceipt: { employeeId, branchId } });
    expect((await detail()).body).toMatchObject({ employeeId: otherId, branchId: otherBranchId, invoice: { paymentStatus: "paid", total: "16.000" } });
  });
  it("serializes competing paid edits and their cash adjustments", async () => {
    await paidFutureBooking();
    const results = await Promise.all([edit({ adultCount: 2, reconciliation: { action: "extra_cash", amount: "5.125", reason: "extra" } }, 3), edit({ childCount: 0, reconciliation: { action: "refund", amount: "3.001", reason: "refund" } }, 3)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const history = await payments(); expect(history.body.events).toHaveLength(2); expect(history.body.payment.amount).toBe((await detail()).body.invoice.total);
  });
  it("rejects cash adjustments on unpaid bookings and paid flags without a real receipt", async () => {
    expect((await edit({ adultCount: 2, reconciliation: { action: "extra_cash", amount: "5.125", reason: "no receipt" } }, 0)).status).toBe(409);
    await connection.pool.execute("UPDATE invoices SET payment_status = 'paid' WHERE booking_id = ?", [booking.id]);
    const changed = await edit({ startTime: "10:00", endTime: "10:20" }, 0);
    expect(changed.status).toBe(409); expect(changed.body.error.code).toBe("PAYMENT_RECORD_MISSING");
    expect((await payments()).body.payments).toEqual([]);
  });
  it("rolls back paid invoice/revision/receipt together if cash-adjustment history fails", async () => {
    await paidFutureBooking(); const before = (await detail()).body;
    const trigger = `verification_${randomUUID().replaceAll("-", "")}`;
    await connection.pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON cash_payment_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cash adjustment failure'`);
    try {
      expect((await edit({ adultCount: 2, reconciliation: { action: "extra_cash", amount: "5.125", reason: "extra" } }, 3)).status).toBe(500);
      expect((await detail()).body).toEqual(before); expect((await payments()).body.payment.amount).toBe("8.126");
      expect((await request(app).get(`/bookings/${booking.id}/revisions`).set("Cookie", admin.cookie)).body.revisions).toEqual([]);
    } finally { await connection.pool.query(`DROP TRIGGER ${trigger}`); }
  });
  it("records the exact invoice once after arrival without completing or repricing the visit", async () => {
    expect((await record(0)).status).toBe(409);
    expect((await correct("arrived", 0)).status).toBe(200);
    const paid = await record(1); expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ booking: { visitStatus: "arrived", visitVersion: 2, invoice: { id: booking.invoice.id, total: "8.126", paymentStatus: "paid" } }, payment: { amount: "8.126", originalAmount: "8.126", status: "active", recordedBy: employeeId, bookingAtReceipt: { employee: { id: employeeId, branchId } } } });
    expect((await record(2)).status).toBe(409);
    const history = await payments(); expect(history.status).toBe(200); expect(history.body.payments).toHaveLength(1); expect(history.body.events).toHaveLength(1);
    expect(history.body.events[0]).toMatchObject({ kind: "recorded", actorAccountId: employeeId, before: null, amount: "8.126" });
  });
  it("allows full payment after completion and refuses cancelled/no-show visits", async () => {
    expect((await correct("completed", 0)).status).toBe(200); expect((await record(1)).status).toBe(200);
    expect((await detail()).body.visitStatus).toBe("completed");
  });
  it.each(["cancelled", "no_show"])("denies cash recording for %s visits", async status => {
    expect((await correct(status, 0)).status).toBe(200); expect((await record(1)).status).toBe(409);
    expect((await payments()).body.payments).toEqual([]);
  });
  it("enforces employee ownership, CSRF, and server-selected amount", async () => {
    expect((await record(0, other)).status).toBe(403);
    expect((await payments(other)).status).toBe(403);
    expect((await request(app).post(`/bookings/${booking.id}/payment`).set("Origin", origin).set("Cookie", employee.cookie).send({ expectedVersion: 0 })).status).toBe(403);
    expect((await write("post", `/bookings/${booking.id}/payment`, { expectedVersion: 0, amount: "1.000" })).status).toBe(400);
  });
  it("accepts only one concurrent receipt and enforces database uniqueness for active payments", async () => {
    expect((await correct("arrived", 0)).status).toBe(200);
    const results = await Promise.all([record(1), record(1)]); expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await payments()).body.payments).toHaveLength(1);
    await expect(connection.pool.execute("INSERT INTO cash_payments (id, booking_id, invoice_id, original_amount, amount, status, recorded_by, recorded_at, booking_at_receipt) SELECT UUID(), booking_id, invoice_id, original_amount, amount, status, recorded_by, recorded_at, booking_at_receipt FROM cash_payments WHERE booking_id = ?", [booking.id])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
  });
  it("undoes a mistaken entry with history and permits one replacement full payment", async () => {
    expect((await correct("arrived", 0)).status).toBe(200); const paid = await record(1); expect(paid.status).toBe(200);
    const id = paid.body.payment.id;
    expect((await undo(id, 2, employee)).status).toBe(403); expect((await undo(id, 2, admin, " ")).status).toBe(400);
    const corrected = await undo(id, 2); expect(corrected.status).toBe(200);
    expect(corrected.body).toMatchObject({ booking: { visitStatus: "arrived", visitVersion: 3, invoice: { paymentStatus: "unpaid", total: "8.126" } }, payment: { id, status: "voided", amount: "8.126" } });
    expect((await undo(id, 3)).status).toBe(409); expect((await record(3)).status).toBe(200);
    const history = await payments(); expect(history.body.payments).toHaveLength(2);
    expect(history.body.events.map((event: { kind: string }) => event.kind)).toEqual(["recorded", "voided", "recorded"]);
    expect(history.body.events[1]).toMatchObject({ actorAccountId: admin.id, reason: "mistaken cash entry", before: { status: "active" }, after: { status: "voided" } });
  });
  it("keeps recorded cash and history on cancellation without an automatic refund", async () => {
    expect((await correct("arrived", 0)).status).toBe(200); expect((await record(1)).status).toBe(200);
    expect((await write("post", `/bookings/${booking.id}/visit`, { status: "cancelled", expectedVersion: 2 }, employee)).status).toBe(200);
    expect((await detail()).body.invoice).toMatchObject({ status: "cancelled", paymentStatus: "paid" });
    const history = await payments(); expect(history.body.payment.amount).toBe("8.126"); expect(history.body.events).toHaveLength(1);
  });
  it("undoes an adjusted receipt as a data correction without creating a refund", async () => {
    const id = await paidFutureBooking();
    expect((await edit({ adultCount: 2, reconciliation: { action: "extra_cash", amount: "5.125", reason: "extra" } }, 3)).status).toBe(200);
    expect((await undo(id, 4)).status).toBe(200);
    const history = await payments(); expect(history.body.payment).toBeNull();
    expect(history.body.payments[0]).toMatchObject({ status: "voided", originalAmount: "8.126", amount: "13.251" });
    expect(history.body.events.map((event: { kind: string }) => event.kind)).toEqual(["recorded", "extra_cash", "voided"]);
    expect((await detail()).body.invoice).toMatchObject({ total: "13.251", paymentStatus: "unpaid" });
    expect((await correct("arrived", 5)).status).toBe(200); expect((await record(6)).body.payment.amount).toBe("13.251");
  });
  it("allows independent barbers to record cash concurrently", async () => {
    const second = await write("post", "/bookings", { clientId, addressId, employeeId: otherId, date, startTime: "09:00", endTime: "09:20", adultCount: 1, childCount: 1 }); expect(second.status).toBe(201);
    expect((await correct("arrived", 0)).status).toBe(200);
    expect((await write("post", `/bookings/${second.body.id}/visit/correction`, { status: "arrived", expectedVersion: 0, reason: "correct visit" })).status).toBe(200);
    const results = await Promise.all([record(1), write("post", `/bookings/${second.body.id}/payment`, { expectedVersion: 1 }, other)]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
  });
  it("serializes undo against a paid edit without losing payment history", async () => {
    const id = await paidFutureBooking();
    const results = await Promise.all([undo(id, 3), edit({ adultCount: 2, reconciliation: { action: "extra_cash", amount: "5.125", reason: "extra" } }, 3)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await payments()).body.events).toHaveLength(2);
    const current = (await detail()).body, history = (await payments()).body;
    if (current.invoice.paymentStatus === "paid") expect(history.payment.amount).toBe(current.invoice.total);
    else { expect(history.payment).toBeNull(); expect(current.invoice.total).toBe("8.126"); }
  });
  it("rolls back cash, invoice, and version when payment history cannot be saved", async () => {
    expect((await correct("arrived", 0)).status).toBe(200);
    const trigger = `verification_${randomUUID().replaceAll("-", "")}`;
    await connection.pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON cash_payment_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cash history failure'`);
    try { expect((await record(1)).status).toBe(500); expect((await detail()).body).toMatchObject({ visitVersion: 1, invoice: { paymentStatus: "unpaid" } }); expect((await payments()).body.payments).toEqual([]); }
    finally { await connection.pool.query(`DROP TRIGGER ${trigger}`); }
  });
});
