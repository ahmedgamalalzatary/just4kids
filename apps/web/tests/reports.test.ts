import { describe, expect, it } from "vitest";
import { emptyReportFilters, rangeError, readReportFilters, reportSearch, utilisation } from "@/lib/reports";

const branchId = "7a3f2c1e-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const employeeId = "1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a8b";

describe("report filters", () => {
  it("reads valid filters from the address", () => {
    const params = new URLSearchParams({ dateBasis: "created_date", from: "2026-10-01", to: "2026-10-31", branchId, employeeId, status: "no_show", source: "ai", q: "  J4K-1 " });
    expect(readReportFilters(params, true)).toEqual({ dateBasis: "created_date", from: "2026-10-01", to: "2026-10-31", branchId, employeeId, status: "no_show", source: "ai", q: "J4K-1" });
  });

  it("drops malformed values instead of failing the report", () => {
    const params = new URLSearchParams({ dateBasis: "paid_date", from: "2026-13-40", to: "yesterday", branchId: "x", employeeId: "1", status: "lost", source: "phone", q: "a".repeat(121) });
    expect(readReportFilters(params, true)).toEqual(emptyReportFilters);
  });

  it("ignores branch and barber filters for barbers, who see only their own work", () => {
    expect(readReportFilters(new URLSearchParams({ branchId, employeeId, status: "completed" }), false)).toEqual({ ...emptyReportFilters, status: "completed" });
  });

  it("writes only non-default filters back to the address", () => {
    expect(reportSearch(emptyReportFilters)).toBe("");
    expect(reportSearch({ ...emptyReportFilters, from: "2026-10-01", q: "سارة" })).toBe("?from=2026-10-01&q=%D8%B3%D8%A7%D8%B1%D8%A9");
    expect(reportSearch({ ...emptyReportFilters, dateBasis: "created_date", status: "booked" })).toBe("?dateBasis=created_date&status=booked");
  });

  it("round-trips through the address", () => {
    const filters = { ...emptyReportFilters, dateBasis: "created_date" as const, from: "2026-10-01", to: "2026-10-02", branchId, source: "manual" as const };
    expect(readReportFilters(new URLSearchParams(reportSearch(filters)), true)).toEqual(filters);
  });

  it("rejects a range that ends before it starts", () => {
    expect(rangeError("2026-10-02", "2026-10-01")).toBe("تاريخ النهاية قبل تاريخ البداية");
    expect(rangeError("2026-10-01", "2026-10-01")).toBeUndefined();
    expect(rangeError("", "2026-10-01")).toBeUndefined();
  });
});

describe("utilisation", () => {
  it("is the reserved share of scheduled minutes, rounded", () => {
    expect(utilisation(90, 480)).toBe(19);
    expect(utilisation(600, 480)).toBe(125);
  });

  it("is unknown without scheduled time", () => {
    expect(utilisation(30, null)).toBeNull();
    expect(utilisation(30, 0)).toBeNull();
  });
});
