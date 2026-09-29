import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, branches, employees, employeeScheduleExceptions, employeeWorkIntervals, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword } from "../src/lib/password.js";
import { createAuth } from "../src/modules/auth/index.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const branchId = randomUUID();
const employeeIds = [randomUUID(), randomUUID()];
const phone = `+965${randomInt(50000000, 59999999)}`;
const disabledPhone = `+965${randomInt(60000000, 69999999)}`;

async function signIn(loginPhone: string, password: string) {
  const challenge = await request(app).get("/auth/csrf");
  const preloginCookie = challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", preloginCookie).set("X-CSRF-Token", challenge.body.csrfToken).send({ phone: loginPhone, password });
  expect(response.status).toBe(200);
  return { cookie: (response.headers["set-cookie"] as unknown as string[]).find(value => value.startsWith("j4k_session="))?.split(";")[0] ?? "", csrf: response.body.csrfToken as string };
}

beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date();
  await connection.db.insert(branches).values({ id: branchId, name: "حولي", location: "شارع 1", adultPrice: "5.000", childPrice: "3.000", adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now });
  await connection.db.insert(accounts).values(employeeIds.map((id, index) => ({ id, phone: index === 0 ? phone : disabledPhone, role: "employee" as const, passwordHash: "invalid-until-login", enabled: index === 0, createdAt: now, updatedAt: now })));
  await connection.db.insert(employees).values(employeeIds.map((accountId, index) => ({ accountId, branchId, displayName: index === 0 ? "سالم" : "معطل", createdAt: now, updatedAt: now })));
  await connection.db.update(accounts).set({ passwordHash: await hashPassword("employee-password-123") }).where(eq(accounts.id, employeeIds[0]!));
});
afterAll(async () => {
  for (const employeeId of employeeIds) {
    await connection.db.delete(employeeScheduleExceptions).where(eq(employeeScheduleExceptions.employeeId, employeeId));
    await connection.db.delete(employeeWorkIntervals).where(eq(employeeWorkIntervals.employeeId, employeeId));
    await connection.db.delete(employees).where(eq(employees.accountId, employeeId));
    await connection.db.delete(accounts).where(eq(accounts.id, employeeId));
  }
  await connection.db.delete(branches).where(eq(branches.id, branchId));
  await connection.pool.end();
});

describe("barber schedules and eligibility", () => {
  it("requires administrator role and CSRF for editing, while an employee reads only their own schedule", async () => {
    const admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
    const barber = await signIn(phone, "employee-password-123");
    const path = `/schedules/${employeeIds[0]}/weekly`;
    expect((await request(app).get(`/schedules/${employeeIds[0]}`)).status).toBe(401);
    expect((await request(app).put(path).set("Origin", origin).set("Cookie", barber.cookie).set("X-CSRF-Token", barber.csrf).send({ days: [] })).status).toBe(403);
    expect((await request(app).put(path).set("Origin", origin).set("Cookie", admin.cookie).send({ days: [] })).status).toBe(403);
    expect((await request(app).get(`/schedules/${employeeIds[1]}`).set("Cookie", barber.cookie)).status).toBe(403);
    const own = await request(app).get("/schedules/me").set("Cookie", barber.cookie);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ employeeId: employeeIds[0], days: [], exceptions: [] });
  });

  it("returns only enabled barbers whose full window fits a shift and a date exception", async () => {
    const admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
    const updated = await request(app).put(`/schedules/${employeeIds[0]}/weekly`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ days: [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "13:00" }, { startTime: "15:00", endTime: "19:00" }] }] });
    expect(updated.status).toBe(200);
    expect(updated.body.days).toHaveLength(1);
    const eligible = await request(app).get("/availability/eligible?date=2026-10-05&startTime=09:00&endTime=09:20").set("Cookie", admin.cookie);
    expect(eligible.status).toBe(200);
    expect(eligible.body.barbers).toEqual([{ id: employeeIds[0], displayName: "سالم", branch: { id: branchId, name: "حولي", location: "شارع 1" } }]);
    expect((await request(app).get("/availability/eligible?date=2026-10-05&startTime=12:50&endTime=13:10").set("Cookie", admin.cookie)).body.barbers).toEqual([]);
    const exception = await request(app).put(`/schedules/${employeeIds[0]}/exceptions/2026-10-05`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ intervals: [{ startTime: "10:00", endTime: "12:00" }] });
    expect(exception.status).toBe(200);
    expect((await request(app).get("/availability/eligible?date=2026-10-05&startTime=09:00&endTime=09:20").set("Cookie", admin.cookie)).body.barbers).toEqual([]);
    expect((await request(app).get("/availability/eligible?date=2026-10-05&startTime=10:00&endTime=10:20").set("Cookie", admin.cookie)).body.barbers).toHaveLength(1);
  });

  it("allows a one-day closure and restores weekly hours when the exception is removed", async () => {
    const admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
    const path = `/schedules/${employeeIds[0]}/exceptions/2026-10-05`;
    const closure = await request(app).put(path).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ intervals: [] });
    expect(closure.status).toBe(200);
    expect((await request(app).get("/availability/eligible?date=2026-10-05&startTime=10:00&endTime=10:20").set("Cookie", admin.cookie)).body.barbers).toEqual([]);
    expect((await request(app).delete(path).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)).status).toBe(204);
    expect((await request(app).get("/availability/eligible?date=2026-10-05&startTime=10:00&endTime=10:20").set("Cookie", admin.cookie)).body.barbers).toHaveLength(1);
  });
});
