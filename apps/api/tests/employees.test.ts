import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, branches, employees, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { verifyPassword } from "../src/lib/password.js";
import { createAuth } from "../src/modules/auth/index.js";
import { createAuthRepository } from "../src/modules/auth/auth.repository.js";
import { createAuthService } from "../src/modules/auth/auth.service.js";
import { createEmployeeRepository } from "../src/modules/employees/employee.repository.js";

const origin = "http://localhost:3000";
const env = apiEnvSchema.parse({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: origin });
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const app = createApp({ auth, connection, env });
const branchA = randomUUID();
const branchB = randomUUID();
const testPhones = ["+96555550051", "+96555550052", "+96555550053", "+96555550054", "+96555550055", "+96555550056", "+96555550057"];

async function signIn(phone: string, password: string) {
  const challenge = await request(app).get("/auth/csrf");
  const preloginCookie = challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", preloginCookie).set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  const cookie = (response.headers["set-cookie"] as string[] | undefined)?.find(value => value.startsWith("j4k_session="))?.split(";")[0] ?? "";
  return { response, cookie, csrf: response.body.csrfToken as string };
}

async function createEmployee(phone: string, branchId = branchA) {
  const admin = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  expect(admin.response.status).toBe(200);
  const created = await request(app).post("/employees").set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
    .send({ displayName: "سالم", phone, branchId, password: "employee-password-123" });
  expect(created.status).toBe(201);
  return { admin, created };
}

beforeAll(async () => {
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date();
  await connection.db.insert(branches).values([
    { id: branchA, name: "حولي", location: "شارع 1", adultPrice: "5.000", childPrice: "3.000", adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now },
    { id: branchB, name: "السالمية", location: "شارع 2", adultPrice: "6.000", childPrice: "4.000", adultDurationMinutes: 25, childDurationMinutes: 25, createdAt: now, updatedAt: now },
  ]);
});
beforeEach(async () => { await connection.db.delete(loginAttempts); });

afterAll(async () => {
  const accountRows = await connection.db.select({ id: accounts.id }).from(accounts).where(inArray(accounts.phone, testPhones));
  for (const account of accountRows) {
    await connection.db.delete(employees).where(eq(employees.accountId, account.id));
    await connection.db.delete(accounts).where(eq(accounts.id, account.id));
  }
  await connection.db.delete(branches).where(eq(branches.id, branchA));
  await connection.db.delete(branches).where(eq(branches.id, branchB));
  await connection.pool.end();
});

