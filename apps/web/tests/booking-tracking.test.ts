import { describe, expect, it } from "vitest";
import type { BookingTrackingResponse } from "@just4kids/contracts";
import * as timeline from "@/lib/booking-timeline";
import { emptyReportFilters, withTrackingPeriod } from "@/lib/reports";

const actor = { id: null, name: "المدير", role: "admin" as const };
const at = "2026-10-13T09:00:00.000Z";
describe("tracking report grouping", () => {
  it("keeps each booking and its ordered events together and labels all sources in Arabic", () => {
    expect(timeline.trackingGroups).toBeDefined();
    const data = { bookings: [
      { booking: { id: "booking-a" }, events: [
        { type: "visit", at, actor, event: { id: "created", fromStatus: null, toStatus: "booked", reason: null } },
        { type: "message", at, actor, message: { id: "sent", kind: "sent_to_barber" } },
        { type: "visit", at, actor: { ...actor, name: "أحمد", role: "employee" }, event: { id: "arrived", fromStatus: "booked", toStatus: "arrived", reason: "وصل" } },
        { type: "visit", at, actor, event: { id: "corrected", fromStatus: "arrived", toStatus: "completed", correction: true, reason: "تصحيح" } },
        { type: "payment", at, actor, payment: { id: "paid", kind: "recorded", method: "knet", amount: "5.000", reason: null } },
        { type: "payment", at, actor, payment: { id: "undo", kind: "voided", method: "knet", amount: "5.000", reason: "خطأ" } },
      ] },
      { booking: { id: "booking-b" }, events: [] },
    ] } as unknown as BookingTrackingResponse;
    const groups = timeline.trackingGroups(data);
    expect(groups.map(group => group.booking.id)).toEqual(["booking-a", "booking-b"]);
    expect(groups[0]!.events.map(event => event.title)).toEqual([
      "أُنشئ الحجز: محجوز", "أُرسل للحلاق", "محجوز ← وصل الحلاق", "تصحيح: وصل الحلاق ← مكتمل", "تسجيل دفع كامل: 5.000 د.ك (كي نت)", "إلغاء قيد دفع خاطئ: 5.000 د.ك (كي نت)",
    ]);
    expect(groups[0]!.events[2]).toMatchObject({ actor: "أحمد", role: "حلاق", reason: "وصل", at });
    expect(groups[0]!.events[5]!.reason).toBe("خطأ");
    expect(groups[1]!.events).toEqual([]);
    expect(timeline.trackingGroups({ ...data, bookings: [] })).toEqual([]);
  });
  it("reuses reservation revision details including notes, counts and the reason", () => {
    expect(timeline.trackingGroups).toBeDefined();
    const before = { date: "2026-10-13", startTime: "10:00", endTime: "11:00", employee: { id: "a", displayName: "أحمد" }, address: { area: "حولي", block: "1", street: "1", houseNumber: "1" }, adultCount: 1, childCount: 2, specialChildCount: 0, notes: null, invoice: { total: "5.000" } };
    const data = { bookings: [{ booking: { id: "a" }, events: [{ type: "revision", at, actor, revision: { id: "r", before, after: { ...before, notes: "جرس الباب", specialChildCount: 1 }, reason: "تصحيح العدد" } }] }] } as unknown as BookingTrackingResponse;
    expect(timeline.trackingGroups(data)[0]!.events[0]).toMatchObject({
      title: "تعديل الحجز", reason: "تصحيح العدد", actor: "المدير", role: "مدير",
      details: ["العدد: من 1 بالغ و2 طفل (0 احتياج خاص) إلى 1 بالغ و2 طفل (1 احتياج خاص)", "الملاحظات: من «لا شيء» إلى «جرس الباب»"],
    });
  });
});

describe("tracking report period", () => {
  const now = new Date("2026-10-13T09:00:00.000Z");
  it("falls back to the current Kuwait week only when no period is chosen", () => {
    expect(withTrackingPeriod(emptyReportFilters, now)).toMatchObject({ from: "2026-10-10", to: "2026-10-16" });
    expect(withTrackingPeriod({ ...emptyReportFilters, from: "2026-09-01" }, now)).toMatchObject({ from: "2026-09-01", to: "" });
    expect(withTrackingPeriod({ ...emptyReportFilters, to: "2026-09-30" }, now)).toMatchObject({ from: "", to: "2026-09-30" });
  });
});
