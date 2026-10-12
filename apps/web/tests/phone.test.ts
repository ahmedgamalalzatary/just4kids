import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("adds +965 to a bare eight-digit Kuwaiti number", () => {
    expect(normalizePhone("51100056")).toBe("+96551100056");
    expect(normalizePhone(" 5110 0056 ")).toBe("+96551100056");
  });

  it("leaves a number that already carries a country code exactly as typed", () => {
    expect(normalizePhone("+96550000000")).toBe("+96550000000");
    expect(normalizePhone("+201234567890")).toBe("+201234567890");
  });

  it("leaves anything that is not a bare eight-digit number as typed", () => {
    expect(normalizePhone("12345")).toBe("12345");
    expect(normalizePhone("")).toBe("");
  });
});
