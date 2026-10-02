import { describe, expect, it } from "vitest";
import { paymentRecordSchema, paymentUndoSchema, cashReconciliationSchema, bookingEditSchema } from "../src/index.js";

describe("full cash payment contracts", () => {
  it("requires a version and prevents callers from choosing payment amount or method", () => {
    expect(paymentRecordSchema).toBeDefined();
    expect(paymentRecordSchema.parse({ expectedVersion: 1 })).toEqual({ expectedVersion: 1 });
    for (const body of [{}, { expectedVersion: -1 }, { expectedVersion: 1, amount: "1.000" }, { expectedVersion: 1, method: "card" }]) expect(paymentRecordSchema.safeParse(body).success).toBe(false);
  });
  it("requires the exact payment and a nonempty reason when undoing", () => {
    expect(paymentUndoSchema).toBeDefined();
    const body = { expectedVersion: 2, paymentId: "11111111-1111-4111-8111-111111111111", reason: "  mistaken entry  " };
    expect(paymentUndoSchema.parse(body).reason).toBe("mistaken entry");
    expect(paymentUndoSchema.safeParse({ ...body, reason: " " }).success).toBe(false);
    expect(paymentUndoSchema.safeParse({ ...body, paymentId: "invalid" }).success).toBe(false);
  });
  it("accepts explicit exact cash/refund reconciliation within a reservation edit", () => {
    expect(cashReconciliationSchema).toBeDefined();
    const reconciliation = { action: "extra_cash", amount: "5.125", reason: "extra cash received" };
    expect(bookingEditSchema.safeParse({ expectedVersion: 3, adultCount: 2, reconciliation }).success).toBe(true);
    expect(cashReconciliationSchema.safeParse({ ...reconciliation, action: "refund" }).success).toBe(true);
    for (const patch of [{ amount: "-1.000" }, { amount: "0.000" }, { amount: "5.12" }, { amount: 5.125 }, { reason: " " }]) expect(cashReconciliationSchema.safeParse({ ...reconciliation, ...patch }).success).toBe(false);
    expect(bookingEditSchema.safeParse({ expectedVersion: 3, reconciliation }).success).toBe(false);
  });
});
