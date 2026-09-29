import { describe, expect, it } from "vitest";
import { addressCreateSchema, addressUpdateSchema, clientCreateSchema, clientSearchSchema } from "../src/index.js";

const address = { area: "حولي", block: "3", street: "شارع 5", houseNumber: "12" };

describe("client and address contracts", () => {
  it("requires an international phone and a usable initial address", () => {
    expect(clientCreateSchema.parse({ name: " سارة ", phone: "+96555550101", address })).toMatchObject({ name: "سارة", phone: "+96555550101", address });
    expect(clientCreateSchema.safeParse({ name: "سارة", phone: "55550101", address }).success).toBe(false);
    expect(clientCreateSchema.safeParse({ name: "سارة", phone: "+96555550101" }).success).toBe(false);
    expect(addressCreateSchema.safeParse({ area: "حولي", block: "3", street: "شارع 5" }).success).toBe(false);
    expect(addressCreateSchema.safeParse({ area: "حولي", block: "3", street: "شارع 5", buildingName: "برج السلام" }).success).toBe(true);
  });

  it("accepts a Google Maps link or a complete WhatsApp location, but rejects partial coordinates", () => {
    expect(addressCreateSchema.safeParse({ ...address, mapsUrl: "https://maps.app.goo.gl/AbCd123" }).success).toBe(true);
    expect(addressCreateSchema.safeParse({ ...address, mapsUrl: "https://www.google.com/maps/place/Kuwait" }).success).toBe(true);
    expect(addressCreateSchema.safeParse({ ...address, mapsUrl: "https://evilgoogle.com/maps" }).success).toBe(false);
    expect(addressCreateSchema.safeParse({ ...address, mapsUrl: "https://user:pass@www.google.com/maps" }).success).toBe(false);
    expect(addressCreateSchema.safeParse({ ...address, latitude: "29.3375000", longitude: "47.9333000" }).success).toBe(true);
    expect(addressCreateSchema.safeParse({ ...address, latitude: "29.3375000" }).success).toBe(false);
    expect(addressCreateSchema.safeParse({ ...address, latitude: "91", longitude: "47" }).success).toBe(false);
  });

  it("permits clearing optional address details but rejects unsupported fields", () => {
    expect(addressUpdateSchema.safeParse({ floor: null, apartment: null }).success).toBe(true);
    expect(addressUpdateSchema.safeParse({}).success).toBe(false);
    expect(addressUpdateSchema.safeParse({ childNames: ["x"] }).success).toBe(false);
  });

  it("bounds admin search and pagination", () => {
    expect(clientSearchSchema.parse({ q: " سارة ", limit: "20", offset: "0" })).toEqual({ q: "سارة", limit: 20, offset: 0 });
    expect(clientSearchSchema.safeParse({ limit: "1000" }).success).toBe(false);
  });
});
