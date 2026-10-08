import { describe, expect, it } from "vitest";
import { branchReportQuerySchema, employeeReportQuerySchema, haircutReportQuerySchema, reportMoneySchema, reservationReportQuerySchema } from "../src/index.js";

const id = "11111111-1111-4111-8111-111111111111";
describe("report contracts", () => {
  it("defaults to the visit date basis, an empty search, and the first page", () => {
    expect(reservationReportQuerySchema.parse({})).toEqual({ dateBasis: "visit_date", q: "", limit: 20, offset: 0 });
    expect(haircutReportQuerySchema.parse({})).toEqual({ dateBasis: "visit_date", q: "" });
  });
  it("accepts every filter from query-string values", () => {
    const query = { dateBasis: "created_date", from: "2030-01-01", to: "2030-01-31", branchId: id, employeeId: id, clientId: id, status: "no_show", source: "ai", q: "  مريم  " };
    expect(reservationReportQuerySchema.parse({ ...query, limit: "50", offset: "100" })).toEqual({ ...query, q: "مريم", limit: 50, offset: 100 });
    expect(haircutReportQuerySchema.parse(query)).toEqual({ ...query, q: "مريم" });
  });
  it.each([{ from: "2030-02-30" }, { from: "2030-01-31", to: "2030-01-01" }, { dateBasis: "paid_date" }, { status: "paid" }, { source: "whatsapp" }, { branchId: "1" }, { q: "x".repeat(121) }, { unknown: "1" }, { limit: "0" }, { limit: "101" }])("rejects invalid reservation report filters: %j", query => {
    expect(reservationReportQuerySchema.safeParse(query).success).toBe(false);
  });
  it("does not paginate the haircut report", () => {
    expect(haircutReportQuerySchema.safeParse({ limit: "20" }).success).toBe(false);
  });
});

describe("performance report contracts", () => {
  it("reuse the report filters for barber and branch reports", () => {
    expect(employeeReportQuerySchema.parse({ from: "2030-01-01", to: "2030-01-31", branchId: id })).toEqual({ dateBasis: "visit_date", q: "", from: "2030-01-01", to: "2030-01-31", branchId: id });
    expect(branchReportQuerySchema.safeParse({ from: "2030-01-31", to: "2030-01-01" }).success).toBe(false);
    expect(branchReportQuerySchema.safeParse({ limit: "20" }).success).toBe(false);
  });
  it("keeps money as exact three-decimal strings", () => {
    const money = { count: 1, total: "1234567890123456789012345.125" };
    expect(reportMoneySchema.safeParse(money).success).toBe(true);
    for (const total of ["1.5", "1.1250", "01.000", "-1.000"]) expect(reportMoneySchema.safeParse({ count: 1, total }).success).toBe(false);
  });
});
