import { describe, expect, it } from "vitest";
import * as contracts from "../src/index.js";
import { employeeReportQuerySchema, haircutReportQuerySchema, reportCashSchema, reportMoneySchema, reservationReportQuerySchema } from "../src/index.js";

const id = "11111111-1111-4111-8111-111111111111";
describe("booking tracking query", () => {
  it("accepts an optional barber, client and inclusive visit period", () => {
    expect(contracts.bookingTrackingQuerySchema).toBeDefined();
    expect(contracts.bookingTrackingQuerySchema.parse({})).toEqual({});
    const query = { employeeId: id, clientId: id, from: "2030-01-01", to: "2030-01-01" };
    expect(contracts.bookingTrackingQuerySchema.parse(query)).toEqual(query);
    expect(contracts.bookingTrackingQuerySchema.parse({ from: query.from })).toEqual({ from: query.from });
    expect(contracts.bookingTrackingQuerySchema.parse({ to: query.to })).toEqual({ to: query.to });
  });
  it("defaults to the Kuwait week (Saturday to Friday) containing now", () => {
    expect(contracts.currentKuwaitWeek(new Date("2026-10-13T09:00:00.000Z"))).toEqual({ from: "2026-10-10", to: "2026-10-16" });
    // Saturday 00:30 in Kuwait is still Friday in UTC: the new week has started.
    expect(contracts.currentKuwaitWeek(new Date("2026-10-09T21:30:00.000Z"))).toEqual({ from: "2026-10-10", to: "2026-10-16" });
    // Friday 23:30 in Kuwait closes the week.
    expect(contracts.currentKuwaitWeek(new Date("2026-10-16T20:30:00.000Z"))).toEqual({ from: "2026-10-10", to: "2026-10-16" });
    expect(contracts.currentKuwaitWeek(new Date("2026-12-29T12:00:00.000Z"))).toEqual({ from: "2026-12-26", to: "2027-01-01" });
  });
  it("caps the period at 31 days and turns a lone bound into a 7-day week", () => {
    expect(contracts.bookingTrackingQuerySchema.safeParse({ from: "2030-01-01", to: "2030-01-31" }).success).toBe(true);
    expect(contracts.bookingTrackingQuerySchema.safeParse({ from: "2030-01-01", to: "2030-02-01" }).success).toBe(false);
    const now = new Date("2026-10-13T09:00:00.000Z");
    expect(contracts.trackingPeriod({}, now)).toEqual({ from: "2026-10-10", to: "2026-10-16" });
    expect(contracts.trackingPeriod({ from: "2030-02-25" }, now)).toEqual({ from: "2030-02-25", to: "2030-03-03" });
    expect(contracts.trackingPeriod({ to: "2030-03-03" }, now)).toEqual({ from: "2030-02-25", to: "2030-03-03" });
    expect(contracts.trackingPeriod({ from: "2030-01-01", to: "2030-01-31" }, now)).toEqual({ from: "2030-01-01", to: "2030-01-31" });
  });
  it("rejects invalid dates, reversed ranges, invalid identities and unsupported filters", () => {
    expect(contracts.bookingTrackingQuerySchema).toBeDefined();
    for (const query of [{ from: "2030-02-30" }, { to: "yesterday" }, { from: "2030-02-01", to: "2030-01-01" }, { employeeId: "1" }, { clientId: "" }, { dateBasis: "created_date" }, { status: "completed" }, { limit: "20" }]) {
      expect(contracts.bookingTrackingQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});
describe("report contracts", () => {
  it("defaults to the visit date basis, an empty search, and the first page", () => {
    expect(reservationReportQuerySchema.parse({})).toEqual({ dateBasis: "visit_date", q: "", limit: 20, offset: 0 });
    expect(haircutReportQuerySchema.parse({})).toEqual({ dateBasis: "visit_date", q: "" });
  });
  it("accepts every filter from query-string values", () => {
    const query = { dateBasis: "created_date", from: "2030-01-01", to: "2030-01-31", employeeId: id, clientId: id, status: "no_show", source: "ai", q: "  مريم  " };
    expect(reservationReportQuerySchema.parse({ ...query, limit: "50", offset: "100" })).toEqual({ ...query, q: "مريم", limit: 50, offset: 100 });
    expect(haircutReportQuerySchema.parse(query)).toEqual({ ...query, q: "مريم" });
  });
  it.each([{ from: "2030-02-30" }, { from: "2030-01-31", to: "2030-01-01" }, { dateBasis: "paid_date" }, { status: "paid" }, { source: "whatsapp" }, { branchId: id }, { employeeId: "1" }, { q: "x".repeat(121) }, { unknown: "1" }, { limit: "0" }, { limit: "101" }])("rejects invalid reservation report filters: %j", query => {
    expect(reservationReportQuerySchema.safeParse(query).success).toBe(false);
  });
  it("does not paginate the haircut report", () => {
    expect(haircutReportQuerySchema.safeParse({ limit: "20" }).success).toBe(false);
  });
});

describe("performance report contracts", () => {
  it("reuse the report filters for the barber report", () => {
    expect(employeeReportQuerySchema.parse({ from: "2030-01-01", to: "2030-01-31", employeeId: id })).toEqual({ dateBasis: "visit_date", q: "", from: "2030-01-01", to: "2030-01-31", employeeId: id });
    expect(employeeReportQuerySchema.safeParse({ from: "2030-01-31", to: "2030-01-01" }).success).toBe(false);
    expect(employeeReportQuerySchema.safeParse({ limit: "20" }).success).toBe(false);
  });
  it("keeps money as exact three-decimal strings", () => {
    const money = { count: 1, total: "1234567890123456789012345.125" };
    expect(reportMoneySchema.safeParse(money).success).toBe(true);
    for (const total of ["1.5", "1.1250", "01.000", "-1.000"]) expect(reportMoneySchema.safeParse({ count: 1, total }).success).toBe(false);
  });
  it("splits collected cash by method while keeping the overall total", () => {
    const zero = { count: 0, total: "0.000" };
    const cash = { count: 3, total: "9.000", byMethod: { cash: { count: 1, total: "5.000" }, link: { count: 1, total: "3.000" }, knet: { count: 1, total: "1.000" } } };
    expect(reportCashSchema.parse(cash)).toEqual(cash);
    expect(reportCashSchema.safeParse({ count: 1, total: "5.000", byMethod: { cash: { count: 1, total: "5.000" }, link: zero, knet: zero } }).success).toBe(true);
    expect(reportCashSchema.safeParse({ count: 1, total: "5.000" }).success).toBe(false);
    expect(reportCashSchema.safeParse({ ...cash, byMethod: { ...cash.byMethod, card: zero } }).success).toBe(false);
  });
});
