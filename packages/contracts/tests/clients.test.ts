import { describe, expect, it } from "vitest";
import { addressCreateSchema, addressUpdateSchema, clientCreateSchema, clientSearchSchema, clientStatusUpdateSchema, clientSummarySchema } from "../src/index.js";

const address = { area: "حولي", block: "3", street: "شارع 5", houseNumber: "12" };

describe("client and address contracts", () => {
  it("creates a phone-only client and rejects a removed client name", () => {
    expect(clientCreateSchema.safeParse({ phone: "+96555550101", address }).success).toBe(true);
    expect(clientCreateSchema.safeParse({ name: "Removed", phone: "+96555550101", address }).success).toBe(false);
  });

  it.each(["latitude", "longitude", "instructions"])("rejects removed address field %s on create and update", field => {
    expect(addressCreateSchema.safeParse({ ...address, [field]: "29" }).success).toBe(false);
    expect(addressUpdateSchema.safeParse({ [field]: null }).success).toBe(false);
  });
  it("requires an international phone and a usable initial address", () => {
    expect(clientCreateSchema.parse({ phone: "+96555550101", address })).toMatchObject({ phone: "+96555550101", address });
    expect(clientCreateSchema.safeParse({ phone: "55550101", address }).success).toBe(false);
    expect(clientCreateSchema.safeParse({ phone: "+96555550101" }).success).toBe(false);
    expect(addressCreateSchema.safeParse({ area: "حولي", block: "3", street: "شارع 5" }).success).toBe(false);
    expect(addressCreateSchema.safeParse({ area: "حولي", block: "3", street: "شارع 5", buildingName: "برج السلام" }).success).toBe(true);
  });

  it("accepts only trusted Google Maps links", () => {
    expect(addressCreateSchema.safeParse({ ...address, mapsUrl: "https://maps.app.goo.gl/AbCd123" }).success).toBe(true);
    expect(addressCreateSchema.safeParse({ ...address, mapsUrl: "https://www.google.com/maps/place/Kuwait" }).success).toBe(true);
    expect(addressCreateSchema.safeParse({ ...address, mapsUrl: "https://evilgoogle.com/maps" }).success).toBe(false);
    expect(addressCreateSchema.safeParse({ ...address, mapsUrl: "https://user:pass@www.google.com/maps" }).success).toBe(false);
  });

  it("permits clearing optional address details but rejects unsupported fields", () => {
    expect(addressUpdateSchema.safeParse({ floor: null, apartment: null }).success).toBe(true);
    expect(addressUpdateSchema.safeParse({}).success).toBe(false);
    expect(addressUpdateSchema.safeParse({ childNames: ["x"] }).success).toBe(false);
  });

  it("treats the avenue, gate and blue number as optional extras", () => {
    expect(addressCreateSchema.safeParse({ ...address, avenue: "جادة 3", gate: "12", blueNumber: "5" }).success).toBe(true);
    expect(addressCreateSchema.safeParse(address).success).toBe(true);
    expect(addressCreateSchema.safeParse({ ...address, blueNumber: "  " }).success).toBe(false);
    expect(addressUpdateSchema.safeParse({ avenue: null, gate: null, blueNumber: null }).success).toBe(true);
  });

  it("bounds admin search and pagination", () => {
    expect(clientSearchSchema.parse({ q: " سارة ", limit: "20", offset: "0" })).toEqual({ q: "سارة", limit: 20, offset: 0, status: "all" });
    expect(clientSearchSchema.safeParse({ limit: "1000" }).success).toBe(false);
    expect(clientSearchSchema.parse({ status: "stopped" }).status).toBe("stopped");
    expect(clientSearchSchema.safeParse({ status: "paused" }).success).toBe(false);
  });

  it("requires an active flag on clients and a reason to stop or reactivate", () => {
    expect(clientSummarySchema.safeParse({ id: "11111111-1111-4111-8111-111111111111", phone: "+96555550101", createdAt: "2026-10-11T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z" }).success).toBe(false);
    expect(clientStatusUpdateSchema.safeParse({ enabled: false, reason: "  " }).success).toBe(false);
    expect(clientStatusUpdateSchema.safeParse({ enabled: false }).success).toBe(false);
    expect(clientStatusUpdateSchema.parse({ enabled: false, reason: " طلب العميل " })).toEqual({ enabled: false, reason: "طلب العميل" });
  });
});
