import { z } from "zod";
import { bookingResponseSchema } from "./bookings.js";
import { cashAmountSchema } from "./cash.js";

const version = z.number().int().min(0).max(2147483647);
export const paymentMethodSchema = z.enum(["cash", "link", "knet"]);
export const paymentRecordSchema = z.strictObject({ expectedVersion: version, method: paymentMethodSchema });
export const paymentUndoSchema = z.strictObject({ expectedVersion: version, paymentId: z.uuid(), reason: z.string().trim().min(1).max(1000) });
export const paymentResponseSchema = z.strictObject({
  id: z.uuid(), bookingId: z.uuid(), invoiceId: z.uuid(), originalAmount: cashAmountSchema, amount: cashAmountSchema,
  status: z.enum(["active", "voided"]), method: paymentMethodSchema, recordedBy: z.uuid(), recordedAt: z.iso.datetime(), currency: z.literal("KWD"), bookingAtReceipt: bookingResponseSchema,
});
export const paymentEventResponseSchema = z.strictObject({
  id: z.uuid(), bookingId: z.uuid(), paymentId: z.uuid(), version, revisionId: z.uuid().nullable(),
  kind: z.enum(["recorded", "voided", "extra_cash", "refund"]), method: paymentMethodSchema, amount: cashAmountSchema,
  actorAccountId: z.uuid(), reason: z.string().trim().min(1).max(1000).nullable(), occurredAt: z.iso.datetime(),
  before: paymentResponseSchema.nullable(), after: paymentResponseSchema,
});

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
