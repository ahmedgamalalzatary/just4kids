import { randomInt, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { currentKuwaitWeek } from "@just4kids/contracts";
import { createDatabase } from "@just4kids/db";
import { accounts, bookingMessages, bookingRevisions, bookingVisitEvents, bookings, clientAddresses, clients, employees, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const barberA = randomUUID(), barberB = randomUUID(), clientA = randomUUID(), clientB = randomUUID();
const addressA = randomUUID(), addressB = randomUUID();
const ids = Array.from({ length: 4 }, () => randomUUID());
// A visit today (Kuwait) for barber A, inside the default week.
const thisWeek = randomUUID();
const everyId = [...ids, thisWeek];
const phone = `+965${randomInt(40000000, 44999999)}`;
let admin: string, employee: string, adminId: string;
const at = (hour: number) => new Date(`2096-04-01T${String(hour).padStart(2, "0")}:00:00.000Z`);
async function signIn(phone: string, password: string) {
  const challenge = await request(app).get("/auth/csrf");
  const result = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(result.status).toBe(200);
  return (result.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!;
}
const report = (query: Record<string, string> = {}, cookie = admin) => request(app).get("/reports/tracking").set("Cookie", cookie).query({ from: "2096-04-10", to: "2096-04-11", ...query });

beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  const [administrator] = await connection.db.select().from(accounts).where(eq(accounts.role, "admin"));
  adminId = administrator!.id;
  const now = new Date();
  const passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values([barberA, barberB].map((id, index) => ({ id, role: "employee" as const, phone: index === 0 ? phone : `+965${randomInt(45000000, 49999999)}`, passwordHash, createdAt: now, updatedAt: now })));
  await connection.db.insert(employees).values([{ accountId: barberA, displayName: "حلاق التتبع" }, { accountId: barberB, displayName: "حلاق آخر" }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
  await connection.db.insert(clients).values([{ id: clientA, phone: `+965${randomInt(55000000, 59999999)}` }, { id: clientB, phone: `+965${randomInt(60000000, 64999999)}` }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
  await connection.db.insert(clientAddresses).values([{ id: addressA, clientId: clientA }, { id: addressB, clientId: clientB }].map(row => ({ ...row, area: "حولي", block: "1", street: "1", houseNumber: "1", createdAt: now, updatedAt: now })));
  for (const [index, id] of ids.entries()) {
    const employeeId = index === 2 ? barberB : barberA;
    const clientId = index === 1 ? clientB : clientA;
    await connection.db.insert(bookings).values({
      id, reference: `J4K-${id.slice(0, 8)}`, employeeId, clientId, addressId: clientId === clientA ? addressA : addressB, createdBy: adminId,
      date: index === 3 ? "2096-04-12" : index === 0 ? "2096-04-10" : "2096-04-11", startTime: index === 1 ? "12:00" : "10:00", endTime: "13:00",
      adultCount: 1, childCount: 2, specialChildCount: 1, visitStatus: "completed", visitVersion: 8, createdAt: at(8),
      clientSnapshot: { phone: "+96555000001" }, employeeSnapshot: { id: employeeId, displayName: "اسم الحلاق وقت الحجز" },
      addressSnapshot: { area: "حولي", block: "1", street: "1", houseNumber: "1", buildingName: null, floor: null, apartment: null, mapsUrl: null },
    });
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(now);
  await connection.db.insert(bookings).values({
    id: thisWeek, reference: `J4K-${thisWeek.slice(0, 8)}`, employeeId: barberA, clientId: clientA, addressId: addressA, createdBy: adminId,
    date: today, startTime: "10:00", endTime: "11:00", adultCount: 1, childCount: 1, specialChildCount: 0, visitStatus: "booked", visitVersion: 0, createdAt: now,
    clientSnapshot: { phone: "+96555000001" }, employeeSnapshot: { id: barberA, displayName: "حلاق التتبع" },
    addressSnapshot: { area: "حولي", block: "1", street: "1", houseNumber: "1", buildingName: null, floor: null, apartment: null, mapsUrl: null },
  });
  const booking = (await request(app).get(`/bookings/${ids[0]}`).set("Cookie", admin)).body;
  await connection.db.insert(bookingVisitEvents).values([
    { id: randomUUID(), bookingId: ids[0]!, version: 0, fromStatus: null, toStatus: "booked", actorType: "admin", actorAccountId: adminId, occurredAt: at(8) },
    { id: randomUUID(), bookingId: ids[0]!, version: 3, fromStatus: "booked", toStatus: "arrived", actorType: "employee", actorAccountId: barberA, reason: "وصل إلى العنوان", occurredAt: at(11) },
    { id: randomUUID(), bookingId: ids[0]!, version: 4, fromStatus: "arrived", toStatus: "completed", actorType: "admin", actorAccountId: adminId, correction: true, reason: "تصحيح الحالة", occurredAt: at(12) },
    { id: randomUUID(), bookingId: ids[1]!, version: 1, fromStatus: "booked", toStatus: "cancelled", actorType: "admin", actorAccountId: adminId, reason: "طلب العميل", occurredAt: at(9) },
    { id: randomUUID(), bookingId: ids[2]!, version: 0, fromStatus: null, toStatus: "booked", actorType: "system", occurredAt: at(8) },
  ]);
  await connection.db.insert(bookingMessages).values({ id: randomUUID(), bookingId: ids[0]!, kind: "sent_to_barber", actorAccountId: adminId, occurredAt: at(9) });
  await connection.db.insert(bookingRevisions).values({ id: randomUUID(), bookingId: ids[0]!, version: 2, actorAccountId: adminId, reason: "تعديل الملاحظات", before: { ...booking, notes: null }, after: { ...booking, notes: "جرس الباب" }, occurredAt: at(10) });
  employee = await signIn(phone, "employee-password-123");
});
afterAll(async () => {
  await connection.db.delete(bookingRevisions).where(inArray(bookingRevisions.bookingId, everyId));
  await connection.db.delete(bookingMessages).where(inArray(bookingMessages.bookingId, everyId));
  await connection.db.delete(bookingVisitEvents).where(inArray(bookingVisitEvents.bookingId, everyId));
  await connection.db.delete(bookings).where(inArray(bookings.id, everyId));
  await connection.db.delete(clientAddresses).where(inArray(clientAddresses.id, [addressA, addressB]));
  await connection.db.delete(clients).where(inArray(clients.id, [clientA, clientB]));
  await connection.db.delete(employees).where(inArray(employees.accountId, [barberA, barberB]));
  await connection.db.delete(accounts).where(inArray(accounts.id, [barberA, barberB]));
  await connection.pool.end();
});

describe("booking tracking report", () => {
  it("is admin-only, with a read-only GET that needs no CSRF token", async () => {
    expect((await request(app).get("/reports/tracking")).status).toBe(401);
    expect((await report({}, employee)).status).toBe(403);
    expect((await report({ employeeId: barberA }, employee)).status).toBe(403);
    const result = await report();
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
  });
  it("groups newest visits first and merges full histories oldest first", async () => {
    const result = await report();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ dateBasis: "visit_date", timeZone: "Asia/Kuwait" });
    expect(result.body.bookings.map((row: { booking: { id: string } }) => row.booking.id)).toEqual([ids[1], ids[2], ids[0]]);
    const events = result.body.bookings[2].events;
    expect(events.map((event: { type: string }) => event.type)).toEqual(["visit", "message", "revision", "visit", "visit"]);
    expect(events.map((event: { at: string }) => event.at)).toEqual([8, 9, 10, 11, 12].map(hour => at(hour).toISOString()));
    expect(events[0].event.fromStatus).toBeNull();
    expect(events[1].message.kind).toBe("sent_to_barber");
    expect(events[2].revision).toMatchObject({ reason: "تعديل الملاحظات", before: { notes: null }, after: { notes: "جرس الباب" } });
    expect(events[3]).toMatchObject({ actor: { id: barberA, name: "حلاق التتبع", role: "employee" }, event: { reason: "وصل إلى العنوان" } });
    expect(events[4]).toMatchObject({ actor: { id: adminId, name: "Administrator", role: "admin" }, event: { correction: true, reason: "تصحيح الحالة" } });
    expect(result.body.bookings[0].events[1]).toMatchObject({ actor: { id: adminId, name: "Administrator", role: "admin" } });
    expect(result.body.bookings[0].events[1].event).not.toHaveProperty("actorClientId");
    expect(result.body.bookings[1].events[0]).toMatchObject({ actor: { id: null, name: "System", role: "system" } });
  });
  it("applies barber, client and inclusive visit-day filters together", async () => {
    const idsFor = async (query: Record<string, string>) => {
      const result = await report(query);
      expect(result.status).toBe(200);
      return result.body.bookings.map((row: { booking: { id: string } }) => row.booking.id);
    };
    expect(await idsFor({ employeeId: barberA })).toEqual([ids[1], ids[0]]);
    expect(await idsFor({ clientId: clientA })).toEqual([ids[2], ids[0]]);
    expect(await idsFor({ employeeId: barberA, clientId: clientA })).toEqual([ids[0]]);
    expect(await idsFor({ from: "2096-04-11", to: "2096-04-11" })).toEqual([ids[1], ids[2]]);
    const history = await request(app).get(`/bookings/${ids[0]}/history`).set("Cookie", admin);
    const tracking = await report({ from: "2096-04-10", to: "2096-04-10" });
    expect(tracking.body.bookings[0].events.filter((entry: { type: string }) => entry.type === "visit").map((entry: { event: unknown }) => entry.event)).toEqual(history.body.events);
  });
  it("defaults to the current Kuwait week when no period is given", async () => {
    const week = currentKuwaitWeek();
    const result = await request(app).get("/reports/tracking").set("Cookie", admin).query({ employeeId: barberA });
    expect(result.status).toBe(200);
    expect(result.body.bookings.map((row: { booking: { id: string } }) => row.booking.id)).toEqual([thisWeek]);
    expect(result.body.bookings[0].booking.date >= week.from && result.body.bookings[0].booking.date <= week.to).toBe(true);
    // A lone bound covers 7 days from (or up to) that day, never an open-ended history.
    const from = await request(app).get("/reports/tracking").set("Cookie", admin).query({ employeeId: barberA, from: "2096-04-11" });
    expect(from.body.bookings.map((row: { booking: { id: string } }) => row.booking.id)).toEqual([ids[3], ids[1]]);
    const to = await request(app).get("/reports/tracking").set("Cookie", admin).query({ employeeId: barberA, to: "2096-04-11" });
    expect(to.body.bookings.map((row: { booking: { id: string } }) => row.booking.id)).toEqual([ids[1], ids[0]]);
    expect((await report({ from: "2096-03-01", to: "2096-04-11" })).status).toBe(400);
  });
  it("rejects invalid queries and returns an empty period", async () => {
    for (const query of [{ from: "2096-04-12", to: "2096-04-10" }, { employeeId: "1" }, { from: "2096-02-30" }, { status: "completed" }]) expect((await report(query)).status).toBe(400);
    const empty = await report({ from: "2096-04-13", to: "2096-04-13" });
    expect(empty.status).toBe(200);
    expect(empty.body.bookings).toEqual([]);
  });
});
