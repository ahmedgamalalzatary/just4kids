import { describe, expect, it } from "vitest";
import { formatDate, formatDuration, formatTime, kuwaitInstant, kuwaitNow, windowMinutes } from "@/lib/kuwait-time";

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

describe("formatDuration", () => {
  it("uses the Arabic counted noun for minutes", () => {
    expect(formatDuration(1)).toBe("دقيقة");
    expect(formatDuration(2)).toBe("دقيقتان");
    expect(formatDuration(5)).toBe("5 دقائق");
    expect(formatDuration(10)).toBe("10 دقائق");
    expect(formatDuration(20)).toBe("20 دقيقة");
  });

  it("uses the Arabic counted noun for hours, including report totals", () => {
    expect(formatDuration(60)).toBe("ساعة");
    expect(formatDuration(120)).toBe("ساعتان");
    expect(formatDuration(240)).toBe("4 ساعات");
    expect(formatDuration(600)).toBe("10 ساعات");
    expect(formatDuration(735)).toBe("12 ساعة و15 دقيقة");
    expect(formatDuration(2400)).toBe("40 ساعة");
    expect(formatDuration(103 * 60 + 3)).toBe("103 ساعات و3 دقائق");
    expect(formatDuration(90)).toBe("ساعة و30 دقيقة");
  });
});
