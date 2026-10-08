import { describe, expect, it } from "vitest";
import { formatDate, formatTime, kuwaitInstant, kuwaitNow, windowMinutes } from "@/lib/kuwait-time";

describe("Kuwait time", () => {
  it("reads the current Kuwait date and time regardless of the browser zone", () => {
    expect(kuwaitNow(new Date("2026-10-08T21:30:00.000Z"))).toEqual({ date: "2026-10-09", time: "00:30" });
    expect(kuwaitNow(new Date("2026-10-08T05:07:00.000Z"))).toEqual({ date: "2026-10-08", time: "08:07" });
  });

  it("turns a Kuwait date and time into the exact instant", () => {
    expect(kuwaitInstant("2026-10-09", "00:30").toISOString()).toBe("2026-10-08T21:30:00.000Z");
  });

  it("measures window length in minutes", () => {
    expect(windowMinutes("09:00", "09:20")).toBe(20);
    expect(windowMinutes("09:00", "13:00")).toBe(240);
  });

  it("formats dates and times in Arabic with Western digits", () => {
    expect(formatTime("16:30")).toBe("4:30 م");
    expect(formatTime("09:05")).toBe("9:05 ص");
    const date = formatDate("2026-10-11");
    expect(date).toContain("11");
    expect(date).toContain("2026");
    expect(date).toContain("الأحد");
    expect(date).not.toMatch(/[٠-٩]/);
  });
});
