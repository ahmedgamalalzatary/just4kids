import { describe, expect, it } from "vitest";
import { eligibilityQuerySchema, eligibilityResponseSchema, scheduleExceptionSchema, scheduleResponseSchema, weeklyScheduleSchema } from "../src/index.js";

describe("availability contracts", () => {
  it("accepts disjoint weekly shifts and a one-day closure", () => {
    expect(weeklyScheduleSchema.parse({ days: [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "13:00" }, { startTime: "15:00", endTime: "19:00" }] }] })).toEqual({
      days: [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "13:00" }, { startTime: "15:00", endTime: "19:00" }] }],
    });
    expect(scheduleExceptionSchema.parse({ intervals: [] })).toEqual({ intervals: [] });
  });

  it("rejects overlapping shifts and duplicate weekdays", () => {
    expect(weeklyScheduleSchema.safeParse({ days: [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "13:00" }, { startTime: "12:59", endTime: "17:00" }] }] }).success).toBe(false);
    expect(weeklyScheduleSchema.safeParse({ days: [{ dayOfWeek: 1, intervals: [] }, { dayOfWeek: 1, intervals: [] }] }).success).toBe(false);
  });

  it("enforces inclusive 20-minute and 4-hour booking windows", () => {
    for (const [startTime, endTime] of [["09:00", "09:20"], ["09:00", "13:00"]]) {
      expect(eligibilityQuerySchema.safeParse({ date: "2026-10-05", startTime, endTime }).success).toBe(true);
    }
    for (const [startTime, endTime] of [["09:00", "09:19"], ["09:00", "13:01"], ["10:00", "10:00"], ["10:00", "09:00"]]) {
      expect(eligibilityQuerySchema.safeParse({ date: "2026-10-05", startTime, endTime }).success).toBe(false);
    }
    expect(eligibilityQuerySchema.safeParse({ date: "2026-02-30", startTime: "09:00", endTime: "10:00" }).success).toBe(false);
  });

  it("exposes strict schedule and eligible-barber responses to the frontend", () => {
    const id = "3a4f26b1-b76a-47c0-976c-0d4618d9236b";
    expect(scheduleResponseSchema.safeParse({ employeeId: id, days: [], exceptions: [{ date: "2026-10-05", intervals: [] }] }).success).toBe(true);
    expect(eligibilityResponseSchema.safeParse({ date: "2026-10-05", startTime: "09:00", endTime: "09:20", timeZone: "Asia/Kuwait", barbers: [{ id, displayName: "سالم", branch: { id, name: "حولي", location: "شارع 1" } }] }).success).toBe(true);
    expect(eligibilityResponseSchema.safeParse({ date: "2026-10-05", startTime: "09:00", endTime: "09:20", timeZone: "Asia/Kuwait", barbers: [{ id, displayName: "سالم", branch: { id, name: "حولي", location: "شارع 1" }, passwordHash: "leak" }] }).success).toBe(false);
  });
});
