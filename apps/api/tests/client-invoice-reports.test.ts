import { randomInt, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, bookingRevisions, bookingVisitEvents, bookings, branches, cashPayments, clientAddresses, clients, employees, invoices, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const branchOne = randomUUID(), branchTwo = randomUUID(), barberX = randomUUID(), barberY = randomUUID(), barberZ = randomUUID();
const clientOne = randomUUID(), clientTwo = randomUUID(), addressOne = randomUUID(), addressTwo = randomUUID();
const phones: Record<string, string> = { [barberX]: `+965${randomInt(10000000, 19999999)}`, [barberY]: `+965${randomInt(20000000, 29999999)}`, [barberZ]: `+965${randomInt(30000000, 39999999)}` };
const range = { from: "2098-05-01", to: "2098-05-03" };
type Session = { cookie: string };
let admin: Session, sessionX: Session, sessionY: Session;
type Fixture = { date: string; employeeId: string; branchId: string; clientId: string; status: "booked" | "arrived" | "completed" | "cancelled" | "no_show"; adult: number; child: number; cash?: string; edits?: number; corrections?: number };
// f1: completed, paid, edited twice. f2: completed unpaid. f3: cancelled but paid with a correction. f4: no-show unpaid. f5: booked unpaid.
const fixtures: Fixture[] = [
  { date: "2098-05-01", employeeId: barberX, branchId: branchOne, clientId: clientOne, status: "completed", adult: 2, child: 1, cash: "13.000", edits: 2 },
  { date: "2098-05-02", employeeId: barberX, branchId: branchOne, clientId: clientOne, status: "completed", adult: 1, child: 0 },
  { date: "2098-05-02", employeeId: barberY, branchId: branchOne, clientId: clientTwo, status: "cancelled", adult: 0, child: 2, cash: "6.000", corrections: 1 },
  { date: "2098-05-03", employeeId: barberZ, branchId: branchTwo, clientId: clientTwo, status: "no_show", adult: 1, child: 1 },
  { date: "2098-05-03", employeeId: barberX, branchId: branchOne, clientId: clientOne, status: "booked", adult: 3, child: 0 },
];
const ids: string[] = fixtures.map(() => randomUUID());
const references = ids.map(id => `J4K-CIR${id.replaceAll("-", "").slice(0, 11).toUpperCase()}`);
const prices: Record<string, { adult: number; child: number }> = { [branchOne]: { adult: 5, child: 3 }, [branchTwo]: { adult: 6, child: 4 } };
const invoiceTotals = fixtures.map(fixture => {
  const price = prices[fixture.branchId]!;
  return fixture.adult * price.adult + fixture.child * price.child;
});
const invoiceIds: string[] = fixtures.map(() => randomUUID());
const money = (count: number, total: string) => ({ count, total });
// Every fixture receipt is recorded as cash, so the method split keeps it under "cash".
const collected = (count: number, total: string) => ({ count, total, byMethod: { cash: money(count, total), link: money(0, "0.000"), knet: money(0, "0.000") } });
const quantities = (adult: number, child: number) => ({ adult, child, special: 0 });
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]! };
}
function report(kind: "clients" | "invoices", query: Record<string, string>, session = admin) {
  return request(app).get(`/reports/${kind}`).query(query).set("Cookie", session.cookie);
}
beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date();
  await connection.db.insert(branches).values([branchOne, branchTwo].map(id => ({ id, name: id === branchOne ? "فرع العملاء الأول" : "فرع العملاء الثاني", location: "حولي", adultPrice: `${prices[id]!.adult}.000`, childPrice: `${prices[id]!.child}.000`, adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now })));
  const passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values([barberX, barberY, barberZ].map(id => ({ id, phone: phones[id]!, role: "employee" as const, passwordHash, createdAt: now, updatedAt: now })));
  await connection.db.insert(employees).values([{ accountId: barberX, branchId: branchOne, displayName: "عميل تقرير أ" }, { accountId: barberY, branchId: branchOne, displayName: "عميل تقرير ب" }, { accountId: barberZ, branchId: branchTwo, displayName: "عميل تقرير ج" }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
  await connection.db.insert(clients).values([{ id: clientOne, name: "نورة العملاء", phone: `+965${randomInt(85000000, 89999999)}` }, { id: clientTwo, name: "سلمى العملاء", phone: `+965${randomInt(90000000, 94999999)}` }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
  await connection.db.insert(clientAddresses).values([{ id: addressOne, clientId: clientOne }, { id: addressTwo, clientId: clientTwo }].map(row => ({ ...row, area: "حولي", block: "1", street: "شارع 1", houseNumber: "1", createdAt: now, updatedAt: now })));
  const [adminAccount] = await connection.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.role, "admin"));
  for (const [index, fixture] of fixtures.entries()) {
    const id = ids[index]!, price = prices[fixture.branchId]!;
    const branchName = fixture.branchId === branchOne ? "فرع العملاء الأول" : "فرع العملاء الثاني";
    const client = fixture.clientId === clientOne ? { name: "نورة العملاء", phone: "+96555000004" } : { name: "سلمى العملاء", phone: "+96555000005" };
    await connection.db.insert(bookings).values({
      id, reference: references[index]!, clientId: fixture.clientId, addressId: fixture.clientId === clientOne ? addressOne : addressTwo, employeeId: fixture.employeeId, branchId: fixture.branchId, createdBy: adminAccount!.id,
      date: fixture.date, startTime: "10:00", endTime: "11:00", adultCount: fixture.adult, childCount: fixture.child, source: "manual", visitStatus: fixture.status, visitVersion: 3,
      clientSnapshot: client, addressSnapshot: { area: "حولي", block: "1", street: "شارع 1", houseNumber: "1", buildingName: null, floor: null, apartment: null, instructions: null, mapsUrl: null, latitude: null, longitude: null },
      employeeSnapshot: { id: fixture.employeeId, displayName: "اسم قديم", branchId: fixture.branchId, branchName, branchLocation: "حولي" }, createdAt: new Date(`2098-04-2${index}T08:00:00Z`),
    });
    const adultAmount = fixture.adult * price.adult, childAmount = fixture.child * price.child;
    await connection.db.insert(invoices).values({ id: invoiceIds[index]!, bookingId: id, adultUnitPrice: `${price.adult}.000`, childUnitPrice: `${price.child}.000`, adultAmount: `${adultAmount}.000`, childAmount: `${childAmount}.000`, total: `${invoiceTotals[index]}.000`, status: fixture.status === "cancelled" ? "cancelled" : "issued", paymentStatus: fixture.cash ? "paid" : "unpaid", issuedAt: new Date(`2098-04-2${index}T08:00:00Z`) });
    if (fixture.cash) await connection.db.insert(cashPayments).values({ id: randomUUID(), bookingId: id, invoiceId: invoiceIds[index]!, originalAmount: fixture.cash, amount: fixture.cash, status: "active", recordedBy: fixture.employeeId, recordedAt: now, bookingAtReceipt: {} });
    for (let version = 1; version <= (fixture.edits ?? 0); version++) {
      await connection.db.insert(bookingRevisions).values({ id: randomUUID(), bookingId: id, version, actorAccountId: adminAccount!.id, reason: null, occurredAt: now, before: {}, after: {} });
    }
    for (let version = 1; version <= (fixture.corrections ?? 0); version++) {
      await connection.db.insert(bookingVisitEvents).values({ id: randomUUID(), bookingId: id, version, fromStatus: "cancelled", toStatus: "cancelled", actorType: "admin", actorAccountId: adminAccount!.id, reason: "تصحيح تقرير", correction: true, previousInvoiceStatus: "cancelled", invoiceStatus: "cancelled", occurredAt: now });
    }
  }
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  sessionX = await signIn(phones[barberX]!, "employee-password-123");
  sessionY = await signIn(phones[barberY]!, "employee-password-123");
});
afterAll(async () => {
  await connection.db.delete(bookingRevisions).where(inArray(bookingRevisions.bookingId, ids));
  await connection.db.delete(bookingVisitEvents).where(inArray(bookingVisitEvents.bookingId, ids));
  await connection.db.delete(cashPayments).where(inArray(cashPayments.bookingId, ids));
  await connection.db.delete(invoices).where(inArray(invoices.bookingId, ids));
  await connection.db.delete(bookings).where(inArray(bookings.id, ids));
  await connection.db.delete(clientAddresses).where(inArray(clientAddresses.id, [addressOne, addressTwo]));
  await connection.db.delete(clients).where(inArray(clients.id, [clientOne, clientTwo]));
  await connection.db.delete(employees).where(inArray(employees.accountId, [barberX, barberY, barberZ]));
  await connection.db.delete(accounts).where(inArray(accounts.id, [barberX, barberY, barberZ]));
  await connection.db.delete(branches).where(inArray(branches.id, [branchOne, branchTwo]));
  await connection.pool.end();
});

