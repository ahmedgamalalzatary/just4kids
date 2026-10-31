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

  it("accepts a configured HTTPS production origin", () => {
    expect(apiEnvSchema.safeParse({ ...credentials, NODE_ENV: "production", ADMIN_PASSWORD: "a-strong-production-password", APP_ORIGIN: "https://crm.example.com" }).success).toBe(true);
  });

  it("accepts an administrator password shorter than 12 characters in production", () => {
    expect(apiEnvSchema.safeParse({ ...credentials, NODE_ENV: "production", ADMIN_PASSWORD: "short9pwd", APP_ORIGIN: "https://crm.example.com" }).success).toBe(true);
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

  describe("WhatsApp intake settings", () => {
    const whatsapp = {
      OPENWA_BASE_URL: "http://openwa:2785", OPENWA_API_KEY: "openwa-key", OPENWA_SESSION_ID: "8f3c2b1a-9d4e-4c7a-8b2f-1e6d5a4c3b2a", OPENWA_WEBHOOK_SECRET: "s".repeat(32),
      STAFF_WHATSAPP_NUMBER: "+96550000000", AI_BASE_URL: "https://ai.example.com/v1", AI_API_KEY: "ai-key", AI_MODEL: "model-1",
    };

    it("leaves the intake off when every setting is unset or empty", () => {
      expect(apiEnvSchema.parse(credentials).whatsapp).toBeNull();
      expect(apiEnvSchema.parse({ ...credentials, ...Object.fromEntries(Object.keys(whatsapp).map(key => [key, ""])) }).whatsapp).toBeNull();
    });

    it("groups the complete settings and drops a trailing slash from base URLs", () => {
      expect(apiEnvSchema.parse({ ...credentials, ...whatsapp, OPENWA_BASE_URL: "http://openwa:2785/", AI_BASE_URL: "https://ai.example.com/v1/" }).whatsapp).toEqual({
        openwa: { baseUrl: "http://openwa:2785", apiKey: "openwa-key", sessionId: "8f3c2b1a-9d4e-4c7a-8b2f-1e6d5a4c3b2a", webhookSecret: "s".repeat(32) },
        staffPhones: ["+96550000000"],
        ai: { baseUrl: "https://ai.example.com/v1", apiKey: "ai-key", model: "model-1" },
      });
    });

    it("treats the thinking setting as optional and passes it with the AI settings", () => {
      expect(apiEnvSchema.parse({ ...credentials, ...whatsapp, AI_THINKING: "" }).whatsapp?.ai.thinking).toBeUndefined();
      expect(apiEnvSchema.parse({ ...credentials, ...whatsapp, AI_THINKING: "disabled" }).whatsapp?.ai.thinking).toBe("disabled");
      expect(apiEnvSchema.safeParse({ ...credentials, ...whatsapp, AI_THINKING: "off" }).success).toBe(false);
      expect(apiEnvSchema.parse({ ...credentials, AI_THINKING: "disabled" }).whatsapp).toBeNull();
    });

    it.each(Object.keys(whatsapp))("refuses startup when only %s is missing", key => {
      expect(apiEnvSchema.safeParse({ ...credentials, ...whatsapp, [key]: "" }).success).toBe(false);
    });

    it("reads several staff numbers separated by commas", () => {
      const parsed = apiEnvSchema.parse({ ...credentials, ...whatsapp, STAFF_WHATSAPP_NUMBER: "+201010813502, +201043370821" });
      expect(parsed.whatsapp?.staffPhones).toEqual(["+201010813502", "+201043370821"]);
    });
    it.each([{ OPENWA_BASE_URL: "openwa" }, { OPENWA_SESSION_ID: "business" }, { AI_BASE_URL: "ftp://ai.example.com" }, { STAFF_WHATSAPP_NUMBER: "50000000" }, { OPENWA_WEBHOOK_SECRET: "short" }])("rejects invalid setting %j", value => {
      expect(apiEnvSchema.safeParse({ ...credentials, ...whatsapp, ...value }).success).toBe(false);
    });

    it("never echoes a secret in a validation message", () => {
      const result = apiEnvSchema.safeParse({ ...credentials, ...whatsapp, AI_API_KEY: "" , OPENWA_WEBHOOK_SECRET: "leaky" });
      expect(JSON.stringify(result.error?.issues)).not.toContain("leaky");
    });
  });
});
