import { describe, expect, it } from "vitest";
import { comprehensiveReportResponseSchema, salonEntryCreateSchema, salonEntryEventSchema, salonEntryResponseSchema, salonEntryUpdateSchema, salonQuerySchema, salonReportResponseSchema } from "../src/index.js";

const id = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const snapshot = { branchId, date: "2026-10-11", childCount: 3, cash: "5.000", link: "1.000", knet: "2.000", total: "8.000" };
const entry = { id, branchName: "الفرع الرئيسي", enteredBy: id, createdAt: "2026-10-11T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z", ...snapshot };
const money = (count: number, total: string) => ({ count, total });

describe("salon work contracts", () => {
  it("requires a branch and date, defaulting amounts and kids to zero", () => {
    expect(salonEntryCreateSchema.parse({ branchId, date: "2026-10-11", childCount: 3, cash: "5.000", link: "1.000", knet: "2.000" }))
      .toEqual({ branchId, date: "2026-10-11", childCount: 3, cash: "5.000", link: "1.000", knet: "2.000" });
    expect(salonEntryCreateSchema.parse({ branchId, date: "2026-10-11" })).toMatchObject({ childCount: 0, cash: "0.000", link: "0.000", knet: "0.000" });
    for (const body of [{ date: "2026-10-11" }, { branchId, date: "2026-10-11", cash: "-1.000" }, { branchId, date: "2026-10-11", knet: "1.5" }, { branchId, date: "2026-10-11", total: "5.000" }, { branchId, date: "not-a-date" }]) {
      expect(salonEntryCreateSchema.safeParse(body).success).toBe(false);
    }
  });
  it("edits a subset of an entry but rejects an empty change or a supplied total", () => {
    expect(salonEntryUpdateSchema.safeParse({ childCount: 4 }).success).toBe(true);
    expect(salonEntryUpdateSchema.safeParse({ cash: "1.000", knet: "2.000" }).success).toBe(true);
    expect(salonEntryUpdateSchema.safeParse({}).success).toBe(false);
    expect(salonEntryUpdateSchema.safeParse({ total: "1.000" }).success).toBe(false);
    expect(salonEntryUpdateSchema.safeParse({ branchId }).success).toBe(false);
  });
  it("carries the entry and its before/after history", () => {
    expect(salonEntryResponseSchema.parse(entry)).toMatchObject({ id, childCount: 3, total: "8.000" });
    expect(salonEntryResponseSchema.safeParse({ ...entry, total: "9.000" }).success).toBe(true);
    const event = { id, entryId: id, actorAccountId: id, occurredAt: "2026-10-11T00:00:00.000Z", before: null, after: snapshot };
    expect(salonEntryEventSchema.parse(event).after.total).toBe("8.000");
    expect(salonEntryEventSchema.safeParse({ ...event, after: { ...snapshot, branchName: "x" } }).success).toBe(false);
  });
  it("bounds the salon query range", () => {
    expect(salonQuerySchema.parse({ from: "2026-10-01", to: "2026-10-11" })).toEqual({ from: "2026-10-01", to: "2026-10-11" });
    expect(salonQuerySchema.safeParse({ from: "2026-10-11", to: "2026-10-01" }).success).toBe(false);
    expect(salonReportResponseSchema.parse({ timeZone: "Asia/Kuwait", from: "2026-10-01", to: "2026-10-11", entries: [entry], totals: { childCount: 3, cash: "5.000", link: "1.000", knet: "2.000", total: "8.000" } }).entries).toHaveLength(1);
  });
  it("carries per-method totals and a share on the comprehensive report", () => {
    const barber = { employeeId: id, displayName: "سالم", enabled: true, cash: money(1, "5.000"), link: money(1, "1.000"), knet: money(0, "0.000"), collected: money(2, "6.000"), share: 60 };
    const response = { timeZone: "Asia/Kuwait", barbers: [barber], salon: { cash: money(0, "0.000"), link: money(0, "0.000"), knet: money(1, "2.000"), collected: money(1, "2.000"), share: 40 }, totals: { cash: money(1, "5.000"), link: money(1, "1.000"), knet: money(1, "2.000"), collected: money(3, "8.000") } };
    expect(comprehensiveReportResponseSchema.parse(response).barbers[0]!.share).toBe(60);
    expect(comprehensiveReportResponseSchema.safeParse({ ...response, barbers: [{ ...barber, share: 101 }] }).success).toBe(false);
    expect(comprehensiveReportResponseSchema.safeParse({ ...response, totals: { cash: money(1, "5.000") } }).success).toBe(false);
  });
});
