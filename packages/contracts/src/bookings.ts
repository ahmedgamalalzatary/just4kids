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
// Booking notes: optional, trimmed, and stored as null when empty so callers can clear them.
const notes = z.string().trim().max(1000).transform(value => (value.length ? value : null));
export const visitTransitionSchema = z.strictObject({ status: z.enum(["arrived", "completed", "cancelled", "no_show"]), expectedVersion: version, reason: reason.optional() });
export const visitCorrectionSchema = z.strictObject({ status: visitStatusSchema, expectedVersion: version, reason });
export const visitEventResponseSchema = z.strictObject({
  id: z.uuid(), bookingId: z.uuid(), version, fromStatus: visitStatusSchema.nullable(), toStatus: visitStatusSchema,
  actorType: z.enum(["admin", "employee", "client", "system"]), actorAccountId: z.uuid().nullable(), actorClientId: z.uuid().nullable(),
  reason: reason.nullable(), correction: z.boolean(), previousInvoiceStatus: z.enum(["issued", "cancelled"]).nullable(), invoiceStatus: z.enum(["issued", "cancelled"]), occurredAt: z.iso.datetime(),
});
export type VisitStatus = z.infer<typeof visitStatusSchema>;
export const bookingMessageKindSchema = z.enum(["sent_to_barber"]);
export const bookingMessageResponseSchema = z.strictObject({
  id: z.uuid(), bookingId: z.uuid(), kind: bookingMessageKindSchema, actorAccountId: z.uuid(), occurredAt: z.iso.datetime(),
});
export type BookingMessage = z.infer<typeof bookingMessageResponseSchema>;
export type VisitTransition = z.infer<typeof visitTransitionSchema>;
export type VisitCorrection = z.infer<typeof visitCorrectionSchema>;
export const bookingCreateSchema = z.strictObject({
  clientId: z.uuid(), addressId: z.uuid(), employeeId: z.uuid(),
  date: eligibilityQuerySchema.shape.date, startTime: eligibilityQuerySchema.shape.startTime, endTime: eligibilityQuerySchema.shape.endTime,
  adultCount: haircutCount, childCount: haircutCount, specialChildCount: haircutCount.default(0),
  // The administrator types the visit price as cash + link at booking time; there is no branch-derived price.
  amountCash: kwdPriceSchema, amountLink: kwdPriceSchema, notes: notes.optional(),
}).superRefine((value, context) => {
  if (!eligibilityQuerySchema.safeParse({ date: value.date, startTime: value.startTime, endTime: value.endTime }).success) context.addIssue({ code: "custom", message: "Invalid booking window" });
  if (value.adultCount === 0 && value.childCount === 0) context.addIssue({ code: "custom", message: "At least one haircut is required" });
  if (value.specialChildCount > value.childCount) context.addIssue({ code: "custom", path: ["specialChildCount"], message: "Special-needs children cannot exceed the child count" });
});
// Historical JSON snapshots predate these optional address details; current client-address responses stay strict.
export const bookingAddressSnapshotSchema = addressResponseSchema.omit({ id: true, clientId: true, createdAt: true, updatedAt: true }).extend({
  avenue: addressResponseSchema.shape.avenue.default(null),
  gate: addressResponseSchema.shape.gate.default(null),
  blueNumber: addressResponseSchema.shape.blueNumber.default(null),
});
export const bookingClientSnapshotSchema = z.strictObject({ name: z.string().min(1).max(120), phone: phoneSchema });
// Snapshots saved while barbers and bookings had a branch still carry it; bookings no longer have one, so it is dropped on read.
const withoutKeys = (keys: string[]) => (value: unknown) => typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))) : value;
export const bookingEmployeeSnapshotSchema = z.preprocess(withoutKeys(["branchId", "branchName", "branchLocation"]), z.strictObject({ id: z.uuid(), displayName: z.string().min(1).max(120) }));
const amount = z.string().regex(/^(0|[1-9][0-9]{0,20})\.[0-9]{3}$/);
export const invoiceResponseSchema = z.strictObject({
  id: z.uuid(), bookingId: z.uuid(), reference: z.string().min(1).max(40), issuedAt: z.iso.datetime(), currency: z.literal("KWD"),
  status: z.enum(["issued", "cancelled"]), paymentStatus: z.enum(["unpaid", "paid"]),
  adultCount: haircutCount, childCount: haircutCount, specialChildCount: haircutCount.default(0), notes: z.string().max(1000).nullable().default(null),
  amountCash: amount, amountLink: amount, total: amount,
  client: bookingClientSnapshotSchema, address: bookingAddressSnapshotSchema, employee: bookingEmployeeSnapshotSchema,
});
// Snapshots saved before S10 priced the invoice per haircut; migration 0019 moved those totals to cash, so old JSON reads the same way.
const legacyInvoiceKeys = ["adultUnitPrice", "childUnitPrice", "adultAmount", "childAmount"];
const invoiceSnapshotSchema = z.preprocess(value => {
  if (typeof value !== "object" || value === null || "amountCash" in value || !legacyInvoiceKeys.every(key => key in value)) return value;
  const current = Object.fromEntries(Object.entries(value).filter(([key]) => !legacyInvoiceKeys.includes(key)));
  return { ...current, amountCash: current.total, amountLink: "0.000" };
}, invoiceResponseSchema);
export const bookingResponseObjectSchema = z.strictObject({
  id: z.uuid(), reference: z.string().min(1).max(40), clientId: z.uuid(), addressId: z.uuid(), employeeId: z.uuid(),
  date: eligibilityQuerySchema.shape.date, startTime: eligibilityQuerySchema.shape.startTime, endTime: eligibilityQuerySchema.shape.endTime,
  timeZone: z.literal("Asia/Kuwait"), adultCount: haircutCount, childCount: haircutCount, specialChildCount: haircutCount.default(0), notes: z.string().max(1000).nullable().default(null),
  seenByBarberAt: z.iso.datetime().nullable().default(null),
  source: z.enum(["manual", "ai"]), visitStatus: visitStatusSchema, visitVersion: version, createdAt: z.iso.datetime(),
  client: bookingClientSnapshotSchema, address: bookingAddressSnapshotSchema, employee: bookingEmployeeSnapshotSchema, invoice: invoiceSnapshotSchema,
});
export const bookingResponseSchema = z.preprocess(withoutKeys(["branchId"]), bookingResponseObjectSchema);
export const bookingListQuerySchema = z.strictObject({
  limit: z.string().regex(/^[0-9]+$/).default("20").transform(Number).pipe(z.number().int().min(1).max(100)),
  offset: z.string().regex(/^[0-9]+$/).default("0").transform(Number).pipe(z.number().int().min(0).max(1000000)),
  date: eligibilityQuerySchema.shape.date.optional(),
  employeeId: z.uuid().optional(),
});
export type BookingCreate = z.infer<typeof bookingCreateSchema>;
export const bookingEditSchema = z.strictObject({
  expectedVersion: version, reason: reason.optional(), addressId: z.uuid().optional(), employeeId: z.uuid().optional(),
  date: eligibilityQuerySchema.shape.date.optional(), startTime: eligibilityQuerySchema.shape.startTime.optional(), endTime: eligibilityQuerySchema.shape.endTime.optional(),
  adultCount: haircutCount.optional(), childCount: haircutCount.optional(), specialChildCount: haircutCount.optional(), notes: notes.optional(),
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
