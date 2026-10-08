import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "@/lib/api/client";

const respond = (status: number, body?: unknown) => vi.fn().mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

afterEach(() => { vi.unstubAllGlobals(); });

describe("apiRequest", () => {
  it("calls the same-origin API with JSON and the CSRF header for writes", async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiRequest("/branches", { method: "POST", body: { name: "x" }, csrfToken: "abc" })).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/branches");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBe(JSON.stringify({ name: "x" }));
    expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("abc");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("adds query parameters and skips empty ones", async () => {
    const fetchMock = respond(200, {});
    vi.stubGlobal("fetch", fetchMock);
    await apiRequest("/clients", { query: { q: "أحمد", limit: 20, offset: 0, empty: undefined } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/clients?q=%D8%A3%D8%AD%D9%85%D8%AF&limit=20&offset=0");
  });

  it("returns undefined for empty successful responses", async () => {
    vi.stubGlobal("fetch", respond(204));
    await expect(apiRequest("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("raises the server error code and Arabic message", async () => {
    vi.stubGlobal("fetch", respond(409, { error: { code: "BARBER_UNAVAILABLE", message: "الموظف غير متاح" } }));
    const error = await apiRequest("/bookings", { method: "POST" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "BARBER_UNAVAILABLE", message: "الموظف غير متاح" });
  });

  it("uses a readable fallback when the server is unreachable or returns no error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(apiRequest("/branches")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));
    await expect(apiRequest("/branches")).rejects.toMatchObject({ status: 502, code: "INTERNAL_ERROR" });
  });
});
