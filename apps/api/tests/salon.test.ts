import { randomInt, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, barberCollections, bookings, branches, clientAddresses, clients, employees, loginAttempts, salonEntries, salonEntryEvents } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const branchId = randomUUID(), employeeId = randomUUID(), clientId = randomUUID(), addressId = randomUUID(), bookingId = randomUUID();
// Fixed report fixtures (June) stay untouched; the CRUD tests use their own July dates.
const reportRange = { from: "2099-06-01", to: "2099-06-02" };
const crudRange = { from: "2099-07-01", to: "2099-07-02" };
const entryIds: string[] = [];
type Session = { cookie: string; csrf: string };
let admin: Session, employee: Session;
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: response.body.csrfToken as string };
}
function write(method: "post" | "patch", path: string, body: object, session = admin) { return request(app)[method](path).set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body); }
function list(query: Record<string, string>, session = admin) { return request(app).get("/salon").query(query).set("Cookie", session.cookie); }
async function createEntry(body: object) {
  const response = await write("post", "/salon", body);
  if (response.status === 201) entryIds.push(response.body.id);
  return response;
}
beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date(), passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(branches).values({ id: branchId, name: "فرع الصالون", address: "حولي", createdAt: now, updatedAt: now });
  await connection.db.insert(accounts).values({ id: employeeId, phone: `+965${randomInt(10000000, 19999999)}`, role: "employee", passwordHash, createdAt: now, updatedAt: now });
  await connection.db.insert(employees).values({ accountId: employeeId, displayName: "حلاق الصالون", createdAt: now, updatedAt: now });
  await connection.db.insert(clients).values({ id: clientId, phone: `+965${randomInt(30000000, 39999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values({ id: addressId, clientId, area: "حولي", block: "1", street: "شارع 1", houseNumber: "1", createdAt: now, updatedAt: now });
  const [adminAccount] = await connection.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.role, "admin"));
  await connection.db.insert(bookings).values({
    id: bookingId, reference: `J4K-SALON${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`, clientId, addressId, employeeId, createdBy: adminAccount!.id,
    date: "2099-06-01", startTime: "10:00", endTime: "10:20", adultCount: 1, childCount: 1, visitStatus: "completed", visitVersion: 2,
    clientSnapshot: { phone: "+96555000006" }, addressSnapshot: { area: "حولي", block: "1", street: "شارع 1", houseNumber: "1", buildingName: null, avenue: null, gate: null, blueNumber: null, floor: null, apartment: null, mapsUrl: null },
    employeeSnapshot: { id: employeeId, displayName: "حلاق الصالون" }, createdAt: now,
  });
  const reportEntry1 = randomUUID(), reportEntry2 = randomUUID();
  await connection.db.insert(salonEntries).values([
    { id: reportEntry1, branchId, date: "2099-06-01", childCount: 5, cash: "5.000", link: "1.000", knet: "2.000", total: "8.000", enteredBy: employeeId, createdAt: now, updatedAt: now },
    { id: reportEntry2, branchId, date: "2099-06-02", childCount: 0, cash: "0.000", link: "0.000", knet: "3.000", total: "3.000", enteredBy: employeeId, createdAt: now, updatedAt: now },
  ]);
  entryIds.push(reportEntry1, reportEntry2);
  // The comprehensive report reads this barber's daily collection for June.
  await connection.db.insert(barberCollections).values({ id: randomUUID(), employeeId, date: "2099-06-01", normalChildren: 2, specialChildren: 1, cash: "7.000", link: "4.000", knet: "0.000", total: "11.000", version: 0, enteredBy: adminAccount!.id, createdAt: now, updatedAt: now });
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  employee = await signIn((await connection.db.select({ phone: accounts.phone }).from(accounts).where(eq(accounts.id, employeeId)))[0]!.phone, "employee-password-123");
});
afterAll(async () => {
  await connection.db.delete(barberCollections).where(eq(barberCollections.employeeId, employeeId));
  await connection.db.delete(salonEntryEvents).where(inArray(salonEntryEvents.entryId, entryIds));
  await connection.db.delete(salonEntries).where(inArray(salonEntries.id, entryIds));
  await connection.db.delete(bookings).where(eq(bookings.id, bookingId));
  await connection.db.delete(clientAddresses).where(eq(clientAddresses.id, addressId));
  await connection.db.delete(clients).where(eq(clients.id, clientId));
  await connection.db.delete(employees).where(eq(employees.accountId, employeeId));
  await connection.db.delete(accounts).where(eq(accounts.id, employeeId));
  await connection.db.delete(branches).where(eq(branches.id, branchId));
  await connection.pool.end();
});

describe("salon daily work", () => {
  it("is administrator-only and requires authentication and CSRF for writes", async () => {
    expect((await request(app).get("/salon")).status).toBe(401);
    expect((await write("post", "/salon", { branchId, date: "2099-07-09" }, { cookie: "", csrf: "" })).status).toBe(401);
    expect((await write("post", "/salon", { branchId, date: "2099-07-09" }, employee)).status).toBe(403);
    expect((await list(crudRange, employee)).status).toBe(403);
  });
  it("creates one entry per branch and day with a computed total, rejecting duplicates and bad input", async () => {
    const created = await createEntry({ branchId, date: "2099-07-01", childCount: 5, cash: "5.000", link: "1.000", knet: "2.000" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ branchId, branchName: "فرع الصالون", date: "2099-07-01", childCount: 5, cash: "5.000", link: "1.000", knet: "2.000", total: "8.000", enteredBy: expect.any(String) });
    const duplicate = await createEntry({ branchId, date: "2099-07-01", cash: "1.000" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("SALON_ENTRY_EXISTS");
    expect((await createEntry({ branchId: randomUUID(), date: "2099-07-01" })).status).toBe(404);
    expect((await createEntry({ branchId, date: "2099-07-09", cash: "-1.000" })).status).toBe(400);
    expect((await createEntry({ branchId, date: "2099-07-09", total: "1.000" })).status).toBe(400);
    // Individually valid amounts whose sum overflows the DECIMAL(24,3) total are refused.
    const overflowing = await createEntry({ branchId, date: "2099-07-09", cash: "999999999999999999999.999", link: "999999999999999999999.999", knet: "999999999999999999999.999" });
    expect(overflowing.status).toBe(400);
    expect(overflowing.body.error.code).toBe("SALON_TOTAL_TOO_LARGE");
    const second = await createEntry({ branchId, date: "2099-07-02", knet: "3.000" });
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ childCount: 0, cash: "0.000", link: "0.000", knet: "3.000", total: "3.000" });
  });
  it("lists entries by period with per-method totals and a branch filter", async () => {
    const response = await list(crudRange);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ timeZone: "Asia/Kuwait", from: crudRange.from, to: crudRange.to });
    expect(response.body.entries.map((entry: { date: string }) => entry.date)).toEqual(["2099-07-01", "2099-07-02"]);
    expect(response.body.totals).toEqual({ childCount: 5, cash: "5.000", link: "1.000", knet: "5.000", total: "11.000" });
    expect((await list({ ...crudRange, branchId })).body.entries).toHaveLength(2);
    expect((await list({ from: "2099-07-03", to: "2099-07-04" })).body.entries).toEqual([]);
    expect((await list({ from: crudRange.to, to: crudRange.from })).status).toBe(400);
  });
  it("edits an entry, recomputes the total, and keeps versioned create/update history", async () => {
    const entry = (await list({ from: "2099-07-02", to: "2099-07-02" })).body.entries[0];
    expect(entry.version).toBe(0);
    const updated = await write("patch", `/salon/${entry.id}`, { expectedVersion: entry.version, childCount: 2, cash: "4.000", knet: "0.000" });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ version: 1, childCount: 2, cash: "4.000", link: "0.000", knet: "0.000", total: "4.000" });
    const history = await request(app).get(`/salon/${entry.id}/history`).set("Cookie", admin.cookie);
    expect(history.status).toBe(200);
    expect(history.body.events).toHaveLength(2);
    expect(history.body.events[0].before).toBeNull();
    expect(history.body.events[0].after).toMatchObject({ childCount: 0, knet: "3.000", total: "3.000" });
    expect(history.body.events[1]).toMatchObject({ before: { childCount: 0, total: "3.000" }, after: { childCount: 2, total: "4.000" } });
    // A stale version is refused, and a no-op edit at the current version is reported as unchanged.
    expect((await write("patch", `/salon/${entry.id}`, { expectedVersion: 0, cash: "9.000" })).status).toBe(409);
    expect((await write("patch", `/salon/${entry.id}`, { expectedVersion: 1, childCount: 2 })).status).toBe(409);
    expect((await write("patch", `/salon/${randomUUID()}`, { expectedVersion: 0, childCount: 2 })).status).toBe(404);
    expect((await write("patch", `/salon/${entry.id}`, {})).status).toBe(400);
  });
});

describe("comprehensive collections report", () => {
  it("combines barber and salon rows with per-method totals and a share of the grand total", async () => {
    const response = await request(app).get("/reports/comprehensive").query(reportRange).set("Cookie", admin.cookie);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ timeZone: "Asia/Kuwait" });
    expect(response.body.barbers).toEqual([
      { employeeId, displayName: "حلاق الصالون", enabled: true, cash: { count: 1, total: "7.000" }, link: { count: 1, total: "4.000" }, knet: { count: 0, total: "0.000" }, collected: { count: 1, total: "11.000" }, share: 50 },
    ]);
    expect(response.body.salon).toEqual({ cash: { count: 1, total: "5.000" }, link: { count: 1, total: "1.000" }, knet: { count: 2, total: "5.000" }, collected: { count: 2, total: "11.000" }, share: 50 });
    expect(response.body.totals).toEqual({ cash: { count: 2, total: "12.000" }, link: { count: 2, total: "5.000" }, knet: { count: 2, total: "5.000" }, collected: { count: 3, total: "22.000" } });
  });
  it("covers the period only, like the old report, so barber and salon shares use the same scope", async () => {
    const response = await request(app).get("/reports/comprehensive").query({ ...reportRange, branchId }).set("Cookie", admin.cookie);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
  });
  it("requires the administrator", async () => {
    expect((await request(app).get("/reports/comprehensive").query(reportRange)).status).toBe(401);
    expect((await request(app).get("/reports/comprehensive").query(reportRange).set("Cookie", employee.cookie)).status).toBe(403);
  });
});
