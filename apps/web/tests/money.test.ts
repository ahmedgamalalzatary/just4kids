import { describe, expect, it } from "vitest";
import { formatKwd, fromFils, invoiceTotal, toFils, typedPrice } from "@/lib/money";

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

  it("computes the invoice total from the typed cash and link", () => {
    expect(invoiceTotal({ amountCash: "5.250", amountLink: "3.125" })).toBe("8.375");
    expect(invoiceTotal({ amountCash: "0.000", amountLink: "0.001" })).toBe("0.001");
  });

  it("reads a blank typed amount as zero but needs at least one amount", () => {
    expect(typedPrice({ amountCash: "5", amountLink: "" })).toEqual({ amountCash: "5", amountLink: "0" });
    expect(typedPrice({ amountCash: " ", amountLink: "2.5" })).toEqual({ amountCash: "0", amountLink: "2.5" });
    expect(typedPrice({ amountCash: "5.250", amountLink: "3.125" })).toEqual({ amountCash: "5.250", amountLink: "3.125" });
    expect(typedPrice({ amountCash: "", amountLink: "" })).toBeNull();
    expect(typedPrice({ amountCash: "5.1234", amountLink: "" })).toBeNull();
    expect(typedPrice({ amountCash: "05", amountLink: "1" })).toBeNull();
  });
});
