import { describe, expect, it } from "vitest";
import { formatKwd, fromFils, toFils } from "@/lib/money";

describe("money", () => {
  it("converts exact KWD strings to fils and back", () => {
    expect(toFils("12.5")).toBe(12500n);
    expect(toFils("0.125")).toBe(125n);
    expect(toFils("7")).toBe(7000n);
    expect(fromFils(12500n)).toBe("12.500");
    expect(fromFils(5n)).toBe("0.005");
    expect(fromFils(-2000n)).toBe("-2.000");
  });

  it("keeps large totals exact", () => {
    expect(fromFils(toFils("999999999.999") * 3n)).toBe("2999999999.997");
  });

  it("formats with three decimals and the dinar symbol", () => {
    expect(formatKwd("8.5")).toBe("8.500 KWD");
  });
});
