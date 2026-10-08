import { describe, expect, it } from "vitest";
import { canEditBooking, canRecordPayment, visitActions } from "@/lib/visit-rules";

const booking = (visitStatus: "booked" | "arrived" | "completed" | "cancelled" | "no_show", paymentStatus: "paid" | "unpaid" = "unpaid") => ({
  date: "2026-10-10", startTime: "10:00", endTime: "11:00", visitStatus, invoice: { paymentStatus },
});
const at = (kuwaitTime: string) => new Date(`2026-10-10T${kuwaitTime}:00.000+03:00`);

describe("visit rules", () => {
  it("offers arrival only after the reserved start and no-show only after the end", () => {
    expect(visitActions(booking("booked"), at("09:59"))).toEqual([
      { status: "arrived", allowed: false }, { status: "no_show", allowed: false }, { status: "cancelled", allowed: true },
    ]);
    expect(visitActions(booking("booked"), at("10:00")).find(action => action.status === "arrived")?.allowed).toBe(true);
    expect(visitActions(booking("booked"), at("11:00")).find(action => action.status === "no_show")?.allowed).toBe(true);
  });

  it("offers completion from arrived and nothing from final states", () => {
    expect(visitActions(booking("arrived"), at("10:30")).map(action => action.status)).toEqual(["completed", "no_show", "cancelled"]);
    expect(visitActions(booking("completed"), at("12:00"))).toEqual([]);
    expect(visitActions(booking("cancelled"), at("12:00"))).toEqual([]);
    expect(visitActions(booking("no_show"), at("12:00"))).toEqual([]);
  });

  it("allows edits only for booked visits that have not started", () => {
    expect(canEditBooking(booking("booked"), at("09:59"))).toBe(true);
    expect(canEditBooking(booking("booked"), at("10:00"))).toBe(false);
    expect(canEditBooking(booking("arrived"), at("09:00"))).toBe(false);
  });

  it("allows cash only for unpaid arrived or completed visits", () => {
    expect(canRecordPayment(booking("arrived"))).toBe(true);
    expect(canRecordPayment(booking("completed"))).toBe(true);
    expect(canRecordPayment(booking("completed", "paid"))).toBe(false);
    expect(canRecordPayment(booking("booked"))).toBe(false);
    expect(canRecordPayment(booking("cancelled"))).toBe(false);
  });
});
