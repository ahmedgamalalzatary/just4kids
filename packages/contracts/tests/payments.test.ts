import { describe, expect, it } from "vitest";
import { paymentRecordSchema, paymentUndoSchema, cashReconciliationSchema, bookingEditSchema, bookingResponseSchema, bookingRevisionResponseSchema, paymentMethodSchema, paymentResponseSchema, paymentEventResponseSchema } from "../src/index.js";

const client = { name: "مريم", phone: "+96555550101" };
const address = { area: "حولي", block: "3", street: "شارع 5", houseNumber: "12", buildingName: null, avenue: null, gate: null, blueNumber: null, floor: null, apartment: null, instructions: null, mapsUrl: null, latitude: null, longitude: null };
const employee = { id: "44444444-4444-4444-8444-444444444444", displayName: "سالم", branchId: "55555555-5555-4555-8555-555555555555", branchName: "الفرع", branchLocation: "حولي" };
const booking = {
  id: "11111111-1111-4111-8111-111111111111", reference: "J4K-ABCDEFGHIJKL", clientId: "22222222-2222-4222-8222-222222222222",
  addressId: "33333333-3333-4333-8333-333333333333", employeeId: "44444444-4444-4444-8444-444444444444", branchId: "55555555-5555-4555-8555-555555555555",
  date: "2099-03-10", startTime: "09:00", endTime: "09:20",
  adultCount: 1, childCount: 0, specialChildCount: 0, source: "manual", visitStatus: "booked", visitVersion: 1,
  timeZone: "Asia/Kuwait", createdAt: "2026-10-11T00:00:00.000Z", client, address, employee,
  invoice: { id: "77777777-7777-4777-8777-777777777777", bookingId: "11111111-1111-4111-8111-111111111111", reference: "J4K-ABCDEFGHIJKL", issuedAt: "2026-10-11T00:00:00.000Z", status: "issued", paymentStatus: "unpaid", currency: "KWD", adultCount: 1, childCount: 0, specialChildCount: 0, adultUnitPrice: "5.000", childUnitPrice: "3.000", adultAmount: "5.000", childAmount: "0.000", total: "5.000", client, address, employee },
};
const payment = {
  id: "88888888-8888-4888-8888-888888888888", bookingId: booking.id, invoiceId: booking.invoice.id, originalAmount: "5.000", amount: "5.000",
  status: "active", method: "cash", recordedBy: booking.employeeId, recordedAt: "2026-10-11T00:00:00.000Z", currency: "KWD", bookingAtReceipt: booking,
};

describe("payment method contracts", () => {
  it("reads legacy address snapshots in bookings, invoices, revisions, and receipts", () => {
    const legacyAddress = { area: "حولي", block: "3", street: "شارع 5", houseNumber: "12", buildingName: null, floor: null, apartment: null, instructions: null, mapsUrl: null, latitude: null, longitude: null };
    const legacyBooking = { ...booking, address: legacyAddress, invoice: { ...booking.invoice, address: legacyAddress } };
    const normalizedAddress = { ...legacyAddress, avenue: null, gate: null, blueNumber: null };
    const parsed = bookingResponseSchema.parse(legacyBooking);
    expect(parsed.address).toEqual(normalizedAddress);
    expect(parsed.invoice.address).toEqual(normalizedAddress);
    const revision = bookingRevisionResponseSchema.parse({ id: payment.id, bookingId: booking.id, version: 1, actorAccountId: booking.employeeId, reason: null, occurredAt: payment.recordedAt, before: legacyBooking, after: legacyBooking });
    expect(revision.before.address).toEqual(normalizedAddress);
    expect(revision.after.invoice.address).toEqual(normalizedAddress);
    expect(paymentResponseSchema.parse({ ...payment, bookingAtReceipt: legacyBooking }).bookingAtReceipt.address).toEqual(normalizedAddress);
  });
  it("requires a version and an explicit payment method", () => {
    expect(paymentMethodSchema.parse("link")).toBe("link");
    expect(paymentRecordSchema.parse({ expectedVersion: 1, method: "link" })).toEqual({ expectedVersion: 1, method: "link" });
    for (const method of ["cash", "link", "knet"]) expect(paymentRecordSchema.safeParse({ expectedVersion: 1, method }).success).toBe(true);
    for (const body of [{}, { expectedVersion: 1 }, { expectedVersion: -1, method: "cash" }, { expectedVersion: 1, method: "card" }, { expectedVersion: 1, method: "cash", amount: "1.000" }]) {
      expect(paymentRecordSchema.safeParse(body).success).toBe(false);
    }
  });
  it("carries the method on receipts and their history events", () => {
    expect(paymentResponseSchema.parse(payment).method).toBe("cash");
    expect(paymentResponseSchema.safeParse({ ...payment, method: "card" }).success).toBe(false);
    const event = {
      id: "99999999-9999-4999-8999-999999999999", bookingId: booking.id, paymentId: payment.id, version: 1, revisionId: null,
      kind: "recorded", amount: "5.000", method: "knet", actorAccountId: booking.employeeId, reason: null, occurredAt: "2026-10-11T00:00:00.000Z", before: null, after: payment,
    };
    expect(paymentEventResponseSchema.parse(event).method).toBe("knet");
    expect(paymentEventResponseSchema.safeParse({ ...event, method: "card" }).success).toBe(false);
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
