import { describe, expect, it } from "vitest";
import { isWindowAvailable } from "../src/modules/availability/availability.service.js";

const query = { date: "2026-10-05", startTime: "10:00", endTime: "10:20" };
const monday = [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "13:00" }] }];

describe("shared availability decision", () => {
  it("accepts a full window inside weekly hours and adjacent bookings", () => {
    expect(isWindowAvailable(query, monday, undefined, [{ date: query.date, startTime: "09:20", endTime: "10:00", status: "booked" }, { date: query.date, startTime: "10:20", endTime: "11:00", status: "arrived" }])).toBe(true);
  });

  it("rejects a window overlapping booked, arrived, or completed visits", () => {
    for (const status of ["booked", "arrived", "completed"] as const) {
      expect(isWindowAvailable(query, monday, undefined, [{ date: query.date, startTime: "10:19", endTime: "11:00", status }])).toBe(false);
    }
  });

  it("releases cancelled and no-show visits", () => {
    expect(isWindowAvailable(query, monday, undefined, [{ date: query.date, startTime: "10:00", endTime: "11:00", status: "cancelled" }, { date: query.date, startTime: "10:00", endTime: "11:00", status: "no_show" }])).toBe(true);
  });

  it("uses date exceptions instead of weekly hours, including a full-day closure", () => {
    expect(isWindowAvailable(query, monday, [], [])).toBe(false);
    expect(isWindowAvailable(query, monday, [{ startTime: "11:00", endTime: "12:00" }], [])).toBe(false);
    expect(isWindowAvailable(query, [], [{ startTime: "10:00", endTime: "11:00" }], [])).toBe(true);
  });

  it("treats touching work shifts as continuous but a gap as unavailable", () => {
    const touching = [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "10:10" }, { startTime: "10:10", endTime: "13:00" }] }];
    expect(isWindowAvailable(query, touching, undefined, [])).toBe(true);
    const gap = [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "10:09" }, { startTime: "10:10", endTime: "13:00" }] }];
    expect(isWindowAvailable(query, gap, undefined, [])).toBe(false);
  });
});
