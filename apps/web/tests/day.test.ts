import { describe, expect, it } from "vitest";
import { buildSlots, cancelReasonText, currentOrNext, daySummary, shiftDate, timeWords, whatsAppLink } from "../src/lib/day";

// 2099-01-05 is a Monday (dayOfWeek 1).
const date = "2099-01-05";
const schedule = { days: [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "11:00" }] }], exceptions: [] };
const twoShifts = { days: [{ dayOfWeek: 1, intervals: [{ startTime: "10:00", endTime: "14:00" }, { startTime: "16:00", endTime: "22:00" }] }], exceptions: [] };
const visit = (startTime: string, endTime: string, visitStatus: "booked" | "arrived" | "completed" | "cancelled" | "no_show" = "booked") => ({ startTime, endTime, visitStatus });
const early = new Date("2099-01-01T00:00:00+03:00");

describe("buildSlots", () => {
  it("builds 30-minute pills over the whole day (09:00–23:30) and marks overlapping blocking visits as booked", () => {
    const slots = buildSlots({ date, schedule, bookings: [visit("09:30", "10:00"), visit("10:00", "10:30", "cancelled")], duration: 30, now: early });
    expect(slots).toHaveLength(30);
    expect([slots[0]!.startTime, slots.at(-1)!.startTime]).toEqual(["09:00", "23:30"]);
    expect(slots.slice(0, 5).map(slot => [slot.startTime, slot.state])).toEqual([["09:00", "free"], ["09:30", "booked"], ["10:00", "free"], ["10:30", "free"], ["11:00", "locked"]]);
    expect(slots[1]!.booking).toMatchObject({ startTime: "09:30" });
    expect(slots[0]!.endTime).toBe("09:30");
  });

  it("marks the lunch gap and the hours outside the shifts as locked breaks", () => {
    const slots = buildSlots({ date, schedule: twoShifts, bookings: [], duration: 30, now: early });
    const state = (startTime: string) => slots.find(slot => slot.startTime === startTime);
    expect(state("09:00")).toMatchObject({ state: "locked", reason: "break" });
    expect(state("10:00")).toMatchObject({ state: "free" });
    expect(state("13:30")).toMatchObject({ state: "free" });
    expect(state("14:00")).toMatchObject({ state: "locked", reason: "break" });
    expect(state("15:30")).toMatchObject({ state: "locked", reason: "break" });
    expect(state("16:00")).toMatchObject({ state: "free" });
    expect(state("21:30")).toMatchObject({ state: "free" });
    expect(state("22:00")).toMatchObject({ state: "locked", reason: "break" });
  });

  it("marks a closed weekday and a closing exception as a full day of day-off locks", () => {
    const weekdayOff = buildSlots({ date: "2099-01-06", schedule, bookings: [], duration: 30, now: early });
    expect(weekdayOff).toHaveLength(30);
    expect(weekdayOff.every(slot => slot.state === "locked" && slot.reason === "day-off")).toBe(true);
    const closingException = buildSlots({ date, schedule: { ...schedule, exceptions: [{ date, intervals: [] }] }, bookings: [], duration: 30, now: early });
    expect(closingException.every(slot => slot.state === "locked" && slot.reason === "day-off")).toBe(true);
  });

  it("uses the dated exception instead of the weekly hours for the free pills", () => {
    const slots = buildSlots({ date, schedule: { ...schedule, exceptions: [{ date, intervals: [{ startTime: "14:00", endTime: "15:00" }] }] }, bookings: [], duration: 30, now: early });
    expect(slots.filter(slot => slot.state === "free").map(slot => slot.startTime)).toEqual(["14:00", "14:30"]);
    expect(slots.find(slot => slot.startTime === "09:00")).toMatchObject({ state: "locked", reason: "break" });
  });

  it("blocks starts whose chosen duration would run into a booking or past closing time", () => {
    const slots = buildSlots({ date, schedule, bookings: [visit("10:00", "10:30")], duration: 60, now: early });
    expect(slots.slice(0, 4).map(slot => [slot.startTime, slot.state, slot.endTime])).toEqual([["09:00", "free", "10:00"], ["09:30", "blocked", "10:30"], ["10:00", "booked", "11:00"], ["10:30", "blocked", "11:30"]]);
  });

  it("marks starts at or before the current Kuwait time as past", () => {
    const slots = buildSlots({ date, schedule, bookings: [], duration: 30, now: new Date(`${date}T09:30:00+03:00`) });
    expect(slots.slice(0, 4).map(slot => slot.state)).toEqual(["past", "past", "free", "free"]);
    expect(slots.find(slot => slot.startTime === "11:00")).toMatchObject({ state: "locked" });
  });
});

