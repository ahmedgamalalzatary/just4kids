import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, branches, employees, loginAttempts } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { createAuth } from "../src/modules/auth/index.js";

const origin = "http://localhost:3000";
const uploadsDir = join(tmpdir(), `just4kids-photos-${randomUUID()}`);
const env = {
  NODE_ENV: "test" as const,
  DATABASE_URL: process.env.DATABASE_URL,
  ADMIN_PHONE: "+96555551234",
  ADMIN_PASSWORD: "admin1234",
  AUTH_SECRET: "a".repeat(64),
  APP_ORIGIN: origin,
};
const parsedEnv = () => apiEnvSchema.parse({ ...env, UPLOADS_DIR: uploadsDir });
const connection = createDatabase(env.DATABASE_URL!);
const auth = createAuth(connection, parsedEnv());
let app: ReturnType<typeof createApp>;
const branchA = randomUUID();
const testPhones = ["+96555550101", "+96555550102", "+96555550103", "+96555550104"];

async function signIn(phone: string, password: string) {
  const challenge = await request(app).get("/auth/csrf");
  const preloginCookie = challenge.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const response = await request(app).post("/auth/login").set("Origin", origin).set("Cookie", preloginCookie).set("X-CSRF-Token", challenge.body.csrfToken).send({ phone, password });
  const cookie = (response.headers["set-cookie"] as string[] | undefined)?.find(value => value.startsWith("j4k_session="))?.split(";")[0] ?? "";
  return { response, cookie, csrf: response.body.csrfToken as string };
}

async function adminSession() {
  const session = await signIn(env.ADMIN_PHONE, env.ADMIN_PASSWORD);
  expect(session.response.status).toBe(200);
  return session;
}

async function createEmployee(phone: string) {
  const admin = await adminSession();
  const created = await request(app).post("/employees").set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)
    .send({ displayName: "سالم", phone, branchId: branchA, password: "employee-password-123" });
  expect(created.status).toBe(201);
  return { admin, created };
}

function colorPhoto(format: "jpeg" | "png" | "webp", color: { r: number; g: number; b: number }) {
  const image = sharp({ create: { width: 1000, height: 750, channels: 3, background: color } });
  return (format === "jpeg" ? image.jpeg() : format === "png" ? image.png() : image.webp()).toBuffer();
}

async function uploadPhoto(id: string, csrf: string, cookie: string, body: Buffer, contentType: string) {
  return request(app).put(`/employees/${id}/photo`).set("Origin", origin).set("Cookie", cookie).set("X-CSRF-Token", csrf).set("Content-Type", contentType).send(body);
}

beforeAll(async () => {
  await mkdir(uploadsDir, { recursive: true });
  app = createApp({ auth, connection, env: parsedEnv() });
  await connection.db.delete(loginAttempts);
  await auth.initialize();
  const now = new Date();
  await connection.db.insert(branches).values({ id: branchA, name: "حولي", location: "شارع 1", adultPrice: "5.000", childPrice: "3.000", adultDurationMinutes: 20, childDurationMinutes: 20, createdAt: now, updatedAt: now });
});
beforeEach(async () => { await connection.db.delete(loginAttempts); });

afterAll(async () => {
  const accountRows = await connection.db.select({ id: accounts.id }).from(accounts).where(inArray(accounts.phone, testPhones));
  for (const account of accountRows) {
    await connection.db.delete(employees).where(eq(employees.accountId, account.id));
    await connection.db.delete(accounts).where(eq(accounts.id, account.id));
  }
  await connection.db.delete(branches).where(eq(branches.id, branchA));
  await connection.pool.end();
  await rm(uploadsDir, { recursive: true, force: true });
});

