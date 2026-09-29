import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "../src/index.js";

describe("health response contract", () => {
  it("accepts the API liveness payload", () => {
    expect(healthResponseSchema.safeParse({ status: "ok", service: "api" }).success).toBe(true);
  });

  it.each([{ status: "ok" }, { status: "failed", service: "api" }, { status: "ok", service: "other" }])("rejects malformed payload %j", (payload) => {
    expect(healthResponseSchema.safeParse(payload).success).toBe(false);
  });
});
