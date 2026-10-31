import { describe, expect, it } from "vitest";
import { buildEndOptions, buildLockEndOptions, buildSlots, cancelReasonText, currentOrNext, daySummary, shiftDate, timeWords, whatsAppLink, workingIntervals } from "../src/lib/day";

// 2099-01-05 is a Monday (dayOfWeek 1).
const date = "2099-01-05";
const schedule = { days: [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "11:00" }] }], exceptions: [] };
const twoShifts = { days: [{ dayOfWeek: 1, intervals: [{ startTime: "10:00", endTime: "14:00" }, { startTime: "16:00", endTime: "22:00" }] }], exceptions: [] };
const visit = (startTime: string, endTime: string, visitStatus: "booked" | "arrived" | "completed" | "cancelled" | "no_show" = "booked") => ({ startTime, endTime, visitStatus });
const early = new Date("2099-01-01T00:00:00+03:00");

describe("buildSlots", () => {
  it("marks every half-hour inside a multi-hour lock as locked and points at the same block", () => {
    const blocks = [{ id: "manual", date, startTime: "09:30", endTime: "11:00", reason: null }];
    const slots = buildSlots({ date, schedule: { ...schedule, blocks }, bookings: [], now: early });
    expect(slots.filter(slot => slot.block === blocks[0]).map(slot => [slot.startTime, slot.state, slot.reason])).toEqual([
      ["09:30", "locked", "manual"], ["10:00", "locked", "manual"], ["10:30", "locked", "manual"],
    ]);
    expect(slots.find(slot => slot.startTime === "09:00")).toMatchObject({ state: "free" });
  });

  it("shows manual locks with their reason and frees the half-hours around them", () => {
    const blocks = [{ id: "manual", date, startTime: "10:00", endTime: "10:30", reason: "موعد Special" }];
    const slots = buildSlots({ date, schedule: { ...schedule, blocks }, bookings: [], now: early });
    expect(slots.find(slot => slot.startTime === "10:00")).toMatchObject({ state: "locked", reason: "manual", block: blocks[0] });
    expect(slots.find(slot => slot.startTime === "09:30")).toMatchObject({ state: "free" });
    expect(slots.find(slot => slot.startTime === "09:00")).toMatchObject({ state: "free" });
    expect(slots.find(slot => slot.startTime === "10:30")).toMatchObject({ state: "free" });
    const otherDate = buildSlots({ date, schedule: { ...schedule, blocks: [{ ...blocks[0]!, date: "2099-01-06" }] }, bookings: [], now: early });
    expect(otherDate.find(slot => slot.startTime === "10:00")).toMatchObject({ state: "free" });
    const past = buildSlots({ date, schedule: { ...schedule, blocks }, bookings: [], now: new Date(`${date}T10:01:00+03:00`) });
    expect(past.find(slot => slot.startTime === "10:00")).toMatchObject({ state: "past" });
  });
  it.each(["08:15", "08:45"])("keeps on-the-hour pills when another weekday or exception starts at %s", startTime => {
    for (const offGridSchedule of [
      { ...schedule, days: [...schedule.days, { dayOfWeek: 2, intervals: [{ startTime, endTime: "11:00" }] }] },
      { ...schedule, exceptions: [{ date: "2099-01-06", intervals: [{ startTime, endTime: "11:00" }] }] },
    ]) {
      const slots = buildSlots({ date, schedule: offGridSchedule, bookings: [], now: early });
      expect(slots[0]!.startTime).toBe(startTime === "08:15" ? "08:00" : "08:30");
      expect(slots.filter(slot => slot.state === "free").map(slot => slot.startTime)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    }
  });
  it("builds 30-minute pills over the whole day (09:00–23:30) and marks overlapping blocking visits as booked", () => {
    const slots = buildSlots({ date, schedule, bookings: [visit("09:30", "10:00"), visit("10:00", "10:30", "cancelled")], now: early });
    expect(slots).toHaveLength(30);
    expect([slots[0]!.startTime, slots.at(-1)!.startTime]).toEqual(["09:00", "23:30"]);
    expect(slots.slice(0, 5).map(slot => [slot.startTime, slot.state])).toEqual([["09:00", "free"], ["09:30", "booked"], ["10:00", "free"], ["10:30", "free"], ["11:00", "locked"]]);
    expect(slots[1]!.booking).toMatchObject({ startTime: "09:30" });
    expect(slots[0]!.endTime).toBe("09:30");
  });

  it("marks the lunch gap and the hours outside the shifts as locked breaks", () => {
    const slots = buildSlots({ date, schedule: twoShifts, bookings: [], now: early });
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
    const weekdayOff = buildSlots({ date: "2099-01-06", schedule, bookings: [], now: early });
    expect(weekdayOff).toHaveLength(30);
    expect(weekdayOff.every(slot => slot.state === "locked" && slot.reason === "day-off")).toBe(true);
    const closingException = buildSlots({ date, schedule: { ...schedule, exceptions: [{ date, intervals: [] }] }, bookings: [], now: early });
    expect(closingException.every(slot => slot.state === "locked" && slot.reason === "day-off")).toBe(true);
  });

  it("uses the dated exception instead of the weekly hours for the free pills", () => {
    const slots = buildSlots({ date, schedule: { ...schedule, exceptions: [{ date, intervals: [{ startTime: "14:00", endTime: "15:00" }] }] }, bookings: [], now: early });
    expect(slots.filter(slot => slot.state === "free").map(slot => slot.startTime)).toEqual(["14:00", "14:30"]);
    expect(slots.find(slot => slot.startTime === "09:00")).toMatchObject({ state: "locked", reason: "break" });
  });

  it("keeps every free half-hour selectable regardless of how long the visit will be", () => {
    const slots = buildSlots({ date, schedule, bookings: [visit("10:00", "10:30")], now: early });
    expect(slots.slice(0, 4).map(slot => [slot.startTime, slot.state, slot.endTime])).toEqual([["09:00", "free", "09:30"], ["09:30", "free", "10:00"], ["10:00", "booked", "10:30"], ["10:30", "free", "11:00"]]);
  });

  it("marks starts at or before the current Kuwait time as past", () => {
    const slots = buildSlots({ date, schedule, bookings: [], now: new Date(`${date}T09:30:00+03:00`) });
    expect(slots.slice(0, 4).map(slot => slot.state)).toEqual(["past", "past", "free", "free"]);
    expect(slots.find(slot => slot.startTime === "11:00")).toMatchObject({ state: "locked" });
  });
});

describe("buildEndOptions", () => {
  const wide = { days: [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "15:00" }] }], exceptions: [] };

  it("lists whole-hour ends from one hour after the start up to the shift end", () => {
    expect(buildEndOptions({ date, schedule, bookings: [], startTime: "09:00", now: early })).toEqual(["10:00", "11:00"]);
    expect(buildEndOptions({ date, schedule: wide, bookings: [], startTime: "09:00", now: early })).toEqual(["10:00", "11:00", "12:00", "13:00"]);
  });

  it("stops before the next booking or manual lock", () => {
    const blocks = [{ id: "manual", date, startTime: "10:00", endTime: "10:30", reason: null }];
    const options = buildEndOptions({ date, schedule: { ...wide, blocks }, bookings: [visit("10:30", "11:00")], startTime: "09:00", now: early });
    expect(options).toEqual(["10:00"]);
    const afterBooking = buildEndOptions({ date, schedule: wide, bookings: [visit("10:30", "11:00")], startTime: "11:00", now: early });
    expect(afterBooking).toEqual(["12:00", "13:00", "14:00", "15:00"]);
  });

  it("offers no end for a start on the half hour", () => {
    expect(buildEndOptions({ date, schedule: wide, bookings: [], startTime: "09:30", now: early })).toEqual([]);
  });

  it("returns no ends for a start outside the working hours", () => {
    expect(buildEndOptions({ date, schedule, bookings: [], startTime: "12:00", now: early })).toEqual([]);
  });
});

