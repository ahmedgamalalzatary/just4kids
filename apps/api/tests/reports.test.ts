import { randomInt, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, bookingRevisions, bookingVisitEvents, bookings, branches, clientAddresses, clients, employees, invoices, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const branchOne = randomUUID(), branchTwo = randomUUID(), barberA = randomUUID(), barberB = randomUUID(), barberC = randomUUID();
const clientOne = randomUUID(), clientTwo = randomUUID(), addressOne = randomUUID(), addressTwo = randomUUID();
const phones = { [barberA]: `+965${randomInt(40000000, 44999999)}`, [barberB]: `+965${randomInt(45000000, 49999999)}`, [barberC]: `+965${randomInt(50000000, 54999999)}` };
const range = { from: "2097-03-01", to: "2097-03-03" };
type Session = { cookie: string; accountId: string };
let admin: Session, sessionA: Session, sessionB: Session;
type Fixture = { date: string; employeeId: string; branchId: string; clientId: string; status: "booked" | "arrived" | "completed" | "cancelled" | "no_show"; source: "manual" | "ai"; adult: number; child: number; createdAt: string; paid?: boolean };
// b1/b2 are barber A's branch-one work before transfer; b5 is after transfer. b2 is completed but unpaid; b3 is cancelled after being paid.
const fixtures: Fixture[] = [
  { date: "2097-03-01", employeeId: barberA, branchId: branchOne, clientId: clientOne, status: "completed", source: "manual", adult: 2, child: 1, createdAt: "2097-02-20T22:30:00Z", paid: true },
  { date: "2097-03-01", employeeId: barberA, branchId: branchOne, clientId: clientTwo, status: "completed", source: "ai", adult: 1, child: 0, createdAt: "2097-02-21T10:00:00Z" },
  { date: "2097-03-02", employeeId: barberB, branchId: branchOne, clientId: clientOne, status: "cancelled", source: "manual", adult: 0, child: 2, createdAt: "2097-02-21T21:00:00Z", paid: true },
  { date: "2097-03-02", employeeId: barberC, branchId: branchTwo, clientId: clientTwo, status: "no_show", source: "manual", adult: 1, child: 1, createdAt: "2097-02-22T00:00:00Z" },
  { date: "2097-03-03", employeeId: barberA, branchId: branchTwo, clientId: clientOne, status: "booked", source: "manual", adult: 3, child: 0, createdAt: "2097-02-25T08:00:00Z" },
  { date: "2097-03-03", employeeId: barberC, branchId: branchTwo, clientId: clientOne, status: "arrived", source: "ai", adult: 0, child: 1, createdAt: "2097-02-25T09:00:00Z" },
];
const ids: string[] = fixtures.map(() => randomUUID());
const references = ids.map(id => `J4K-RPT${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`);
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, accountId: response.body.account.id as string };
}
function report(kind: "reservations" | "haircuts", query: Record<string, string>, session = admin) {
  return request(app).get(`/reports/${kind}`).query(query).set("Cookie", session.cookie);
}
const pair = (adult: number, child: number) => ({ adult, child });
beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date();
  await connection.db.insert(branches).values([
    { id: branchOne, name: "فرع التقارير الأول", location: "حولي", adultPrice: "5.000", childPrice: "3.000", adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now },
    { id: branchTwo, name: "فرع التقارير الثاني", location: "الجهراء", adultPrice: "6.000", childPrice: "4.000", adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now },
  ]);
  const passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values([barberA, barberB, barberC].map(id => ({ id, phone: phones[id]!, role: "employee" as const, passwordHash, createdAt: now, updatedAt: now })));
  await connection.db.insert(employees).values([{ accountId: barberA, branchId: branchOne, displayName: "حلاق أ" }, { accountId: barberB, branchId: branchOne, displayName: "حلاق ب" }, { accountId: barberC, branchId: branchTwo, displayName: "حلاق ج" }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
  await connection.db.insert(clients).values([{ id: clientOne, name: "نورة التقارير", phone: `+965${randomInt(55000000, 59999999)}` }, { id: clientTwo, name: "سلمى التقارير", phone: `+965${randomInt(60000000, 64999999)}` }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
  await connection.db.insert(clientAddresses).values([{ id: addressOne, clientId: clientOne }, { id: addressTwo, clientId: clientTwo }].map(row => ({ ...row, area: "حولي", block: "1", street: "شارع 1", houseNumber: "1", createdAt: now, updatedAt: now })));
  const [adminAccount] = await connection.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.role, "admin"));
  for (const [index, fixture] of fixtures.entries()) {
    const id = ids[index]!, branch = fixture.branchId === branchOne ? { name: "فرع التقارير الأول", location: "حولي", adult: 5, child: 3 } : { name: "فرع التقارير الثاني", location: "الجهراء", adult: 6, child: 4 };
    const client = fixture.clientId === clientOne ? { name: "نورة التقارير", phone: "+96555000001" } : { name: "سلمى التقارير", phone: "+96555000002" };
    await connection.db.insert(bookings).values({
      id, reference: references[index]!, clientId: fixture.clientId, addressId: fixture.clientId === clientOne ? addressOne : addressTwo, employeeId: fixture.employeeId, branchId: fixture.branchId, createdBy: adminAccount!.id,
      date: fixture.date, startTime: "10:00", endTime: "11:00", adultCount: fixture.adult, childCount: fixture.child, source: fixture.source, visitStatus: fixture.status, visitVersion: 3,
      clientSnapshot: client, addressSnapshot: { area: "حولي", block: "1", street: "شارع 1", houseNumber: "1", buildingName: null, floor: null, apartment: null, instructions: null, mapsUrl: null, latitude: null, longitude: null },
      employeeSnapshot: { id: fixture.employeeId, displayName: "اسم قديم", branchId: fixture.branchId, branchName: branch.name, branchLocation: branch.location }, createdAt: new Date(fixture.createdAt),
    });
    const adultAmount = fixture.adult * branch.adult, childAmount = fixture.child * branch.child;
    await connection.db.insert(invoices).values({ id: randomUUID(), bookingId: id, adultUnitPrice: `${branch.adult}.000`, childUnitPrice: `${branch.child}.000`, adultAmount: `${adultAmount}.000`, childAmount: `${childAmount}.000`, total: `${adultAmount + childAmount}.000`, status: fixture.status === "cancelled" ? "cancelled" : "issued", paymentStatus: fixture.paid ? "paid" : "unpaid", issuedAt: new Date(fixture.createdAt) });
  }
  const revision = (bookingId: string, version: number) => ({ id: randomUUID(), bookingId, version, actorAccountId: adminAccount!.id, reason: null, occurredAt: now, before: {}, after: {} });
  await connection.db.insert(bookingRevisions).values([revision(ids[0]!, 1), revision(ids[0]!, 2), revision(ids[4]!, 1)]);
  await connection.db.insert(bookingVisitEvents).values([
    { id: randomUUID(), bookingId: ids[2]!, version: 1, fromStatus: "booked", toStatus: "cancelled", actorType: "employee", actorAccountId: barberB, reason: null, correction: false, previousInvoiceStatus: "issued", invoiceStatus: "cancelled", occurredAt: now },
    { id: randomUUID(), bookingId: ids[2]!, version: 2, fromStatus: "cancelled", toStatus: "cancelled", actorType: "admin", actorAccountId: adminAccount!.id, reason: "تصحيح", correction: true, previousInvoiceStatus: "cancelled", invoiceStatus: "cancelled", occurredAt: now },
  ]);
  // Barber A has since moved to branch two; past branch-one work must stay with branch one.
  await connection.db.update(employees).set({ branchId: branchTwo, displayName: "حلاق أ الجديد" }).where(eq(employees.accountId, barberA));
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  sessionA = await signIn(phones[barberA]!, "employee-password-123");
  sessionB = await signIn(phones[barberB]!, "employee-password-123");
});
afterAll(async () => {
  await connection.db.delete(bookingRevisions).where(inArray(bookingRevisions.bookingId, ids));
  await connection.db.delete(bookingVisitEvents).where(inArray(bookingVisitEvents.bookingId, ids));
  await connection.db.delete(invoices).where(inArray(invoices.bookingId, ids));
  await connection.db.delete(bookings).where(inArray(bookings.id, ids));
  await connection.db.delete(clientAddresses).where(inArray(clientAddresses.id, [addressOne, addressTwo]));
  await connection.db.delete(clients).where(inArray(clients.id, [clientOne, clientTwo]));
  await connection.db.delete(employees).where(inArray(employees.accountId, [barberA, barberB, barberC]));
  await connection.db.delete(accounts).where(inArray(accounts.id, [barberA, barberB, barberC]));
  await connection.db.delete(branches).where(inArray(branches.id, [branchOne, branchTwo]));
  await connection.pool.end();
});

