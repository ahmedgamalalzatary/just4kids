import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiUpload } from "@/lib/api/client";
import { employeePhotoUrl } from "@/lib/employee";

afterEach(() => { vi.unstubAllGlobals(); });

describe("employee photo", () => {
  it("builds the authenticated photo route for a barber, versioned when a photo exists", () => {
    expect(employeePhotoUrl("abc-123")).toBe("/api/employees/abc-123/photo");
    expect(employeePhotoUrl("abc-123", null)).toBe("/api/employees/abc-123/photo");
    expect(employeePhotoUrl("abc-123", "2026-10-11T10:00:00.000Z")).toBe("/api/employees/abc-123/photo?v=2026-10-11T10%3A00%3A00.000Z");
  });

  it("uploads a binary photo to the same-origin API with the CSRF header and no JSON content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
    await expect(apiUpload("/employees/x/photo", file, { method: "PUT", csrfToken: "token" })).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/employees/x/photo");
    expect(init.method).toBe("PUT");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBe(file);
    expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("token");
    expect(new Headers(init.headers).get("Content-Type")).toBeNull();
  });

  it("raises the server error code and message for a rejected upload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "UNSUPPORTED_PHOTO_TYPE", message: "صيغة غير مدعومة" } }), { status: 415, headers: { "Content-Type": "application/json" } })));
    const error = await apiUpload("/employees/x/photo", new Blob(), { method: "PUT" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 415, code: "UNSUPPORTED_PHOTO_TYPE", message: "صيغة غير مدعومة" });
  });
});
