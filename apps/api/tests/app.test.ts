import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("API infrastructure", () => {
  it("exposes liveness without requiring a database connection", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "api" });
  });

  it("returns a JSON error for unknown routes", async () => {
    const response = await request(createApp()).get("/missing");
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "NOT_FOUND", message: expect.any(String) } });
  });

  it("returns a JSON client error for malformed JSON", async () => {
    const response = await request(createApp()).post("/health").set("Content-Type", "application/json").send("{");
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_JSON", message: expect.any(String) } });
  });

  it("preserves the client error status when the JSON body is too large", async () => {
    const response = await request(createApp()).post("/health").send({ data: "x".repeat(120_000) });
    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ error: { code: "REQUEST_TOO_LARGE", message: expect.any(String) } });
  });
});
