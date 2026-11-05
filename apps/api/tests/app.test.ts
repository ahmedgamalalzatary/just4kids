import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, errorHandler } from "../src/app.js";

describe("API infrastructure", () => {
  it("exposes liveness without requiring a database connection", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "api" });
  });

  it("has no WhatsApp webhook while the intake is not configured", async () => {
    expect((await request(createApp()).post("/whatsapp/webhook").send({})).status).toBe(404);
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

  it("logs unexpected errors while keeping their details out of the response", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const failure = new Error("stored data failed validation");
      const app = express().get("/broken/:id", () => { throw failure; }).use(errorHandler);
      const response = await request(app).get("/broken/abc?x=1");
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Could not process the request" } });
      expect(logged).toHaveBeenCalledWith("Unexpected error on GET /broken/abc?x=1", failure);
    } finally { logged.mockRestore(); }
  });

  it("does not log expected client errors", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect((await request(createApp()).post("/health").set("Content-Type", "application/json").send("{")).status).toBe(400);
      expect(logged).not.toHaveBeenCalled();
    } finally { logged.mockRestore(); }
  });
});