describe("reservation overview report", () => {
  it("requires a signed-in account and rejects invalid filters", async () => {
    expect((await request(app).get("/reports/reservations")).status).toBe(401);
    const invalid = await report("reservations", { from: "2097-03-03", to: "2097-03-01" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_INPUT");
  });
  it("summarizes statuses, sources, edits, and corrections by visit date and lists the matching reservations", async () => {
    const response = await report("reservations", range);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ dateBasis: "visit_date", timeZone: "Asia/Kuwait", total: 6, limit: 20, offset: 0 });
    expect(response.body.summary).toEqual({ bookings: 6, statuses: { booked: 1, arrived: 1, completed: 2, cancelled: 1, no_show: 1 }, sources: { manual: 4, ai: 2 }, editedBookings: 2, edits: 3, correctedBookings: 1, corrections: 1 });
    // Newest visit date first; equal windows fall back to descending ID.
    const descending = (left: string, right: string) => right.localeCompare(left);
    expect(response.body.bookings.map((booking: { id: string }) => booking.id)).toEqual([[ids[4]!, ids[5]!], [ids[2]!, ids[3]!], [ids[0]!, ids[1]!]].flatMap(day => day.sort(descending)));
    const first = response.body.bookings.find((booking: { id: string }) => booking.id === ids[0]);
    expect(first).toMatchObject({ editCount: 2, correctionCount: 0, visitStatus: "completed", invoice: { paymentStatus: "paid" } });
    expect(response.body.bookings.find((booking: { id: string }) => booking.id === ids[2])).toMatchObject({ editCount: 0, correctionCount: 1, visitStatus: "cancelled", invoice: { status: "cancelled", paymentStatus: "paid" } });
  });
  it("applies inclusive visit-date and Kuwait booking-date boundaries", async () => {
    const visitDay = await report("reservations", { from: "2097-03-02", to: "2097-03-02" });
    expect(visitDay.body.bookings.map((booking: { id: string }) => booking.id).sort()).toEqual([ids[2], ids[3]].sort());
    // b1 was made at 01:30 and b2 at 13:00 Kuwait time on 21 February; b3 at 00:00 on 22 February Kuwait time, though still 21 February in UTC.
    const bookedDay = await report("reservations", { dateBasis: "created_date", from: "2097-02-21", to: "2097-02-21" });
    expect(bookedDay.body.dateBasis).toBe("created_date");
    expect(bookedDay.body.bookings.map((booking: { id: string }) => booking.id).sort()).toEqual([ids[0], ids[1]].sort());
    expect(bookedDay.body.summary.bookings).toBe(2);
  });
  it("filters by status, source, client, branch, barber, and search text, and paginates details without changing the summary", async () => {
    const idsFor = async (query: Record<string, string>) => (await report("reservations", { ...range, ...query })).body.bookings.map((booking: { id: string }) => booking.id).sort();
    expect(await idsFor({ status: "completed" })).toEqual([ids[0], ids[1]].sort());
    expect(await idsFor({ source: "ai" })).toEqual([ids[1], ids[5]].sort());
    expect(await idsFor({ clientId: clientTwo })).toEqual([ids[1], ids[3]].sort());
    expect(await idsFor({ branchId: branchOne })).toEqual([ids[0], ids[1], ids[2]].sort());
    expect(await idsFor({ employeeId: barberA })).toEqual([ids[0], ids[1], ids[4]].sort());
    expect(await idsFor({ q: "سلمى" })).toEqual([ids[1], ids[3]].sort());
    expect(await idsFor({ q: references[2]!.toLowerCase() })).toEqual([ids[2]]);
    expect(await idsFor({ q: "%" })).toEqual([]);
    const page = await report("reservations", { ...range, limit: "2", offset: "2" });
    expect(page.body).toMatchObject({ total: 6, limit: 2, offset: 2, summary: { bookings: 6 } });
    expect(page.body.bookings).toHaveLength(2);
  });
  it("limits a barber to their own reservations and denies another barber's filter", async () => {
    const own = await report("reservations", range, sessionA);
    expect(own.status).toBe(200);
    expect(own.body.bookings.map((booking: { id: string }) => booking.id).sort()).toEqual([ids[0], ids[1], ids[4]].sort());
    expect(own.body.summary).toMatchObject({ bookings: 3, editedBookings: 2, edits: 3, correctedBookings: 0 });
    expect((await report("reservations", { ...range, employeeId: barberA }, sessionA)).status).toBe(200);
    const denied = await report("reservations", { ...range, employeeId: barberB }, sessionA);
    expect(denied.status).toBe(403);
    expect((await report("haircuts", { ...range, employeeId: barberA }, sessionB)).status).toBe(403);
  });
});

