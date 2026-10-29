import { describe, expect, it } from "vitest";
import { bookingWindow, childCounts, collectionAmounts, legacyAddress, legacyId, legacyUtc, normalizePhone, salonAmounts, visitStatus } from "../src/legacy-import/mapping.js";

describe("legacy import mapping", () => {
  it("derives the same RFC 4122 identifier for the same legacy row", () => {
    const id = legacyId("appointment", 42);
    expect(id).toBe(legacyId("appointment", 42));
    expect(id).not.toBe(legacyId("customer", 42));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("converts Kuwaiti phones to international format and rejects broken ones", () => {
    expect(normalizePhone("99998888")).toBe("+96599998888");
    expect(normalizePhone(" 9999-8888 ")).toBe("+96599998888");
    expect(normalizePhone("96598827325")).toBe("+96598827325");
    expect(normalizePhone("+96555459412")).toBe("+96555459412");
    expect(normalizePhone("0096555459412")).toBe("+96555459412");
    for (const broken of ["", "9606668", "599528095", "01018183039", null]) expect(normalizePhone(broken)).toBeNull();
  });

  it("treats past open visits as completed and keeps today/future ones booked", () => {
    expect(visitStatus("completed", "2026-12-01", "2026-10-29")).toBe("completed");
    expect(visitStatus("cancelled", "2026-01-01", "2026-10-29")).toBe("cancelled");
    for (const open of ["confirmed", "", "pending"]) {
      expect(visitStatus(open, "2026-10-28", "2026-10-29")).toBe("completed");
      expect(visitStatus(open, "2026-10-29", "2026-10-29")).toBe("booked");
    }
  });

  it("gives every visit the 30-minute default window", () => {
    expect(bookingWindow("10:00:00")).toEqual({ startTime: "10:00", endTime: "10:30" });
    expect(bookingWindow("23:30:00")).toEqual({ startTime: "23:30", endTime: "23:59" });
    expect(bookingWindow("13:45:00")).toEqual({ startTime: "13:45", endTime: "14:15" });
  });

  it("imports zero children as one child and never more special than total", () => {
    expect(childCounts(0, 0, 0)).toEqual({ childCount: 1, specialChildCount: 0 });
    expect(childCounts(3, 2, 1)).toEqual({ childCount: 3, specialChildCount: 1 });
    expect(childCounts(2, 2, 1)).toEqual({ childCount: 3, specialChildCount: 1 });
  });

  it("requires block, street and building and turns empty optional parts into null", () => {
    const row = { block: " 4 ", street: "12", building: "7", avenu: "", G: " ", blue: "3", floor: "", apartment: "2" };
    expect(legacyAddress(row, "Salmiya", null)).toEqual({ area: "Salmiya", block: "4", street: "12", houseNumber: "7", buildingName: null, avenue: null, gate: null, blueNumber: "3", floor: null, apartment: "2", mapsUrl: null });
    expect(legacyAddress({ ...row, building: "" }, "Salmiya", null)).toBeNull();
    expect(legacyAddress({ ...row, street: "" }, "Salmiya", null)).toBeNull();
    expect(legacyAddress(row, null, null)).toBeNull();
    expect(legacyAddress({ ...row, floor: "x".repeat(121) }, "Salmiya", null)).toBeNull();
  });

  it("puts online money in Link and delivery in Cash without changing the total", () => {
    expect(collectionAmounts({ amount_cash: "5.000", amount_online: "12.000", delivery_amount: "62.000", total_amount: "79.000" })).toEqual({ cash: "67.000", link: "12.000", knet: "0.000", total: "79.000" });
    expect(() => collectionAmounts({ amount_cash: "1.000", amount_online: "0.000", delivery_amount: "0.000", total_amount: "2.000" })).toThrow();
  });

  it("keeps the salon's cash, link and KNET boxes as they were", () => {
    expect(salonAmounts({ cash_amount: "4.000", link_amount: "10.000", kent_amount: "2.000", total_amount: "16.000" })).toEqual({ cash: "4.000", link: "10.000", knet: "2.000", total: "16.000" });
    expect(() => salonAmounts({ cash_amount: "4.000", link_amount: "0.000", kent_amount: "0.000", total_amount: "5.000" })).toThrow();
  });

  it("reads legacy UTC timestamps", () => {
    expect(legacyUtc("2026-08-05 09:15:00")?.toISOString()).toBe("2026-08-05T09:15:00.000Z");
    expect(legacyUtc(null)).toBeNull();
    expect(legacyUtc("0000-00-00 00:00:00")).toBeNull();
  });
});
