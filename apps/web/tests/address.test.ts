import { describe, expect, it } from "vitest";
import { formatAddress, mapLink } from "@/lib/address";
import { addressFormSchema, emptyAddress } from "@/lib/forms";
import { intervalsProblem } from "@/components/schedule";

const base = { area: "السالمية", block: "10", street: "سالم المبارك", houseNumber: "12", buildingName: null, floor: null, apartment: null, mapsUrl: null, latitude: null, longitude: null };

describe("address display", () => {
  it("joins only the parts that exist", () => {
    expect(formatAddress(base)).toBe("السالمية، قطعة 10، شارع سالم المبارك، منزل 12");
    expect(formatAddress({ ...base, houseNumber: null, buildingName: "برج النخيل", floor: "3", apartment: "7" })).toBe("السالمية، قطعة 10، شارع سالم المبارك، مبنى برج النخيل، الدور 3، شقة 7");
  });

  it("prefers the saved map link and falls back to coordinates", () => {
    expect(mapLink(base)).toBeNull();
    expect(mapLink({ ...base, latitude: "29.3375", longitude: "48.0758" })).toBe("https://www.google.com/maps?q=29.3375,48.0758");
    expect(mapLink({ ...base, mapsUrl: "https://maps.app.goo.gl/abc", latitude: "29.3", longitude: "48.0" })).toBe("https://maps.app.goo.gl/abc");
  });
});

describe("address form", () => {
  const filled = { ...emptyAddress, area: "السالمية", block: "10", street: "1" };

  it("requires a house number or building name and turns blanks into null", () => {
    expect(addressFormSchema.safeParse(filled).error?.issues[0]?.path).toEqual(["houseNumber"]);
    const parsed = addressFormSchema.parse({ ...filled, buildingName: "برج" });
    expect(parsed).toMatchObject({ houseNumber: null, buildingName: "برج", floor: null, mapsUrl: null, latitude: null });
  });

  it("requires both coordinates and a real Google Maps link", () => {
    expect(addressFormSchema.safeParse({ ...filled, houseNumber: "1", latitude: "29.3" }).success).toBe(false);
    expect(addressFormSchema.safeParse({ ...filled, houseNumber: "1", mapsUrl: "https://example.com/maps" }).success).toBe(false);
    expect(addressFormSchema.safeParse({ ...filled, houseNumber: "1", mapsUrl: "https://maps.app.goo.gl/x", latitude: "29.3", longitude: "48.1" }).success).toBe(true);
  });
});

describe("work shift validation", () => {
  it("rejects incomplete, reversed, and overlapping shifts but allows adjacent ones", () => {
    expect(intervalsProblem([{ startTime: "09:00", endTime: "" }])).not.toBeNull();
    expect(intervalsProblem([{ startTime: "12:00", endTime: "09:00" }])).not.toBeNull();
    expect(intervalsProblem([{ startTime: "09:00", endTime: "12:00" }, { startTime: "11:00", endTime: "14:00" }])).toBe("الفترات متداخلة");
    expect(intervalsProblem([{ startTime: "09:00", endTime: "12:00" }, { startTime: "12:00", endTime: "14:00" }])).toBeNull();
  });
});