describe("timeWords", () => {
  it("writes a Kuwait time in Arabic words with the right day part", () => {
    expect(timeWords("09:00")).toBe("التاسعة صباحاً");
    expect(timeWords("12:30")).toBe("الثانية عشرة والنصف ظهراً");
    expect(timeWords("16:30")).toBe("الرابعة والنصف عصراً");
    expect(timeWords("19:00")).toBe("السابعة مساءً");
    expect(timeWords("22:00")).toBe("العاشرة ليلاً");
  });
});

describe("whatsAppLink", () => {
  it("opens a chat with the barber's number prefilled with the visit details", () => {
    const link = whatsAppLink("+96555551234", {
      reference: "J4K-1", date, startTime: "09:00", endTime: "09:30", adultCount: 1, childCount: 2, specialChildCount: 1,
      client: { name: "مريم", phone: "+96599990000" }, address: { area: "حولي", block: "3", street: "5", houseNumber: "12", buildingName: null, avenue: "3", gate: "12", blueNumber: "5", floor: null, apartment: null, instructions: "الباب الأزرق", mapsUrl: "https://maps.app.goo.gl/x", latitude: null, longitude: null },
    });
    const url = new URL(link);
    expect(`${url.origin}${url.pathname}`).toBe("https://wa.me/96555551234");
    const text = url.searchParams.get("text")!;
    for (const part of ["J4K-1", "مريم", "+96599990000", "حولي", "جادة 3", "بوابة 12", "الرقم الأزرق 5", "الباب الأزرق", "https://maps.app.goo.gl/x", "2 طفل", "1 احتياجات خاصة", "1 بالغ", "9:00 ص"]) expect(text).toContain(part);
  });
});

describe("cancelReasonText", () => {
  it("returns the fixed reason, and requires a written reason for «سبب آخر»", () => {
    expect(cancelReasonText("not_home", "")).toBe("العميل غير متواجد");
    expect(cancelReasonText("other", "  ")).toBeNull();
    expect(cancelReasonText("other", " نسي الموعد ")).toBe("سبب آخر: نسي الموعد");
    expect(cancelReasonText("", "")).toBeNull();
  });
});

describe("day summaries", () => {
  const booking = (startTime: string, endTime: string, visitStatus: "booked" | "arrived" | "completed" | "cancelled" | "no_show", paymentStatus: "paid" | "unpaid", total: string) =>
    ({ startTime, endTime, visitStatus, invoice: { paymentStatus, total } });
  const day = [booking("09:00", "09:30", "completed", "paid", "5.125"), booking("10:00", "10:30", "arrived", "unpaid", "3.000"), booking("11:00", "11:30", "booked", "unpaid", "3.000"), booking("12:00", "12:30", "cancelled", "unpaid", "3.000"), booking("13:00", "13:30", "completed", "paid", "1.000")];

  it("counts open visits and sums collected invoices exactly", () => {
    expect(daySummary(day)).toEqual({ open: 2, active: 4, collected: "6.125" });
  });

  it("finds the current visit, otherwise the next open one", () => {
    expect(currentOrNext(day, "10:10")).toMatchObject({ kind: "current", booking: { startTime: "10:00" } });
    expect(currentOrNext(day, "10:40")).toMatchObject({ kind: "next", booking: { startTime: "11:00" } });
    expect(currentOrNext(day, "11:40")).toBeNull();
  });
});

describe("shiftDate", () => {
  it("moves a calendar date by whole days across month and year ends", () => {
    expect(shiftDate("2099-01-31", 1)).toBe("2099-02-01");
    expect(shiftDate("2099-01-01", -1)).toBe("2098-12-31");
  });
});
