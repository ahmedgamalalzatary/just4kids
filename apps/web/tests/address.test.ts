import { describe, expect, it } from "vitest";
import { formatAddress, mapLink } from "@/lib/address";
import { addressFormSchema, emptyAddress } from "@/lib/forms";
import { intervalsProblem } from "@/components/schedule";

const base = { area: "السالمية", block: "10", street: "سالم المبارك", houseNumber: "12", buildingName: null, floor: null, apartment: null, mapsUrl: null };

describe("address display", () => {
  it("joins only the parts that exist", () => {
    expect(formatAddress(base)).toBe("السالمية, Block 10, Street سالم المبارك, House 12");
    expect(formatAddress({ ...base, houseNumber: null, buildingName: "برج النخيل", floor: "3", apartment: "7" })).toBe("السالمية, Block 10, Street سالم المبارك, Building برج النخيل, Floor 3, Apartment 7");
    expect(formatAddress({ ...base, avenue: "3", gate: "12", blueNumber: "5" })).toBe("السالمية, Block 10, Street سالم المبارك, House 12, Avenue 3, Gate 12, Blue number 5");
  });

  it("uses only the saved map link", () => {
    expect(mapLink(base)).toBeNull();
    expect(mapLink({ ...base, mapsUrl: "https://maps.app.goo.gl/abc" })).toBe("https://maps.app.goo.gl/abc");
  });
});

describe("address form", () => {
  const filled = { ...emptyAddress, area: "السالمية", block: "10", street: "1" };

  it("requires a house number or building name and turns blanks into null", () => {
    expect(addressFormSchema.safeParse(filled).error?.issues[0]?.path).toEqual(["houseNumber"]);
    const parsed = addressFormSchema.parse({ ...filled, buildingName: "برج" });
    expect(parsed).toMatchObject({ houseNumber: null, buildingName: "برج", floor: null, mapsUrl: null, avenue: null, gate: null, blueNumber: null });
  });

  it("keeps the optional avenue, gate and blue number", () => {
    const parsed = addressFormSchema.parse({ ...filled, buildingName: "برج", avenue: "3", gate: "12", blueNumber: "5" });
    expect(parsed).toMatchObject({ avenue: "3", gate: "12", blueNumber: "5" });
  });

  it("requires a real Google Maps link", () => {

    expect(addressFormSchema.safeParse({ ...filled, houseNumber: "1", mapsUrl: "https://example.com/maps" }).success).toBe(false);
    expect(addressFormSchema.safeParse({ ...filled, houseNumber: "1", mapsUrl: "https://maps.app.goo.gl/x" }).success).toBe(true);
  });
});

describe("work shift validation", () => {
  it("rejects incomplete, reversed, and overlapping shifts but allows adjacent ones", () => {
    expect(intervalsProblem([{ startTime: "09:00", endTime: "" }])).not.toBeNull();
    expect(intervalsProblem([{ startTime: "12:00", endTime: "09:00" }])).not.toBeNull();
    expect(intervalsProblem([{ startTime: "09:00", endTime: "12:00" }, { startTime: "11:00", endTime: "14:00" }])).toBe("Shifts overlap");
    expect(intervalsProblem([{ startTime: "09:00", endTime: "12:00" }, { startTime: "12:00", endTime: "14:00" }])).toBeNull();
  });
});
