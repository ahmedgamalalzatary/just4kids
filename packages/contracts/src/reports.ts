import { z } from "zod";
import { eligibilityQuerySchema } from "./availability.js";
import { bookingListQuerySchema, bookingMessageResponseSchema, bookingResponseObjectSchema, bookingRevisionResponseSchema, visitEventResponseSchema, visitStatusSchema } from "./bookings.js";
import { phoneSchema } from "./auth.js";

// visit_date is the reservation's Kuwait visit day; created_date is the Kuwait day the reservation was made.
export const reportDateBasisSchema = z.enum(["visit_date", "created_date"]);
const filters = {
  dateBasis: reportDateBasisSchema.default("visit_date"),
  from: eligibilityQuerySchema.shape.date.optional(), to: eligibilityQuerySchema.shape.date.optional(),
  employeeId: z.uuid().optional(), clientId: z.uuid().optional(),
  status: visitStatusSchema.optional(), source: z.enum(["manual", "ai"]).optional(),
  q: z.string().trim().max(120).default(""),
};
const orderedRange = (value: { from?: string | undefined; to?: string | undefined }, context: z.RefinementCtx) => {
  if (value.from && value.to && value.from > value.to) context.addIssue({ code: "custom", message: "The report range must not end before it starts" });
};
export const haircutReportQuerySchema = z.strictObject(filters).superRefine(orderedRange);
// The tracking report reads every event of every matching booking, so its period is bounded.
export const TRACKING_MAX_DAYS = 31;
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const bookingTrackingQuerySchema = z.strictObject({
  from: filters.from, to: filters.to, employeeId: filters.employeeId, clientId: filters.clientId,
}).superRefine(orderedRange).superRefine((value, context) => {
  if (value.from && value.to && value.to > addDays(value.from, TRACKING_MAX_DAYS - 1)) context.addIssue({ code: "custom", message: `The tracking period must not exceed ${TRACKING_MAX_DAYS} days` });
});
export type BookingTrackingQuery = z.infer<typeof bookingTrackingQuerySchema>;
/** The Saturday-to-Friday Kuwait week (UTC+3, no daylight saving) containing `now`. */
export function currentKuwaitWeek(now: Date = new Date()): { from: string; to: string } {
  const day = new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  const from = addDays(day, -((new Date(`${day}T00:00:00.000Z`).getUTCDay() + 1) % 7));
  return { from, to: addDays(from, 6) };
}
/** The tracking report's period: the chosen one, 7 days from (or up to) a lone bound, or the current Kuwait week. */
export function trackingPeriod(query: { from?: string | undefined; to?: string | undefined }, now: Date = new Date()): { from: string; to: string } {
  if (query.from && query.to) return { from: query.from, to: query.to };
  if (query.from) return { from: query.from, to: addDays(query.from, 6) };
  if (query.to) return { from: addDays(query.to, -6), to: query.to };
  return currentKuwaitWeek(now);
}
const trackingMeta = {
  at: z.iso.datetime(),
  actor: z.strictObject({ id: z.uuid().nullable(), name: z.string(), role: visitEventResponseSchema.shape.actorType }),
};
export const bookingTrackingEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...trackingMeta, type: z.literal("visit"), event: visitEventResponseSchema }),
  z.strictObject({ ...trackingMeta, type: z.literal("message"), message: bookingMessageResponseSchema }),
  z.strictObject({ ...trackingMeta, type: z.literal("revision"), revision: bookingRevisionResponseSchema }),
]);
export const bookingTrackingResponseSchema = z.strictObject({
  dateBasis: z.literal("visit_date"), timeZone: z.literal("Asia/Kuwait"),
  bookings: z.array(z.strictObject({ booking: bookingResponseObjectSchema, events: z.array(bookingTrackingEventSchema) })),
});
export type BookingTrackingEvent = z.infer<typeof bookingTrackingEventSchema>;
export type BookingTrackingResponse = z.infer<typeof bookingTrackingResponseSchema>;
export const reservationReportQuerySchema = z.strictObject({ ...filters, limit: bookingListQuerySchema.shape.limit, offset: bookingListQuerySchema.shape.offset }).superRefine(orderedRange);

