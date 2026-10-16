import { randomInt, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, bookings, clientAddresses, clients, employees, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const barberX = randomUUID(), barberY = randomUUID(), barberZ = randomUUID();
const clientOne = randomUUID(), clientTwo = randomUUID(), addressOne = randomUUID(), addressTwo = randomUUID();
const phones: Record<string, string> = { [barberX]: `+965${randomInt(10000000, 19999999)}`, [barberY]: `+965${randomInt(20000000, 29999999)}`, [barberZ]: `+965${randomInt(30000000, 39999999)}` };
const range = { from: "2098-05-01", to: "2098-05-03" };
type Session = { cookie: string };
let admin: Session, sessionX: Session, sessionY: Session;
type Fixture = { date: string; employeeId: string; clientId: string; status: "booked" | "arrived" | "completed" | "cancelled" | "no_show"; adult: number; child: number };
const fixtures: Fixture[] = [
  { date: "2098-05-01", employeeId: barberX, clientId: clientOne, status: "completed", adult: 2, child: 1 },
  { date: "2098-05-02", employeeId: barberX, clientId: clientOne, status: "completed", adult: 1, child: 0 },
  { date: "2098-05-02", employeeId: barberY, clientId: clientTwo, status: "cancelled", adult: 0, child: 2 },
  { date: "2098-05-03", employeeId: barberZ, clientId: clientTwo, status: "no_show", adult: 1, child: 1 },
  { date: "2098-05-03", employeeId: barberX, clientId: clientOne, status: "booked", adult: 3, child: 0 },
];
const ids: string[] = fixtures.map(() => randomUUID());
const references = ids.map(id => `J4K-CIR${id.replaceAll("-", "").slice(0, 11).toUpperCase()}`);
const quantities = (adult: number, child: number) => ({ adult, child, special: 0 });
async function signIn(phone: string, password: string): Promise<Session> {
  const challenge = await request(app).get("/auth/csrf");
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "").set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))!.split(";")[0]! };
}
function report(query: Record<string, string>, session = admin) {
  return request(app).get("/reports/clients").query(query).set("Cookie", session.cookie);
}
beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date();
  const passwordHash = await hashPassword("employee-password-123");
  await connection.db.insert(accounts).values([barberX, barberY, barberZ].map(id => ({ id, phone: phones[id]!, role: "employee" as const, passwordHash, createdAt: now, updatedAt: now })));
  await connection.db.insert(employees).values([{ accountId: barberX, displayName: "عميل تقرير أ" }, { accountId: barberY, displayName: "عميل تقرير ب" }, { accountId: barberZ, displayName: "عميل تقرير ج" }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
  await connection.db.insert(clients).values([{ id: clientOne, phone: `+965${randomInt(85000000, 89999999)}` }, { id: clientTwo, phone: `+965${randomInt(90000000, 94999999)}` }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
  await connection.db.insert(clientAddresses).values([{ id: addressOne, clientId: clientOne }, { id: addressTwo, clientId: clientTwo }].map(row => ({ ...row, area: "حولي", block: "1", street: "شارع 1", houseNumber: "1", createdAt: now, updatedAt: now })));
  const [adminAccount] = await connection.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.role, "admin"));
  for (const [index, fixture] of fixtures.entries()) {
    const id = ids[index]!;
    const client = fixture.clientId === clientOne ? { phone: "+96555000004" } : { phone: "+96555000005" };
    await connection.db.insert(bookings).values({
      id, reference: references[index]!, clientId: fixture.clientId, addressId: fixture.clientId === clientOne ? addressOne : addressTwo, employeeId: fixture.employeeId, createdBy: adminAccount!.id,
      date: fixture.date, startTime: "10:00", endTime: "11:00", adultCount: fixture.adult, childCount: fixture.child, source: "manual", visitStatus: fixture.status, visitVersion: 3,
      clientSnapshot: client, addressSnapshot: { area: "حولي", block: "1", street: "شارع 1", houseNumber: "1", buildingName: null, floor: null, apartment: null, mapsUrl: null },
      employeeSnapshot: { id: fixture.employeeId, displayName: "اسم قديم" }, createdAt: new Date(`2098-04-2${index}T08:00:00Z`),
    });
  }
  admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  sessionX = await signIn(phones[barberX]!, "employee-password-123");
  sessionY = await signIn(phones[barberY]!, "employee-password-123");
});
afterAll(async () => {
  await connection.db.delete(bookings).where(inArray(bookings.id, ids));
  await connection.db.delete(clientAddresses).where(inArray(clientAddresses.id, [addressOne, addressTwo]));
  await connection.db.delete(clients).where(inArray(clients.id, [clientOne, clientTwo]));
  await connection.db.delete(employees).where(inArray(employees.accountId, [barberX, barberY, barberZ]));
  await connection.db.delete(accounts).where(inArray(accounts.id, [barberX, barberY, barberZ]));
  await connection.pool.end();
});

describe("client history report", () => {
  it("requires a signed-in account and rejects invalid filters", async () => {
    expect((await request(app).get("/reports/clients")).status).toBe(401);
    const invalid = await report({ from: "2098-05-03", to: "2098-05-01" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_INPUT");
  });
  it("reports contact details, repeat completed visits, and haircut counts per client", async () => {
    const response = await report(range);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ dateBasis: "visit_date", timeZone: "Asia/Kuwait" });
    const rows = response.body.clients.filter((row: { clientId: string }) => ([clientOne, clientTwo] as string[]).includes(row.clientId)).sort((a: { clientId: string }, b: { clientId: string }) => Number(b.clientId === clientTwo) - Number(a.clientId === clientTwo));
    expect(rows).toEqual([
      {
        clientId: clientTwo, phone: rows[0].phone,
        work: { bookings: 2, reserved: quantities(1, 3), completed: quantities(0, 0), open: quantities(0, 0), cancelled: quantities(0, 2), noShow: quantities(1, 1), completedVisits: 0, reservedMinutes: 0 },
      },
      {
        clientId: clientOne, phone: rows[1].phone,
        work: { bookings: 3, reserved: quantities(6, 1), completed: quantities(3, 1), open: quantities(3, 0), cancelled: quantities(0, 0), noShow: quantities(0, 0), completedVisits: 2, reservedMinutes: 180 },
      },
    ]);
    expect(rows[1].phone).toMatch(/^\+965[0-9]{8}$/);
  });
  it("applies the same filters, searching clients by saved phone", async () => {
    const byPhoneOne = await report({ ...range, q: "+96555000004" });
    expect(byPhoneOne.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientOne]);
    const byPhone = await report({ ...range, q: "+96555000005" });
    expect(byPhone.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientTwo]);
    expect((await report({ ...range, q: "%" })).body.clients).toHaveLength(0);
    const filtered = await report({ ...range, status: "completed" });
    expect(filtered.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientOne]);
    const single = await report({ ...range, clientId: clientTwo });
    expect(single.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientTwo]);
  });
  it("limits a barber to clients of their own reservations and denies another barber's filter", async () => {
    const own = await report(range, sessionX);
    expect(own.status).toBe(200);
    expect(own.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientOne]);
    expect(own.body.clients[0].work.bookings).toBe(3);
    expect((await report({ ...range, employeeId: barberX }, sessionX)).status).toBe(200);
    expect((await report({ ...range, employeeId: barberY }, sessionX)).status).toBe(403);
    const other = await report(range, sessionY);
    expect(other.body.clients.map((row: { clientId: string }) => row.clientId)).toEqual([clientTwo]);
  });
});
