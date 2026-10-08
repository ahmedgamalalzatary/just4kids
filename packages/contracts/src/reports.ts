import { z } from "zod";
import { eligibilityQuerySchema } from "./availability.js";
import { bookingListQuerySchema, bookingResponseSchema, visitStatusSchema } from "./bookings.js";

// visit_date is the reservation's Kuwait visit day; created_date is the Kuwait day the reservation was made.
export const reportDateBasisSchema = z.enum(["visit_date", "created_date"]);
const filters = {
  dateBasis: reportDateBasisSchema.default("visit_date"),
  from: eligibilityQuerySchema.shape.date.optional(), to: eligibilityQuerySchema.shape.date.optional(),
  branchId: z.uuid().optional(), employeeId: z.uuid().optional(), clientId: z.uuid().optional(),
  status: visitStatusSchema.optional(), source: z.enum(["manual", "ai"]).optional(),
  q: z.string().trim().max(120).default(""),
};
const orderedRange = (value: { from?: string | undefined; to?: string | undefined }, context: z.RefinementCtx) => {
  if (value.from && value.to && value.from > value.to) context.addIssue({ code: "custom", message: "The report range must not end before it starts" });
};
export const haircutReportQuerySchema = z.strictObject(filters).superRefine(orderedRange);
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
  bookings: z.array(bookingResponseSchema.extend({ editCount: total, correctionCount: total })),
  total, limit: z.number().int(), offset: z.number().int(),
});
const quantities = z.strictObject({ adult: total, child: total });
// reserved covers every matching reservation; the other measures split it by current visit status, independently of payment.
const haircutMeasures = { bookings: total, reserved: quantities, completed: quantities, open: quantities, cancelled: quantities, noShow: quantities };
export const haircutReportResponseSchema = z.strictObject({
  dateBasis: reportDateBasisSchema, timeZone: z.literal("Asia/Kuwait"),
  totals: z.strictObject(haircutMeasures),
  byDate: z.array(z.strictObject({ date: eligibilityQuerySchema.shape.date, ...haircutMeasures })),
  byBranch: z.array(z.strictObject({ branchId: z.uuid(), branchName: z.string(), ...haircutMeasures })),
  byEmployee: z.array(z.strictObject({ employeeId: z.uuid(), displayName: z.string(), branchId: z.uuid(), branchName: z.string(), ...haircutMeasures })),
});
export type ReportDateBasis = z.infer<typeof reportDateBasisSchema>;
export type HaircutReportQuery = z.infer<typeof haircutReportQuerySchema>;
export type ReservationReportQuery = z.infer<typeof reservationReportQuerySchema>;
export type ReservationReportResponse = z.infer<typeof reservationReportResponseSchema>;
export type HaircutReportResponse = z.infer<typeof haircutReportResponseSchema>;