describe("haircut report", () => {
  it("separates reserved, completed, open, cancelled, and no-show quantities, counting completed unpaid visits", async () => {
    const response = await report("haircuts", range);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ dateBasis: "visit_date", timeZone: "Asia/Kuwait" });
    expect(response.body.totals).toEqual({ bookings: 6, reserved: pair(7, 5), completed: pair(3, 1), open: pair(3, 1), cancelled: pair(0, 2), noShow: pair(1, 1) });
    expect(response.body.byDate).toEqual([
      { date: "2097-03-01", bookings: 2, reserved: pair(3, 1), completed: pair(3, 1), open: pair(0, 0), cancelled: pair(0, 0), noShow: pair(0, 0) },
      { date: "2097-03-02", bookings: 2, reserved: pair(1, 3), completed: pair(0, 0), open: pair(0, 0), cancelled: pair(0, 2), noShow: pair(1, 1) },
      { date: "2097-03-03", bookings: 2, reserved: pair(3, 1), completed: pair(0, 0), open: pair(3, 1), cancelled: pair(0, 0), noShow: pair(0, 0) },
    ]);
  });
  it("keeps past work with the recorded branch after a barber transfer", async () => {
    const response = await report("haircuts", range);
    expect(response.body.byBranch).toEqual([
      { branchId: branchOne, branchName: "فرع التقارير الأول", bookings: 3, reserved: pair(3, 3), completed: pair(3, 1), open: pair(0, 0), cancelled: pair(0, 2), noShow: pair(0, 0) },
      { branchId: branchTwo, branchName: "فرع التقارير الثاني", bookings: 3, reserved: pair(4, 2), completed: pair(0, 0), open: pair(3, 1), cancelled: pair(0, 0), noShow: pair(1, 1) },
    ]);
    const barberRows = response.body.byEmployee.filter((row: { employeeId: string }) => row.employeeId === barberA);
    expect(barberRows).toEqual([
      { employeeId: barberA, displayName: "حلاق أ الجديد", branchId: branchOne, branchName: "فرع التقارير الأول", bookings: 2, reserved: pair(3, 1), completed: pair(3, 1), open: pair(0, 0), cancelled: pair(0, 0), noShow: pair(0, 0) },
      { employeeId: barberA, displayName: "حلاق أ الجديد", branchId: branchTwo, branchName: "فرع التقارير الثاني", bookings: 1, reserved: pair(3, 0), completed: pair(0, 0), open: pair(3, 0), cancelled: pair(0, 0), noShow: pair(0, 0) },
    ]);
    expect(response.body.byEmployee).toHaveLength(4);
  });
  it("uses the Kuwait booking date basis and the same filters", async () => {
    const response = await report("haircuts", { dateBasis: "created_date", from: "2097-02-21", to: "2097-02-22" });
    expect(response.body.dateBasis).toBe("created_date");
    expect(response.body.byDate.map((row: { date: string; bookings: number }) => [row.date, row.bookings])).toEqual([["2097-02-21", 2], ["2097-02-22", 2]]);
    const completed = await report("haircuts", { ...range, status: "completed", source: "ai" });
    expect(completed.body.totals).toMatchObject({ bookings: 1, reserved: pair(1, 0), completed: pair(1, 0) });
  });
  it("limits a barber's haircut report to their own work", async () => {
    const response = await report("haircuts", range, sessionB);
    expect(response.status).toBe(200);
    expect(response.body.totals).toMatchObject({ bookings: 1, cancelled: pair(0, 2) });
    expect(response.body.byEmployee.map((row: { employeeId: string }) => row.employeeId)).toEqual([barberB]);
  });
});