const total = z.number().int().min(0);
const statusCounts = z.strictObject({ booked: total, arrived: total, completed: total, cancelled: total, no_show: total });
export const reservationReportResponseSchema = z.strictObject({
  dateBasis: reportDateBasisSchema, timeZone: z.literal("Asia/Kuwait"),
  summary: z.strictObject({
    bookings: total, statuses: statusCounts, sources: z.strictObject({ manual: total, ai: total }),
    // Edits are administrator reservation revisions; corrections are administrator visit-status corrections.
    editedBookings: total, edits: total, correctedBookings: total, corrections: total,
  }),
  bookings: z.array(bookingResponseObjectSchema.extend({ editCount: total, correctionCount: total })),
  total, limit: z.number().int(), offset: z.number().int(),
});
const quantities = z.strictObject({ adult: total, child: total, special: total });
// reserved covers every matching reservation; the other measures split it by current visit status, independently of payment.
const haircutMeasures = { bookings: total, reserved: quantities, completed: quantities, open: quantities, cancelled: quantities, noShow: quantities };
export const haircutReportResponseSchema = z.strictObject({
  dateBasis: reportDateBasisSchema, timeZone: z.literal("Asia/Kuwait"),
  totals: z.strictObject(haircutMeasures),
  byDate: z.array(z.strictObject({ date: eligibilityQuerySchema.shape.date, ...haircutMeasures })),
  byEmployee: z.array(z.strictObject({ employeeId: z.uuid(), displayName: z.string(), ...haircutMeasures })),
});
export type ReportDateBasis = z.infer<typeof reportDateBasisSchema>;
export type HaircutReportQuery = z.infer<typeof haircutReportQuerySchema>;
export type ReservationReportQuery = z.infer<typeof reservationReportQuerySchema>;
export type ReservationReportResponse = z.infer<typeof reservationReportResponseSchema>;
export type HaircutReportResponse = z.infer<typeof haircutReportResponseSchema>;

// The Phase 10 barber report reuses the same filters and date basis.
export const employeeReportQuerySchema = haircutReportQuerySchema;
export const reportMoneySchema = z.strictObject({ count: total, total: z.string().regex(/^(0|[1-9][0-9]*)\.[0-9]{3}$/) });
// Collected money: the overall total plus how it splits across the accepted payment methods.
export const reportCashSchema = reportMoneySchema.extend({
  byMethod: z.strictObject({ cash: reportMoneySchema, link: reportMoneySchema, knet: reportMoneySchema }),
});
const work = z.strictObject({
  ...haircutMeasures, completedVisits: total,
  // Booked, arrived, and completed windows, including travel; cancelled and no-show visits release their window.
  reservedMinutes: total,
});
const performance = {
  work,
};
export const employeeReportResponseSchema = z.strictObject({
  dateBasis: reportDateBasisSchema, timeZone: z.literal("Asia/Kuwait"),
  employees: z.array(z.strictObject({
    employeeId: z.uuid(), displayName: z.string(), enabled: z.boolean(),
    // Scheduled working minutes from weekly hours and dated exceptions for each day from `from` to `to`; null without a visit-date range.
    availableMinutes: total.nullable(), ...performance,
    // The administrator's daily collections follow only the period and barber; null when another filter is applied.
    cash: reportCashSchema.nullable(),
  })),
});
export type EmployeeReportResponse = z.infer<typeof employeeReportResponseSchema>;

// Phase 11 client history reuses the same filters and date basis.
export const clientReportQuerySchema = haircutReportQuerySchema;
export const clientReportResponseSchema = z.strictObject({
  dateBasis: reportDateBasisSchema, timeZone: z.literal("Asia/Kuwait"),
  clients: z.array(z.strictObject({
    clientId: z.uuid(), phone: phoneSchema,
    // completedVisits is the client's completed-visit count, so values above one are repeat visits.
    ...performance,
  })),
});
export type ClientReportQuery = z.infer<typeof clientReportQuerySchema>;
export type ClientReportResponse = z.infer<typeof clientReportResponseSchema>;