describe("employee management", () => {
  it("rejects an in-progress old-phone login after an administrator changes the employee phone", async () => {
    const oldPhone = "+96555550061";
    const newPhone = "+96555550062";
    testPhones.push(oldPhone, newPhone);
    const { created } = await createEmployee(oldPhone);
    const repository = createAuthRepository(connection);
    const employeeRepository = createEmployeeRepository(connection);
    const service = createAuthService({
      ...repository,
      async verifyCredentials(...args) {
        const verified = await repository.verifyCredentials(...args);
        await employeeRepository.updateByAdministrator(created.body.id as string, { phone: newPhone });
        return verified;
      },
    }, env);
    expect(await service.authenticate(oldPhone, "employee-password-123", "phone-change-regression")).toEqual({ kind: "invalid" });
    expect((await signIn(oldPhone, "employee-password-123")).response.status).toBe(401);
    expect((await signIn(newPhone, "employee-password-123")).response.status).toBe(200);
  });

  it("lets the administrator create an employee who signs in and sees only own records", async () => {
    const { created } = await createEmployee(testPhones[0]!);
    expect(created.body).toMatchObject({ displayName: "سالم", phone: testPhones[0], branchId: branchA, enabled: true });
    expect(created.body.password).toBeUndefined();
    expect(created.body.passwordHash).toBeUndefined();
    const [account] = await connection.db.select().from(accounts).where(eq(accounts.phone, testPhones[0]!));
    expect(account?.role).toBe("employee");
    expect(account?.passwordHash).not.toBe("employee-password-123");
    expect(await verifyPassword("employee-password-123", account?.passwordHash ?? "")).toBe(true);
    const employee = await signIn(testPhones[0]!, "employee-password-123");
    expect(employee.response.status).toBe(200);
    const ownProfile = await request(app).get("/employees/me").set("Cookie", employee.cookie);
    expect(ownProfile.body.id).toBe(created.body.id);
    expect(ownProfile.body.branch).toEqual({ id: branchA, name: "حولي", location: "شارع 1" });
    expect((await request(app).get(`/employees/${created.body.id}`).set("Cookie", employee.cookie)).status).toBe(200);
    expect((await request(app).get("/employees").set("Cookie", employee.cookie)).status).toBe(403);
    expect((await request(app).get("/branches").set("Cookie", employee.cookie)).status).toBe(403);
  });

  it("allows only display-name self-editing and denies cross-employee records", async () => {
    const first = await createEmployee(testPhones[1]!);
    const second = await createEmployee(testPhones[2]!);
    const employee = await signIn(testPhones[1]!, "employee-password-123");
    const missingCsrf = await request(app).patch("/employees/me").set("Origin", origin).set("Cookie", employee.cookie).send({ displayName: "سالم جديد" });
    expect(missingCsrf.status).toBe(403);
    const forbiddenFields = await request(app).patch("/employees/me").set("Origin", origin).set("Cookie", employee.cookie).set("X-CSRF-Token", employee.csrf)
      .send({ displayName: "سالم جديد", phone: "+96555550999", branchId: branchB });
    expect(forbiddenFields.status).toBe(400);
    const changed = await request(app).patch("/employees/me").set("Origin", origin).set("Cookie", employee.cookie).set("X-CSRF-Token", employee.csrf)
      .send({ displayName: " سالم جديد " });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ id: first.created.body.id, displayName: "سالم جديد", phone: testPhones[1], branchId: branchA });
    expect((await request(app).get(`/employees/${second.created.body.id}`).set("Cookie", employee.cookie)).status).toBe(403);
    expect((await request(app).patch(`/employees/${first.created.body.id}`).set("Origin", origin).set("Cookie", employee.cookie).set("X-CSRF-Token", employee.csrf).send({ branchId: branchB })).status).toBe(403);
  });

  it("allows administrator phone and branch transfer, then disables access immediately", async () => {
    const { admin, created } = await createEmployee(testPhones[3]!);
    const employee = await signIn(testPhones[3]!, "employee-password-123");
    const transferred = await request(app).patch(`/employees/${created.body.id}`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ branchId: branchB, phone: testPhones[4] });
    expect(transferred.status).toBe(200);
    expect(transferred.body).toMatchObject({ branchId: branchB, phone: testPhones[4] });
    expect((await request(app).get("/auth/session").set("Cookie", employee.cookie)).status).toBe(401);
    expect((await signIn(testPhones[3]!, "employee-password-123")).response.status).toBe(401);
    expect((await signIn(testPhones[4]!, "employee-password-123")).response.status).toBe(200);
    const disabled = await request(app).patch(`/employees/${created.body.id}`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf).send({ enabled: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.enabled).toBe(false);
    expect((await request(app).get("/auth/session").set("Cookie", employee.cookie)).status).toBe(401);
    expect((await signIn(testPhones[4]!, "employee-password-123")).response.status).toBe(401);
  });

  it("lets only the administrator reset a password and revokes the old session", async () => {
    const { admin, created } = await createEmployee(testPhones[5]!);
    const employee = await signIn(testPhones[5]!, "employee-password-123");
    const selfReset = await request(app).post(`/employees/${created.body.id}/reset-password`).set("Origin", origin).set("Cookie", employee.cookie).set("X-CSRF-Token", employee.csrf)
      .send({ password: "new-employee-password" });
    expect(selfReset.status).toBe(403);
    const reset = await request(app).post(`/employees/${created.body.id}/reset-password`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ password: "new-employee-password" });
    expect(reset.status).toBe(204);
    expect((await request(app).get("/auth/session").set("Cookie", employee.cookie)).status).toBe(401);
    expect((await signIn(testPhones[5]!, "employee-password-123")).response.status).toBe(401);
    expect((await signIn(testPhones[5]!, "new-employee-password")).response.status).toBe(200);
  });

  it("rejects duplicate phones and nonexistent branches without a partial account", async () => {
    const { admin } = await createEmployee(testPhones[6]!);
    const duplicate = await request(app).post("/employees").set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ displayName: "آخر", phone: testPhones[6], branchId: branchA, password: "employee-password-123" });
    expect(duplicate.status).toBe(409);
    const invalidBranchPhone = "+96555550058";
    testPhones.push(invalidBranchPhone);
    const missingBranch = await request(app).post("/employees").set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
      .send({ displayName: "آخر", phone: invalidBranchPhone, branchId: randomUUID(), password: "employee-password-123" });
    expect(missingBranch.status).toBe(404);
    expect(missingBranch.body.error.code).toBe("BRANCH_NOT_FOUND");
    expect(await connection.db.select().from(accounts).where(eq(accounts.phone, invalidBranchPhone))).toHaveLength(0);
    expect(await connection.db.select().from(accounts).where(eq(accounts.phone, testPhones[6]!))).toHaveLength(1);
  });
});
