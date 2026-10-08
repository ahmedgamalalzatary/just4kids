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

// Phase 10 barber and branch reports reuse the same filters and date basis.
export const employeeReportQuerySchema = haircutReportQuerySchema;
export const branchReportQuerySchema = haircutReportQuerySchema;
export const reportMoneySchema = z.strictObject({ count: total, total: z.string().regex(/^(0|[1-9][0-9]*)\.[0-9]{3}$/) });
const work = z.strictObject({
  ...haircutMeasures, completedVisits: total,
  // Booked, arrived, and completed windows, including travel; cancelled and no-show visits release their window.
  reservedMinutes: total,
});
const performance = {
  work,
  // Issued and cancelled invoice values stay separate from cash; outstanding is issued and unpaid. Revisions update one invoice, so they are never counted twice.
  invoices: z.strictObject({ issued: reportMoneySchema, cancelled: reportMoneySchema, outstanding: reportMoneySchema }),
  // Active cash receipts at their current reconciled amount, including cash retained on cancelled visits; voided receipts are excluded.
  cash: reportMoneySchema,
};
export const employeeReportResponseSchema = z.strictObject({
  dateBasis: reportDateBasisSchema, timeZone: z.literal("Asia/Kuwait"),
  employees: z.array(z.strictObject({
    employeeId: z.uuid(), displayName: z.string(), enabled: z.boolean(), branchId: z.uuid(), branchName: z.string(),
    // Scheduled working minutes from weekly hours and dated exceptions for each day from `from` to `to`; null without a visit-date range.
    availableMinutes: total.nullable(), ...performance,
  })),
});
export const branchReportResponseSchema = z.strictObject({
  dateBasis: reportDateBasisSchema, timeZone: z.literal("Asia/Kuwait"),
  branches: z.array(z.strictObject({
    branchId: z.uuid(), branchName: z.string(), ...performance,
    employees: z.array(z.strictObject({ employeeId: z.uuid(), displayName: z.string(), ...performance })),
  })),
});
export type EmployeeReportResponse = z.infer<typeof employeeReportResponseSchema>;
export type BranchReportResponse = z.infer<typeof branchReportResponseSchema>;
