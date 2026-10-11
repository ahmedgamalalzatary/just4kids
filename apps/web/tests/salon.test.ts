import { describe, expect, it } from "vitest";
import { salonTotal, shareText } from "@/lib/salon";

describe("salon helpers", () => {
  it("sums the three collection methods in exact fils", () => {
    expect(salonTotal("5.000", "1.000", "2.000")).toBe("8.000");
    expect(salonTotal("0.000", "0.001", "0.000")).toBe("0.001");
    expect(salonTotal("0.000", "0.000", "0.000")).toBe("0.000");
    expect(salonTotal("1.999", "0.001", "0.000")).toBe("2.000");
  });
  it("formats a share as a one-decimal percentage", () => {
    expect(shareText(42.1)).toBe("42.1%");
    expect(shareText(0)).toBe("0.0%");
    expect(shareText(57.9)).toBe("57.9%");
  });
});