describe("buildLockEndOptions", () => {
  const wide = { days: [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "15:00" }] }], exceptions: [] };

  it("lists half-hour ends up to the shift end without the visit-length cap", () => {
    expect(buildLockEndOptions({ date, schedule: wide, bookings: [], startTime: "09:00", now: early })).toEqual([
      "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00",
    ]);
  });

  it("stops before the next booking or manual lock and refuses a start outside the shift", () => {
    const blocks = [{ id: "manual", date, startTime: "10:00", endTime: "10:30", reason: null }];
    expect(buildLockEndOptions({ date, schedule: { ...wide, blocks }, bookings: [visit("11:00", "11:30")], startTime: "09:00", now: early })).toEqual(["09:30", "10:00"]);
    expect(buildLockEndOptions({ date, schedule, bookings: [], startTime: "11:00", now: early })).toEqual([]);
    expect(buildLockEndOptions({ date, schedule: wide, bookings: [], startTime: "09:00", now: new Date(`${date}T12:00:00+03:00`) })).toEqual([]);
  });
});

describe("workingIntervals", () => {
  it("gives no weekly intervals for an inactive day unless a date exception opens it", () => {
    const inactive = { ...schedule, days: [{ dayOfWeek: 1, active: false, intervals: [{ startTime: "09:00", endTime: "11:00" }] }] };
    expect(workingIntervals(inactive, date)).toEqual([]);
    expect(workingIntervals({ ...inactive, exceptions: [{ date, intervals: [{ startTime: "14:00", endTime: "15:00" }] }] }, date)).toEqual([{ startTime: "14:00", endTime: "15:00" }]);
  });
  it("marks an inactive weekday as a full day of day-off locks", () => {
    const inactive = { ...schedule, days: [{ dayOfWeek: 1, active: false, intervals: [{ startTime: "09:00", endTime: "11:00" }] }] };
    const slots = buildSlots({ date, schedule: inactive, bookings: [], now: early });
    expect(slots.every(slot => slot.state === "locked" && slot.reason === "day-off")).toBe(true);
  });
});

