import { describe, expect, it } from "vitest";
import { loginRequestSchema, sessionResponseSchema } from "../src/index.js";

describe("authentication contracts", () => {
  it("accepts canonical international phones and preserves password whitespace", () => {
    expect(loginRequestSchema.parse({ phone: "+96555551234", password: " password with spaces " })).toEqual({ phone: "+96555551234", password: " password with spaces " });
  });

  it.each([
    { phone: "55551234", password: "secret" },
    { phone: "+96555551234", password: "" },
    { phone: "+96555551234", password: "x".repeat(129) },
    { phone: "+96555551234", password: "secret", role: "admin" },
    { phone: "+965<script>", password: "secret" },
  ])("rejects malformed credentials and extra privilege fields: %j", (input) => {
    expect(loginRequestSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a session response that exposes a password hash or bearer token", () => {
    const response = { account: { id: "98a7bb7a-8b66-42d1-a1f3-38937b50a347", phone: "+96555551234", role: "admin" }, expiresAt: "2026-10-06T10:00:00.000Z", csrfToken: "a".repeat(64) };
    expect(sessionResponseSchema.safeParse(response).success).toBe(true);
    expect(sessionResponseSchema.safeParse({ ...response, token: "secret" }).success).toBe(false);
    expect(sessionResponseSchema.safeParse({ ...response, account: { ...response.account, passwordHash: "secret" } }).success).toBe(false);
  });
});
