import { randomInt, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, bookingRevisions, bookings, branches, cashPayments, clientAddresses, clients, employeeExceptionIntervals, employeeScheduleExceptions, employeeWorkIntervals, employees, invoices, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const branchOne = randomUUID(), branchTwo = randomUUID(), barberA = randomUUID(), barberB = randomUUID(), barberC = randomUUID(), clientId = randomUUID(), addressId = randomUUID();
const barbers: string[] = [barberA, barberB, barberC];
const phones: Record<string, string> = { [barberA]: `+965${randomInt(65000000, 69999999)}`, [barberB]: `+965${randomInt(70000000, 74999999)}`, [barberC]: `+965${randomInt(75000000, 79999999)}` };
const range = { from: "2096-04-06", to: "2096-04-08" };
const firstWeekday = new Date(`${range.from}T00:00:00Z`).getUTCDay();
type Session = { cookie: string };
let admin: Session, sessionA: Session;
type Fixture = { employeeId: string; branchId: string; status: "booked" | "arrived" | "completed" | "cancelled" | "no_show"; adult: number; child: number; start: string; end: string; cash?: { original: string; amount: string; status: "active" | "voided" } };
// Branch one: adult 5, child 3. Branch two: adult 6, child 4. Barber A transferred from branch one to branch two after fixtures 1–2.
const fixtures: Fixture[] = [
  { employeeId: barberA, branchId: branchOne, status: "completed", adult: 2, child: 1, start: "10:00", end: "11:00", cash: { original: "13.000", amount: "13.000", status: "active" } },
  { employeeId: barberA, branchId: branchOne, status: "cancelled", adult: 1, child: 0, start: "11:00", end: "11:30", cash: { original: "5.000", amount: "5.000", status: "active" } },
  { employeeId: barberA, branchId: branchTwo, status: "booked", adult: 0, child: 2, start: "12:00", end: "12:20" },
  { employeeId: barberB, branchId: branchOne, status: "no_show", adult: 1, child: 0, start: "09:00", end: "09:40" },
  { employeeId: barberB, branchId: branchOne, status: "arrived", adult: 1, child: 1, start: "14:00", end: "16:00", cash: { original: "7.000", amount: "8.000", status: "active" } },
  { employeeId: barberC, branchId: branchTwo, status: "completed", adult: 1, child: 0, start: "10:00", end: "10:20", cash: { original: "6.000", amount: "6.000", status: "voided" } },
];
const ids: string[] = fixtures.map(() => randomUUID());
const prices = { [branchOne]: { adult: 5, child: 3 }, [branchTwo]: { adult: 6, child: 4 } } as Record<string, { adult: number; child: number }>;
const money = (count: number, total: string) => ({ count, total });
const quantities = (adult: number, child: number) => ({ adult, child });
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]! };
}
function report(kind: "employees" | "branches", query: Record<string, string>, session = admin) {
  return request(app).get(`/reports/${kind}`).query(query).set("Cookie", session.cookie);
}
type Row = { employeeId?: string; branchId: string };
beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date();
  await connection.db.insert(branches).values([{ id: branchOne, name: "أداء الفرع الأول" }, { id: branchTwo, name: "أداء الفرع الثاني" }].map(row => ({ ...row, location: "حولي", adultPrice: `${prices[row.id]!.adult}.000`, childPrice: `${prices[row.id]!.child}.000`, adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now })));
  const passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values(barbers.map(id => ({ id, phone: phones[id]!, role: "employee" as const, passwordHash, enabled: id !== barberC, createdAt: now, updatedAt: now })));
  await connection.db.insert(employees).values([{ accountId: barberA, branchId: branchOne, displayName: "أداء أ" }, { accountId: barberB, branchId: branchOne, displayName: "أداء ب" }, { accountId: barberC, branchId: branchTwo, displayName: "أداء ج" }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
  // A: 480 minutes every day, closed on the second day. B: 480 minutes on the first weekday only, plus 120 special minutes on the third day. C: no hours.
  await connection.db.insert(employeeWorkIntervals).values([
    ...Array.from({ length: 7 }, (_, dayOfWeek) => [{ employeeId: barberA, dayOfWeek, startTime: "08:00", endTime: "12:00" }, { employeeId: barberA, dayOfWeek, startTime: "13:00", endTime: "17:00" }]).flat(),
    { employeeId: barberB, dayOfWeek: firstWeekday, startTime: "09:00", endTime: "17:00" },
  ]);
  const closed = randomUUID(), special = randomUUID();
  await connection.db.insert(employeeScheduleExceptions).values([{ id: closed, employeeId: barberA, date: "2096-04-07" }, { id: special, employeeId: barberB, date: "2096-04-08" }]);
  await connection.db.insert(employeeExceptionIntervals).values({ exceptionId: special, startTime: "10:00", endTime: "12:00" });
  await connection.db.insert(clients).values({ id: clientId, name: "عميل الأداء", phone: `+965${randomInt(80000000, 84999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values({ id: addressId, clientId, area: "حولي", block: "1", street: "شارع 1", houseNumber: "1", createdAt: now, updatedAt: now });
  const [adminAccount] = await connection.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.role, "admin"));
  for (const [index, fixture] of fixtures.entries()) {
    const id = ids[index]!, price = prices[fixture.branchId]!, invoiceId = randomUUID();
    await connection.db.insert(bookings).values({
      id, reference: `J4K-PRF${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`, clientId, addressId, employeeId: fixture.employeeId, branchId: fixture.branchId, createdBy: adminAccount!.id,
      date: "2096-04-06", startTime: fixture.start, endTime: fixture.end, adultCount: fixture.adult, childCount: fixture.child, source: "manual", visitStatus: fixture.status, visitVersion: 2,
      clientSnapshot: { name: "عميل الأداء", phone: "+96555000003" }, addressSnapshot: { area: "حولي", block: "1", street: "شارع 1", houseNumber: "1", buildingName: null, floor: null, apartment: null, instructions: null, mapsUrl: null, latitude: null, longitude: null },
      employeeSnapshot: { id: fixture.employeeId, displayName: "قديم", branchId: fixture.branchId, branchName: "قديم", branchLocation: "حولي" }, createdAt: new Date("2096-04-01T08:00:00Z"),
    });
    const adultAmount = price.adult * fixture.adult, childAmount = price.child * fixture.child;
    await connection.db.insert(invoices).values({ id: invoiceId, bookingId: id, adultUnitPrice: `${price.adult}.000`, childUnitPrice: `${price.child}.000`, adultAmount: `${adultAmount}.000`, childAmount: `${childAmount}.000`, total: `${adultAmount + childAmount}.000`, status: fixture.status === "cancelled" ? "cancelled" : "issued", paymentStatus: fixture.cash?.status === "active" ? "paid" : "unpaid", issuedAt: now });
    if (fixture.cash) await connection.db.insert(cashPayments).values({ id: randomUUID(), bookingId: id, invoiceId, originalAmount: fixture.cash.original, amount: fixture.cash.amount, status: fixture.cash.status, recordedBy: fixture.employeeId, recordedAt: now, bookingAtReceipt: {} });
  }
  // A revised invoice is still one invoice and must not be counted twice.
  await connection.db.insert(bookingRevisions).values({ id: randomUUID(), bookingId: ids[4]!, version: 1, actorAccountId: adminAccount!.id, reason: null, occurredAt: now, before: {}, after: {} });
  await connection.db.update(employees).set({ branchId: branchTwo }).where(eq(employees.accountId, barberA));
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  sessionA = await signIn(phones[barberA]!, "employee-password-123");
});
afterAll(async () => {
  await connection.db.delete(bookingRevisions).where(inArray(bookingRevisions.bookingId, ids));
  await connection.db.delete(cashPayments).where(inArray(cashPayments.bookingId, ids));
  await connection.db.delete(invoices).where(inArray(invoices.bookingId, ids));
  await connection.db.delete(bookings).where(inArray(bookings.id, ids));
  await connection.db.delete(clientAddresses).where(eq(clientAddresses.id, addressId));
  await connection.db.delete(clients).where(eq(clients.id, clientId));
  await connection.db.delete(employeeScheduleExceptions).where(inArray(employeeScheduleExceptions.employeeId, barbers));
  await connection.db.delete(employeeWorkIntervals).where(inArray(employeeWorkIntervals.employeeId, barbers));
  await connection.db.delete(employees).where(inArray(employees.accountId, barbers));
  await connection.db.delete(accounts).where(inArray(accounts.id, barbers));
  await connection.db.delete(branches).where(inArray(branches.id, [branchOne, branchTwo]));
  await connection.pool.end();
});

const barberAWork = { bookings: 3, reserved: quantities(3, 3), completed: quantities(2, 1), open: quantities(0, 2), cancelled: quantities(1, 0), noShow: quantities(0, 0), completedVisits: 1, reservedMinutes: 80 };
describe("barber performance report", () => {
  it("requires a session and valid filters", async () => {
    expect((await request(app).get("/reports/employees")).status).toBe(401);
    expect((await report("employees", { from: "2096-04-08", to: "2096-04-06" })).body.error.code).toBe("INVALID_INPUT");
  });
  it("reports work, reserved and scheduled minutes, separate invoice values, and active cash per barber", async () => {
    const response = await report("employees", range);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ dateBasis: "visit_date", timeZone: "Asia/Kuwait" });
    const rows = response.body.employees.filter((row: Row) => barbers.includes(row.employeeId!));
    expect(rows).toEqual([
      { employeeId: barberA, displayName: "أداء أ", enabled: true, branchId: branchTwo, branchName: "أداء الفرع الثاني", availableMinutes: 960, work: barberAWork,
        invoices: { issued: money(2, "21.000"), cancelled: money(1, "5.000"), outstanding: money(1, "8.000") }, cash: money(2, "18.000") },
      { employeeId: barberB, displayName: "أداء ب", enabled: true, branchId: branchOne, branchName: "أداء الفرع الأول", availableMinutes: 600,
        work: { bookings: 2, reserved: quantities(2, 1), completed: quantities(0, 0), open: quantities(1, 1), cancelled: quantities(0, 0), noShow: quantities(1, 0), completedVisits: 0, reservedMinutes: 120 },
        invoices: { issued: money(2, "13.000"), cancelled: money(0, "0.000"), outstanding: money(1, "5.000") }, cash: money(1, "8.000") },
      { employeeId: barberC, displayName: "أداء ج", enabled: false, branchId: branchTwo, branchName: "أداء الفرع الثاني", availableMinutes: 0,
        work: { bookings: 1, reserved: quantities(1, 0), completed: quantities(1, 0), open: quantities(0, 0), cancelled: quantities(0, 0), noShow: quantities(0, 0), completedVisits: 1, reservedMinutes: 20 },
        invoices: { issued: money(1, "6.000"), cancelled: money(0, "0.000"), outstanding: money(1, "6.000") }, cash: money(0, "0.000") },
    ]);
  });
  it("leaves scheduled minutes empty without a visit-date range", async () => {
    const created = await report("employees", { dateBasis: "created_date", from: "2096-04-01", to: "2096-04-01", employeeId: barberA });
    expect(created.body.employees).toEqual([expect.objectContaining({ employeeId: barberA, availableMinutes: null, work: barberAWork })]);
    const open = await report("employees", { employeeId: barberA });
    expect(open.body.employees[0].availableMinutes).toBeNull();
  });
  it("keeps a transferred barber's earlier work with the earlier branch", async () => {
    const response = await report("employees", { ...range, branchId: branchOne });
    const rows = response.body.employees.filter((row: Row) => barbers.includes(row.employeeId!));
    expect(rows.map((row: Row) => row.employeeId)).toEqual([barberA, barberB]);
    expect(rows[0]).toMatchObject({ branchId: branchTwo, work: { bookings: 2, reservedMinutes: 60, completedVisits: 1 }, invoices: { issued: money(1, "13.000"), cancelled: money(1, "5.000") }, cash: money(2, "18.000") });
  });
  it("shows a barber only their own row and denies another barber", async () => {
    const own = await report("employees", range, sessionA);
    expect(own.status).toBe(200);
    expect(own.body.employees.map((row: Row) => row.employeeId)).toEqual([barberA]);
    expect((await report("employees", { ...range, employeeId: barberB }, sessionA)).status).toBe(403);
    expect((await report("branches", { ...range, employeeId: barberB }, sessionA)).status).toBe(403);
  });
});

describe("branch performance report", () => {
  it("reports each branch with its barber breakdown by recorded branch", async () => {
    const response = await report("branches", range);
    expect(response.status).toBe(200);
    const rows = response.body.branches.filter((row: Row) => ([branchOne, branchTwo] as string[]).includes(row.branchId));
    expect(rows).toEqual([
      { branchId: branchOne, branchName: "أداء الفرع الأول",
        work: { bookings: 4, reserved: quantities(5, 2), completed: quantities(2, 1), open: quantities(1, 1), cancelled: quantities(1, 0), noShow: quantities(1, 0), completedVisits: 1, reservedMinutes: 180 },
        invoices: { issued: money(3, "26.000"), cancelled: money(1, "5.000"), outstanding: money(1, "5.000") }, cash: money(3, "26.000"),
        employees: [expect.objectContaining({ employeeId: barberA, displayName: "أداء أ", work: expect.objectContaining({ bookings: 2 }), cash: money(2, "18.000") }), expect.objectContaining({ employeeId: barberB, work: expect.objectContaining({ bookings: 2 }) })] },
      { branchId: branchTwo, branchName: "أداء الفرع الثاني",
        work: { bookings: 2, reserved: quantities(1, 2), completed: quantities(1, 0), open: quantities(0, 2), cancelled: quantities(0, 0), noShow: quantities(0, 0), completedVisits: 1, reservedMinutes: 40 },
        invoices: { issued: money(2, "14.000"), cancelled: money(0, "0.000"), outstanding: money(2, "14.000") }, cash: money(0, "0.000"),
        employees: [expect.objectContaining({ employeeId: barberA, work: expect.objectContaining({ bookings: 1 }) }), expect.objectContaining({ employeeId: barberC, work: expect.objectContaining({ bookings: 1 }) })] },
    ]);
  });
  it("lists every branch for the administrator, even without matching work", async () => {
    const response = await report("branches", { ...range, status: "booked" });
    const one = response.body.branches.find((row: Row) => row.branchId === branchOne);
    expect(one).toMatchObject({ work: { bookings: 0, reservedMinutes: 0 }, invoices: { issued: money(0, "0.000") }, cash: money(0, "0.000"), employees: [] });
  });
  it("limits a barber's branch report to their own work", async () => {
    const response = await report("branches", range, sessionA);
    expect(response.status).toBe(200);
    expect(response.body.branches.map((row: Row) => row.branchId).sort()).toEqual([branchOne, branchTwo].sort());
    for (const branch of response.body.branches) expect(branch.employees.map((row: Row) => row.employeeId)).toEqual([barberA]);
    expect(response.body.branches.find((row: Row) => row.branchId === branchOne)).toMatchObject({ work: { bookings: 2 }, cash: money(2, "18.000") });
  });
});