describe("timeWords", () => {
  it("writes a Kuwait time in English words with the right day part", () => {
    expect(timeWords("09:00")).toBe("nine in the morning");
    expect(timeWords("12:30")).toBe("half past twelve at noon");
    expect(timeWords("16:30")).toBe("half past four in the afternoon");
    expect(timeWords("19:00")).toBe("seven in the evening");
    expect(timeWords("22:00")).toBe("ten at night");
  });
});

describe("whatsAppLink", () => {
  it("opens a chat with the barber's number prefilled with the visit details", () => {
    const link = whatsAppLink("+96555551234", {
      reference: "J4K-1", date, startTime: "09:00", endTime: "09:30", adultCount: 1, childCount: 2, specialChildCount: 1, notes: null,
      client: { phone: "+96599990000" }, address: { area: "حولي", block: "3", street: "5", houseNumber: "12", buildingName: null, avenue: "3", gate: "12", blueNumber: "5", floor: null, apartment: null, mapsUrl: "https://maps.app.goo.gl/x" },
    });
    const url = new URL(link);
    expect(`${url.origin}${url.pathname}`).toBe("https://wa.me/96555551234");
    const text = url.searchParams.get("text")!;
    for (const part of ["J4K-1", "+96599990000", "Avenue 3", "Gate 12", "Blue number 5", "https://maps.app.goo.gl/x", "2 children", "1 with special needs", "1 adult", "9:00 AM"]) expect(text).toContain(part);
    expect(text).not.toContain("Notes:");
  });
  it("adds the booking notes to the WhatsApp text when present", () => {
    const link = whatsAppLink("+96555551234", {
      reference: "J4K-2", date, startTime: "09:00", endTime: "09:30", adultCount: 1, childCount: 0, specialChildCount: 0, notes: "اتصل قبل الوصول",
      client: { phone: "+96599990000" }, address: { area: "حولي", block: "3", street: "5", houseNumber: "12", buildingName: null, floor: null, apartment: null, mapsUrl: null },
    });
    expect(new URL(link).searchParams.get("text")).toContain("Notes: اتصل قبل الوصول");
  });
});

describe("cancelReasonText", () => {
  it("returns the fixed reason, and requires a written reason for «Other reason»", () => {
    expect(cancelReasonText("not_home", "")).toBe("Client not at home");
    expect(cancelReasonText("other", "  ")).toBeNull();
    expect(cancelReasonText("other", " نسي Appointment ")).toBe("Other reason: نسي Appointment");
    expect(cancelReasonText("", "")).toBeNull();
  });
});

describe("day summaries", () => {
  const booking = (startTime: string, endTime: string, visitStatus: "booked" | "arrived" | "completed" | "cancelled" | "no_show") =>
    ({ startTime, endTime, visitStatus });
  const day = [booking("09:00", "09:30", "completed"), booking("10:00", "10:30", "arrived"), booking("11:00", "11:30", "booked"), booking("12:00", "12:30", "cancelled"), booking("13:00", "13:30", "completed")];

  it("counts open visits and visits that still hold the barber's time", () => {
    expect(daySummary(day)).toEqual({ open: 2, active: 4 });
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
