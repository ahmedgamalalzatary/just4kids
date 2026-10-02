import { z } from "zod";
import { eligibilityQuerySchema } from "./availability.js";
import { addressResponseSchema } from "./clients.js";
import { phoneSchema } from "./auth.js";
import { kwdPriceSchema } from "./organization.js";
import { cashReconciliationSchema } from "./cash.js";

const haircutCount = z.number().int().min(0).max(2147483647);
export const visitStatusSchema = z.enum(["booked", "arrived", "completed", "cancelled", "no_show"]);
const version = z.number().int().min(0).max(2147483647);
const reason = z.string().trim().min(1).max(1000);
export const visitTransitionSchema = z.strictObject({ status: z.enum(["arrived", "completed", "cancelled", "no_show"]), expectedVersion: version, reason: reason.optional() });
export const visitCorrectionSchema = z.strictObject({ status: visitStatusSchema, expectedVersion: version, reason });
export const visitEventResponseSchema = z.strictObject({
  id: z.uuid(), bookingId: z.uuid(), version, fromStatus: visitStatusSchema.nullable(), toStatus: visitStatusSchema,
  actorType: z.enum(["admin", "employee", "client", "system"]), actorAccountId: z.uuid().nullable(), actorClientId: z.uuid().nullable(),
  reason: reason.nullable(), correction: z.boolean(), previousInvoiceStatus: z.enum(["issued", "cancelled"]).nullable(), invoiceStatus: z.enum(["issued", "cancelled"]), occurredAt: z.iso.datetime(),
});
export type VisitStatus = z.infer<typeof visitStatusSchema>;
export type VisitTransition = z.infer<typeof visitTransitionSchema>;
export type VisitCorrection = z.infer<typeof visitCorrectionSchema>;
export const bookingCreateSchema = z.strictObject({
  clientId: z.uuid(), addressId: z.uuid(), employeeId: z.uuid(),
  date: eligibilityQuerySchema.shape.date, startTime: eligibilityQuerySchema.shape.startTime, endTime: eligibilityQuerySchema.shape.endTime,
  adultCount: haircutCount, childCount: haircutCount,
}).superRefine((value, context) => {
  if (!eligibilityQuerySchema.safeParse({ date: value.date, startTime: value.startTime, endTime: value.endTime }).success) context.addIssue({ code: "custom", message: "Invalid booking window" });
  if (value.adultCount === 0 && value.childCount === 0) context.addIssue({ code: "custom", message: "At least one haircut is required" });
});
export const bookingAddressSnapshotSchema = addressResponseSchema.omit({ id: true, clientId: true, createdAt: true, updatedAt: true });
export const bookingClientSnapshotSchema = z.strictObject({ name: z.string().min(1).max(120), phone: phoneSchema });
export const bookingEmployeeSnapshotSchema = z.strictObject({ id: z.uuid(), displayName: z.string().min(1).max(120), branchId: z.uuid(), branchName: z.string().min(1).max(120), branchLocation: z.string().min(1).max(500) });
const amount = z.string().regex(/^(0|[1-9][0-9]{0,20})\.[0-9]{3}$/);
export const invoiceResponseSchema = z.strictObject({
  id: z.uuid(), bookingId: z.uuid(), reference: z.string().min(1).max(40), issuedAt: z.iso.datetime(), currency: z.literal("KWD"),
  status: z.enum(["issued", "cancelled"]), paymentStatus: z.enum(["unpaid", "paid"]),
  adultCount: haircutCount, childCount: haircutCount, adultUnitPrice: kwdPriceSchema, childUnitPrice: kwdPriceSchema,
  adultAmount: amount, childAmount: amount, total: amount,
  client: bookingClientSnapshotSchema, address: bookingAddressSnapshotSchema, employee: bookingEmployeeSnapshotSchema,
});
export const bookingResponseSchema = z.strictObject({
  id: z.uuid(), reference: z.string().min(1).max(40), clientId: z.uuid(), addressId: z.uuid(), employeeId: z.uuid(), branchId: z.uuid(),
  date: eligibilityQuerySchema.shape.date, startTime: eligibilityQuerySchema.shape.startTime, endTime: eligibilityQuerySchema.shape.endTime,
  timeZone: z.literal("Asia/Kuwait"), adultCount: haircutCount, childCount: haircutCount,
  source: z.enum(["manual", "ai"]), visitStatus: visitStatusSchema, visitVersion: version, createdAt: z.iso.datetime(),
  client: bookingClientSnapshotSchema, address: bookingAddressSnapshotSchema, employee: bookingEmployeeSnapshotSchema, invoice: invoiceResponseSchema,
});
export const bookingListQuerySchema = z.strictObject({
  limit: z.string().regex(/^[0-9]+$/).default("20").transform(Number).pipe(z.number().int().min(1).max(100)),
  offset: z.string().regex(/^[0-9]+$/).default("0").transform(Number).pipe(z.number().int().min(0).max(1000000)),
});
export type BookingCreate = z.infer<typeof bookingCreateSchema>;
export const bookingEditSchema = z.strictObject({
  expectedVersion: version, reason: reason.optional(), addressId: z.uuid().optional(), employeeId: z.uuid().optional(),
  date: eligibilityQuerySchema.shape.date.optional(), startTime: eligibilityQuerySchema.shape.startTime.optional(), endTime: eligibilityQuerySchema.shape.endTime.optional(),
  adultCount: haircutCount.optional(), childCount: haircutCount.optional(),
  reconciliation: cashReconciliationSchema.optional(),
}).superRefine((value, context) => {
  if (!Object.entries(value).some(([key, field]) => !["expectedVersion", "reason", "reconciliation"].includes(key) && field !== undefined)) context.addIssue({ code: "custom", message: "At least one edit is required" });
  if (value.adultCount === 0 && value.childCount === 0) context.addIssue({ code: "custom", message: "At least one haircut is required" });
});
export const bookingRevisionResponseSchema = z.strictObject({
  id: z.uuid(), bookingId: z.uuid(), version, actorAccountId: z.uuid(), reason: reason.nullable(), occurredAt: z.iso.datetime(),
  before: bookingResponseSchema, after: bookingResponseSchema,
});
export type BookingEdit = z.infer<typeof bookingEditSchema>;
export type BookingResponse = z.infer<typeof bookingResponseSchema>;
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
export type BookingAddressSnapshot = z.infer<typeof bookingAddressSnapshotSchema>;
export type BookingClientSnapshot = z.infer<typeof bookingClientSnapshotSchema>;
export type BookingEmployeeSnapshot = z.infer<typeof bookingEmployeeSnapshotSchema>;
