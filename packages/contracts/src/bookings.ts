import { z } from "zod";
import { eligibilityQuerySchema } from "./availability.js";
import { addressResponseSchema } from "./clients.js";
import { phoneSchema } from "./auth.js";
import { kwdPriceSchema } from "./organization.js";

const haircutCount = z.number().int().min(0).max(2147483647);
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
  source: z.enum(["manual", "ai"]), visitStatus: z.enum(["booked", "arrived", "completed", "cancelled", "no_show"]), createdAt: z.iso.datetime(),
  client: bookingClientSnapshotSchema, address: bookingAddressSnapshotSchema, employee: bookingEmployeeSnapshotSchema, invoice: invoiceResponseSchema,
});
export const bookingListQuerySchema = z.strictObject({
  limit: z.string().regex(/^[0-9]+$/).default("20").transform(Number).pipe(z.number().int().min(1).max(100)),
  offset: z.string().regex(/^[0-9]+$/).default("0").transform(Number).pipe(z.number().int().min(0).max(1000000)),
});
export type BookingCreate = z.infer<typeof bookingCreateSchema>;
export type BookingResponse = z.infer<typeof bookingResponseSchema>;
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
export type BookingAddressSnapshot = z.infer<typeof bookingAddressSnapshotSchema>;
export type BookingClientSnapshot = z.infer<typeof bookingClientSnapshotSchema>;
export type BookingEmployeeSnapshot = z.infer<typeof bookingEmployeeSnapshotSchema>;
