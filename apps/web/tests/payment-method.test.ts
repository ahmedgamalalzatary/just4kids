import { describe, expect, it } from "vitest";
import { paymentMethodLabels, paymentMethodOptions } from "@/lib/payments";

describe("payment methods", () => {
  it("labels every supported method in Arabic", () => {
    expect(paymentMethodLabels).toEqual({ cash: "Cash", link: "Payment link", knet: "KNET" });
  });
  it("offers the methods in a stable picker order with cash first", () => {
    expect(paymentMethodOptions.map(option => option.value)).toEqual(["cash", "link", "knet"]);
    for (const option of paymentMethodOptions) expect(paymentMethodLabels[option.value]).toBe(option.label);
  });
});
