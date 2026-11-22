import { randomInt, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, bookings, clientAddresses, clients, employeeLocations, employees, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";
import { createAuth } from "../src/modules/auth/index.js";
import { createLocationRepository } from "../src/modules/locations/location.repository.js";
import { createLocationService } from "../src/modules/locations/location.service.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const barber = randomUUID(), idle = randomUUID(), disabled = randomUUID(), client = randomUUID(), address = randomUUID();
const barbers = [barber, idle, disabled];
const phones = barbers.map(() => `+965${randomInt(70000000, 79999999)}`);
const bookingIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const password = "employee-password-123";

async function signIn(phone: string, secret: string) {
  const challenge = await request(app).get("/auth/csrf");
  const result = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password: secret });
  expect(result.status).toBe(200);
  return { cookie: (result.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]!, csrf: result.body.csrfToken as string };
}
const report = (session: { cookie: string; csrf: string }, body: object) => request(app).put("/locations/me").set("Origin", origin).set("Cookie", session.cookie).set("X-CSRF-Token", session.csrf).send(body);

beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const [administrator] = await connection.db.select().from(accounts).where(eq(accounts.role, "admin"));
  const now = new Date();
  const passwordHash = await hashPassword(password);
  await connection.db.insert(accounts).values(barbers.map((id, index) => ({ id, role: "employee" as const, phone: phones[index]!, passwordHash, enabled: id !== disabled, createdAt: now, updatedAt: now })));
  await connection.db.insert(employees).values([{ accountId: barber, displayName: "Live barber" }, { accountId: idle, displayName: "Idle barber" }, { accountId: disabled, displayName: "Disabled barber" }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
  await connection.db.insert(clients).values({ id: client, phone: `+965${randomInt(80000000, 89999999)}`, createdAt: now, updatedAt: now });
  await connection.db.insert(clientAddresses).values({ id: address, clientId: client, area: "Hawally", block: "1", street: "1", houseNumber: "1", createdAt: now, updatedAt: now });
  // On 2096-05-01 at 15:00 Kuwait: one visit already over, one cancelled, one in progress, one later.
  const visits = [
    { id: bookingIds[0]!, startTime: "09:00", endTime: "10:00", visitStatus: "completed" as const, area: "Old" },
    { id: bookingIds[1]!, startTime: "14:00", endTime: "16:00", visitStatus: "cancelled" as const, area: "Cancelled" },
    { id: bookingIds[2]!, startTime: "14:30", endTime: "15:30", visitStatus: "arrived" as const, area: "Salmiya" },
    { id: bookingIds[3]!, startTime: "18:00", endTime: "19:00", visitStatus: "booked" as const, area: "Jabriya" },
  ];
  await connection.db.insert(bookings).values(visits.map(visit => ({
    id: visit.id, reference: `J4K-${visit.id.slice(0, 8)}`, employeeId: barber, clientId: client, addressId: address, createdBy: administrator!.id,
    date: "2096-05-01", startTime: visit.startTime, endTime: visit.endTime, adultCount: 1, childCount: 0, specialChildCount: 0, visitStatus: visit.visitStatus, visitVersion: 0, createdAt: now,
    clientSnapshot: { phone: "+96555000001" }, employeeSnapshot: { id: barber, displayName: "Live barber" },
    addressSnapshot: { area: visit.area, block: "1", street: "1", houseNumber: "1", buildingName: null, floor: null, apartment: null, mapsUrl: null },
  })));
});
beforeEach(async () => { await connection.db.delete(loginAttempts); });
afterAll(async () => {
  await connection.db.delete(bookings).where(inArray(bookings.id, bookingIds));
  await connection.db.delete(clientAddresses).where(eq(clientAddresses.id, address));
  await connection.db.delete(clients).where(eq(clients.id, client));
  await connection.db.delete(employeeLocations).where(inArray(employeeLocations.employeeId, barbers));
  await connection.db.delete(employees).where(inArray(employees.accountId, barbers));
  await connection.db.delete(accounts).where(inArray(accounts.id, barbers));
  await connection.pool.end();
});

describe("barber live location", () => {
  it("lets a signed-in barber report a position, keeping only the latest one", async () => {
    const session = await signIn(phones[0]!, password);
    expect((await report(session, { latitude: 29.3375, longitude: 47.9744, accuracy: 12.6 })).status).toBe(204);
    expect((await report(session, { latitude: 29.3401, longitude: 48.0011, accuracy: 8 })).status).toBe(204);
    const stored = await connection.db.select().from(employeeLocations).where(eq(employeeLocations.employeeId, barber));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ latitude: 29.3401, longitude: 48.0011, accuracy: 8 });
  });

  it("refuses reports without a session, a CSRF token, from the administrator, or with an impossible position", async () => {
    expect((await request(app).put("/locations/me").set("Origin", origin).send({ latitude: 1, longitude: 1, accuracy: 1 })).status).toBe(401);
    const session = await signIn(phones[0]!, password);
    expect((await request(app).put("/locations/me").set("Origin", origin).set("Cookie", session.cookie).send({ latitude: 1, longitude: 1, accuracy: 1 })).status).toBe(403);
    for (const body of [{ latitude: 91, longitude: 1, accuracy: 1 }, { latitude: 1, longitude: 181, accuracy: 1 }, { latitude: 1, longitude: 1, accuracy: -1 }, { latitude: "1", longitude: 1, accuracy: 1 }, { latitude: 1, longitude: 1 }]) {
      expect((await report(session, body)).status).toBe(400);
    }
    const admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
    expect((await report(admin, { latitude: 1, longitude: 1, accuracy: 1 })).status).toBe(403);
  });

  it("shows the administrator every active barber with their last position, and nothing to barbers", async () => {
    const session = await signIn(phones[0]!, password);
    expect((await request(app).get("/locations").set("Cookie", session.cookie)).status).toBe(403);
    const admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
    const listed = await request(app).get("/locations").set("Cookie", admin.cookie);
    expect(listed.status).toBe(200);
    const mine = (listed.body.barbers as { employeeId: string }[]).filter(row => (barbers as string[]).includes(row.employeeId));
    expect(mine.map(row => row.employeeId).sort()).toEqual([barber, idle].sort());
    expect(mine.find(row => row.employeeId === barber)).toMatchObject({ displayName: "Live barber", location: { latitude: 29.3401, longitude: 48.0011, accuracy: 8 } });
    expect(mine.find(row => row.employeeId === idle)).toMatchObject({ displayName: "Idle barber", location: null, nextBooking: null });
  });

  it("names the reservation in progress, or else the next one today", async () => {
    const service = createLocationService(createLocationRepository(connection));
    const at = async (time: string) => (await service.list(new Date(`2096-05-01T${time}:00.000+03:00`))).barbers.find(row => row.employeeId === barber)?.nextBooking;
    expect(await at("15:00")).toEqual({ id: bookingIds[2], startTime: "14:30", endTime: "15:30", area: "Salmiya", visitStatus: "arrived" });
    expect(await at("15:30")).toEqual({ id: bookingIds[3], startTime: "18:00", endTime: "19:00", area: "Jabriya", visitStatus: "booked" });
    expect(await at("19:00")).toBeNull();
  });
});