describe("barber photos", () => {
  it("requires authentication to read a photo and reports a missing photo", async () => {
    const { created } = await createEmployee(testPhones[0]!);
    expect((await request(app).get(`/employees/${created.body.id}/photo`)).status).toBe(401);
    const admin = await adminSession();
    const missing = await request(app).get(`/employees/${created.body.id}/photo`).set("Cookie", admin.cookie);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("PHOTO_NOT_FOUND");
  });

  it("lets the administrator upload, resize, and re-encode a photo that any signed-in user can read", async () => {
    const { created } = await createEmployee(testPhones[1]!);
    const admin = await adminSession();
    const uploaded = await uploadPhoto(created.body.id, admin.csrf, admin.cookie, await colorPhoto("png", { r: 200, g: 40, b: 40 }), "image/png");
    expect(uploaded.status).toBe(204);
    const afterUpload = await request(app).get(`/employees/${created.body.id}`).set("Cookie", admin.cookie);
    expect(afterUpload.body.photoUpdatedAt).toEqual(expect.any(String));

    const fetched = await request(app).get(`/employees/${created.body.id}/photo`).set("Cookie", admin.cookie);
    expect(fetched.status).toBe(200);
    expect(fetched.headers["content-type"]).toContain("image/jpeg");
    const stored = await sharp(fetched.body).metadata();
    expect(stored.format).toBe("jpeg");
    expect(stored.width).toBeLessThanOrEqual(512);
    expect(stored.height).toBeLessThanOrEqual(512);

    const employee = await signIn(testPhones[1]!, "employee-password-123");
    expect(employee.response.status).toBe(200);
    expect((await request(app).get(`/employees/${created.body.id}/photo`).set("Cookie", employee.cookie)).status).toBe(200);
  });

  it("accepts JPEG and WEBP uploads, replaces an existing photo, and removes it", async () => {
    const { created } = await createEmployee(testPhones[2]!);
    const admin = await adminSession();
    expect((await uploadPhoto(created.body.id, admin.csrf, admin.cookie, await colorPhoto("webp", { r: 10, g: 10, b: 200 }), "image/webp")).status).toBe(204);
    const first = await request(app).get(`/employees/${created.body.id}/photo`).set("Cookie", admin.cookie);
    expect(first.status).toBe(200);

    expect((await uploadPhoto(created.body.id, admin.csrf, admin.cookie, await colorPhoto("jpeg", { r: 10, g: 200, b: 10 }), "image/jpeg")).status).toBe(204);
    const second = await request(app).get(`/employees/${created.body.id}/photo`).set("Cookie", admin.cookie);
    expect(second.status).toBe(200);
    expect(Buffer.compare(first.body as Buffer, second.body as Buffer)).not.toBe(0);

    const removed = await request(app).delete(`/employees/${created.body.id}/photo`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf);
    expect(removed.status).toBe(204);
    expect((await request(app).get(`/employees/${created.body.id}/photo`).set("Cookie", admin.cookie)).status).toBe(404);
    expect((await request(app).get(`/employees/${created.body.id}`).set("Cookie", admin.cookie)).body.photoUpdatedAt).toBeNull();
  });

  it("rejects unsupported types, oversized files, unauthorized callers, and unknown barbers", async () => {
    const phone = testPhones[3]!;
    const { created } = await createEmployee(phone);
    const admin = await adminSession();
    expect((await uploadPhoto(created.body.id, admin.csrf, admin.cookie, Buffer.from("not an image"), "image/gif")).status).toBe(415);
    expect((await uploadPhoto(created.body.id, admin.csrf, admin.cookie, Buffer.from("not an image"), "image/png")).status).toBe(415);

    const employee = await signIn(phone, "employee-password-123");
    const employeeAttempt = await uploadPhoto(created.body.id, employee.csrf, employee.cookie, await colorPhoto("png", { r: 1, g: 2, b: 3 }), "image/png");
    expect(employeeAttempt.status).toBe(403);

    const missingCsrf = await request(app).put(`/employees/${created.body.id}/photo`).set("Origin", origin).set("Cookie", admin.cookie).set("Content-Type", "image/png").send(await colorPhoto("png", { r: 1, g: 2, b: 3 }));
    expect(missingCsrf.status).toBe(403);

    const oversized = await uploadPhoto(created.body.id, admin.csrf, admin.cookie, Buffer.alloc(2 * 1024 * 1024 + 1), "image/png");
    expect(oversized.status).toBe(413);

    expect((await uploadPhoto(randomUUID(), admin.csrf, admin.cookie, await colorPhoto("png", { r: 1, g: 2, b: 3 }), "image/png")).status).toBe(404);
    expect((await request(app).delete(`/employees/${randomUUID()}/photo`).set("Origin", origin).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrf)).status).toBe(404);
  });
});
