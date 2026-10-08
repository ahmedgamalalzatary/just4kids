import { describe, expect, it } from "vitest";
import { editedPricing, reconciliationFor, windowProblem } from "@/lib/booking";

const now = new Date("2026-10-10T07:00:00.000Z"); // 10:00 in Kuwait

describe("booking window", () => {
  it("accepts 20 minutes up to 4 hours that start in the future", () => {
    expect(windowProblem({ date: "2026-10-10", startTime: "10:01", endTime: "10:21" }, now)).toBeNull();
    expect(windowProblem({ date: "2026-10-11", startTime: "08:00", endTime: "12:00" }, now)).toBeNull();
  });

  it("explains each problem", () => {
    expect(windowProblem({ date: "", startTime: "10:00", endTime: "11:00" }, now)).toBe("اختر التاريخ");
    expect(windowProblem({ date: "2026-10-11", startTime: "11:00", endTime: "10:00" }, now)).toBe("يجب أن ينتهي الموعد بعد بدايته في اليوم نفسه");
    expect(windowProblem({ date: "2026-10-11", startTime: "10:00", endTime: "10:19" }, now)).toBe("أقل مدة للموعد 20 دقيقة");
    expect(windowProblem({ date: "2026-10-11", startTime: "08:00", endTime: "12:01" }, now)).toBe("أطول مدة للموعد 4 ساعات");
    expect(windowProblem({ date: "2026-10-10", startTime: "10:00", endTime: "11:00" }, now)).toBe("يجب أن يبدأ الموعد بعد الوقت الحالي بتوقيت الكويت");
  });
});

describe("edited booking price", () => {
  const booking = { branchId: "branch-a", invoice: { adultUnitPrice: "5.000", childUnitPrice: "3.000", total: "8.000" } };
  const branches = [{ id: "branch-a", adultPrice: "9.000", childPrice: "9.000" }, { id: "branch-b", adultPrice: "6.000", childPrice: "4.000" }];

  it("keeps agreed prices within the recorded branch even if branch prices changed", () => {
    expect(editedPricing(booking, { adultCount: 2, childCount: 1, branchId: "branch-a" }, branches)).toEqual({ adultUnitPrice: "5.000", childUnitPrice: "3.000", total: "13.000" });
  });

  it("uses the destination branch's current prices after moving to another branch", () => {
    expect(editedPricing(booking, { adultCount: 1, childCount: 1, branchId: "branch-b" }, branches)).toEqual({ adultUnitPrice: "6.000", childUnitPrice: "4.000", total: "10.000" });
  });

  it("returns null when the destination branch prices are not loaded", () => {
    expect(editedPricing(booking, { adultCount: 1, childCount: 1, branchId: "branch-c" }, branches)).toBeNull();
  });

  it("describes the cash difference a paid edit needs", () => {
    expect(reconciliationFor("8.000", "10.000")).toEqual({ action: "extra_cash", amount: "2.000" });
    expect(reconciliationFor("8.000", "6.000")).toEqual({ action: "refund", amount: "2.000" });
    expect(reconciliationFor("8.000", "8.000")).toBeNull();
  });
});