describe("client history report", () => {
  it("requires a signed-in account and rejects invalid filters", async () => {
    expect((await request(app).get("/reports/clients")).status).toBe(401);
    const invalid = await report("clients", { from: "2098-05-03", to: "2098-05-01" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_INPUT");
  });
  it("reports contact details, repeat completed visits, haircut counts, and separate invoice and cash measures per client", async () => {
    const response = await report("clients", range);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ dateBasis: "visit_date", timeZone: "Asia/Kuwait" });
    const rows = response.body.clients.filter((row: { clientId: string }) => ([clientOne, clientTwo] as string[]).includes(row.clientId));
    expect(rows).toEqual([
      {
        clientId: clientTwo, name: "سلمى العملاء", phone: rows[0].phone,
        work: { bookings: 2, reserved: quantities(1, 3), completed: quantities(0, 0), open: quantities(0, 0), cancelled: quantities(0, 2), noShow: quantities(1, 1), completedVisits: 0, reservedMinutes: 0 },
        invoices: { issued: money(1, "10.000"), cancelled: money(1, "6.000"), outstanding: money(1, "10.000") }, cash: collected(1, "6.000"),
      },
      {
        clientId: clientOne, name: "نورة العملاء", phone: rows[1].phone,
        work: { bookings: 3, reserved: quantities(6, 1), completed: quantities(3, 1), open: quantities(3, 0), cancelled: quantities(0, 0), noShow: quantities(0, 0), completedVisits: 2, reservedMinutes: 180 },
        invoices: { issued: money(3, "33.000"), cancelled: money(0, "0.000"), outstanding: money(2, "20.000") }, cash: collected(1, "13.000"),
      },
    ]);
    expect(rows[1].phone).toMatch(/^\+965[0-9]{8}$/);
  });
  it("applies the same filters, searching clients by name and phone", async () => {
    const byName = await report("clients", { ...range, q: "نورة العملاء" });
    expect(byName.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientOne]);
    const byPhone = await report("clients", { ...range, q: "+96555000005" });
    expect(byPhone.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientTwo]);
    expect((await report("clients", { ...range, q: "%" })).body.clients).toHaveLength(0);
    const filtered = await report("clients", { ...range, status: "completed" });
    expect(filtered.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientOne]);
    const single = await report("clients", { ...range, clientId: clientTwo });
    expect(single.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientTwo]);
  });
  it("limits a barber to clients of their own reservations and denies another barber's filter", async () => {
    const own = await report("clients", range, sessionX);
    expect(own.status).toBe(200);
    expect(own.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientOne]);
    expect(own.body.clients[0].work.bookings).toBe(3);
    expect((await report("clients", { ...range, employeeId: barberX }, sessionX)).status).toBe(200);
    expect((await report("clients", { ...range, employeeId: barberY }, sessionX)).status).toBe(403);
    const other = await report("clients", range, sessionY);
    expect(other.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientTwo]);
  });
});
describe("invoice and cash report", () => {
  it("requires a signed-in account and rejects invalid filters", async () => {
    expect((await request(app).get("/reports/invoices")).status).toBe(401);
    const invalid = await report("invoices", { from: "2098-05-03", to: "2098-05-01" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_INPUT");
  });
  it("summarizes issued, cancelled, outstanding invoice values and actual cash as separate measures, counting a revised invoice once", async () => {
    const response = await report("invoices", range);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ dateBasis: "visit_date", timeZone: "Asia/Kuwait", total: 5, limit: 20, offset: 0 });
    expect(response.body.summary).toEqual({
      invoices: { issued: money(4, "43.000"), cancelled: money(1, "6.000"), outstanding: money(3, "30.000") },
      cash: collected(2, "19.000"), editedBookings: 1, edits: 2, correctedBookings: 1, corrections: 1,
    });
  });
  it("lists invoice line items with visit, cash, edit, and correction details, keeping paid cancelled invoices visible", async () => {
    const response = await report("invoices", range);
    const descending = (left: string, right: string) => right.localeCompare(left);
    expect(response.body.invoices.map((row: { bookingId: string }) => row.bookingId))
      .toEqual([[ids[3]!, ids[4]!], [ids[1]!, ids[2]!], [ids[0]!]].flatMap(day => day.sort(descending)));
    const first = response.body.invoices.find((row: { bookingId: string }) => row.bookingId === ids[0]);
    expect(first).toMatchObject({
      id: invoiceIds[0], reference: references[0], status: "issued", paymentStatus: "paid", currency: "KWD",
      adultCount: 2, childCount: 1, adultUnitPrice: "5.000", childUnitPrice: "3.000", adultAmount: "10.000", childAmount: "3.000", total: "13.000",
      client: { name: "نورة العملاء", phone: "+96555000004" }, employee: { id: barberX, branchId: branchOne }, visitStatus: "completed", editCount: 2, correctionCount: 0,
      cash: { amount: "13.000", status: "active", method: "cash" },
    });
    expect(first.date).toBe("2098-05-01");
    expect(first.issuedAt).toMatch(/^2098-04-2[0-9]T/);
    // The cancelled-but-paid invoice keeps its cancelled value separate from issued value while its recorded cash stays visible.
    const cancelled = response.body.invoices.find((row: { bookingId: string }) => row.bookingId === ids[2]);
    expect(cancelled).toMatchObject({ status: "cancelled", paymentStatus: "paid", total: "6.000", visitStatus: "cancelled", editCount: 0, correctionCount: 1, cash: { amount: "6.000", status: "active", method: "cash" } });
    const unpaid = response.body.invoices.find((row: { bookingId: string }) => row.bookingId === ids[4]);
    expect(unpaid).toMatchObject({ status: "issued", paymentStatus: "unpaid", total: "15.000", cash: null });
  });
  it("applies search/date/branch/employee/client/status/source and payment filters, and paginates without changing the summary", async () => {
    const idsFor = async (query: Record<string, string>) => (await report("invoices", { ...range, ...query })).body.invoices.map((row: { bookingId: string }) => row.bookingId).sort();
    expect(await idsFor({ status: "completed" })).toEqual([ids[0], ids[1]].sort());
    expect(await idsFor({ paymentStatus: "paid" })).toEqual([ids[0], ids[2]].sort());
    expect(await idsFor({ source: "ai" })).toEqual([]);
    expect(await idsFor({ branchId: branchTwo })).toEqual([ids[3]]);
    expect(await idsFor({ employeeId: barberY })).toEqual([ids[2]]);
    expect(await idsFor({ clientId: clientOne })).toEqual([ids[0], ids[1], ids[4]].sort());
    expect(await idsFor({ q: references[3]!.toLowerCase() })).toEqual([ids[3]]);
    expect(await idsFor({ q: "سلمى" })).toEqual([ids[2], ids[3]].sort());
    const bookedDay = await report("invoices", { dateBasis: "created_date", from: "2098-04-22", to: "2098-04-22" });
    expect(bookedDay.body.dateBasis).toBe("created_date");
    expect(bookedDay.body.invoices.map((row: { bookingId: string }) => row.bookingId)).toEqual([ids[2]]);
    const page = await report("invoices", { ...range, limit: "2", offset: "2" });
    expect(page.body).toMatchObject({ total: 5, limit: 2, offset: 2, summary: { cash: collected(2, "19.000") } });
    expect(page.body.invoices).toHaveLength(2);
  });
  it("limits a barber to their own invoices and denies another barber's filter", async () => {
    const own = await report("invoices", range, sessionX);
    expect(own.status).toBe(200);
    expect(own.body.invoices.map((row: { bookingId: string }) => row.bookingId).sort()).toEqual([ids[0], ids[1], ids[4]].sort());
    expect(own.body.summary.invoices.issued).toEqual(money(3, "33.000"));
    expect((await report("invoices", { ...range, employeeId: barberX }, sessionX)).status).toBe(200);
    expect((await report("invoices", { ...range, employeeId: barberY }, sessionX)).status).toBe(403);
  });
});
