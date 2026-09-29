import { describe, expect, it } from "vitest";
import { apiEnvSchema } from "../src/env.js";

describe("API environment", () => {
  it("provides a local development host and port when unset", () => {
    expect(apiEnvSchema.parse({})).toEqual({ NODE_ENV: "development", HOST: "127.0.0.1", PORT: 4000 });
  });

  it("converts a valid environment port to a number", () => {
    expect(apiEnvSchema.parse({ PORT: "4100" }).PORT).toBe(4100);
  });

  it.each(["0", "65536", "text", "4000.5"])("rejects invalid port %s before startup", (PORT) => {
    expect(apiEnvSchema.safeParse({ PORT }).success).toBe(false);
  });
});
