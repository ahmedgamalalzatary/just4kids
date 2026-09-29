import { describe, expect, it } from "vitest";
import { apiEnvSchema } from "../src/configs/env.js";
import { hashPassword, verifyPassword } from "../src/lib/password.js";

const credentials = { DATABASE_URL: "mysql://test:test@127.0.0.1:3306/just4kids_test", ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64) };

describe("API environment", () => {
  it("provides a local development host and port when unset", () => {
    expect(apiEnvSchema.parse(credentials)).toMatchObject({ NODE_ENV: "development", HOST: "127.0.0.1", PORT: 4000, APP_ORIGIN: "http://localhost:3000" });
  });

  it("converts a valid environment port to a number", () => {
    expect(apiEnvSchema.parse({ ...credentials, PORT: "4100" }).PORT).toBe(4100);
  });

  it.each(["0", "65536", "text", "4000.5"])("rejects invalid port %s before startup", (PORT) => {
    expect(apiEnvSchema.safeParse({ ...credentials, PORT }).success).toBe(false);
  });

  it("refuses startup without administrator credentials, database, and a CSRF signing secret", () => {
    expect(apiEnvSchema.safeParse({}).success).toBe(false);
  });

  it.each(["http://crm.example.com", "https://crm.example.com/path", "https://user:password@crm.example.com"])("rejects unsafe production origin %s", APP_ORIGIN => {
    expect(apiEnvSchema.safeParse({ ...credentials, NODE_ENV: "production", ADMIN_PASSWORD: "a-strong-production-password", APP_ORIGIN }).success).toBe(false);
  });

  it("accepts a configured HTTPS production origin and rejects the local example password", () => {
    expect(apiEnvSchema.safeParse({ ...credentials, NODE_ENV: "production", APP_ORIGIN: "https://crm.example.com" }).success).toBe(false);
    expect(apiEnvSchema.safeParse({ ...credentials, NODE_ENV: "production", ADMIN_PASSWORD: "a-strong-production-password", APP_ORIGIN: "https://crm.example.com" }).success).toBe(true);
  });

  it("rejects the template password in a production environment", () => {
    const result = apiEnvSchema.safeParse({ ...credentials, NODE_ENV: "production", APP_ORIGIN: "https://crm.example.com", ADMIN_PASSWORD: "REPLACE_WITH_A_LONG_UNIQUE_PASSWORD" });
    expect(result.success).toBe(false);
  });
});

describe("password storage", () => {
  it("salts stored password hashes and rejects wrong or corrupt hashes", async () => {
    const first = await hashPassword("admin1234");
    const second = await hashPassword("admin1234");
    expect(first).not.toBe("admin1234");
    expect(first).not.toBe(second);
    expect(await verifyPassword("admin1234", first)).toBe(true);
    expect(await verifyPassword("admin12345", first)).toBe(false);
    expect(await verifyPassword("admin1234", "broken")).toBe(false);
  });
});
