import { z } from "zod";
import { cashAmountSchema } from "./cash.js";
import { reportMoneySchema } from "./reports.js";

const isoDate = z.iso.date();
const count = z.number().int().min(0).max(2147483647);
const orderedRange = (value: { from?: string | undefined; to?: string | undefined }, context: z.RefinementCtx) => {
  if (value.from && value.to && value.from > value.to) context.addIssue({ code: "custom", message: "The report range must not end before it starts" });
};

export const salonEntryCreateSchema = z.strictObject({
  branchId: z.uuid(),
  date: isoDate,
  childCount: count.default(0),
  cash: cashAmountSchema.default("0.000"),
  link: cashAmountSchema.default("0.000"),
  knet: cashAmountSchema.default("0.000"),
});
export const salonEntryUpdateSchema = z.strictObject({
  date: isoDate.optional(),
  childCount: count.optional(),
  cash: cashAmountSchema.optional(),
  link: cashAmountSchema.optional(),
  knet: cashAmountSchema.optional(),
}).refine(value => Object.keys(value).length > 0);

export const salonEntrySnapshotSchema = z.strictObject({
  branchId: z.uuid(), date: isoDate, childCount: count,
  cash: cashAmountSchema, link: cashAmountSchema, knet: cashAmountSchema, total: cashAmountSchema,
});
export const salonEntryResponseSchema = salonEntrySnapshotSchema.extend({
  id: z.uuid(), branchName: z.string().min(1).max(120), enteredBy: z.uuid(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const salonEntryEventSchema = z.strictObject({
  id: z.uuid(), entryId: z.uuid(), actorAccountId: z.uuid(), occurredAt: z.iso.datetime(),
  before: salonEntrySnapshotSchema.nullable(), after: salonEntrySnapshotSchema,
});

export const salonQuerySchema = z.strictObject({
  from: isoDate.optional(), to: isoDate.optional(), branchId: z.uuid().optional(),
}).superRefine(orderedRange);
export const salonReportResponseSchema = z.strictObject({
  timeZone: z.literal("Asia/Kuwait"),
  from: isoDate.nullable(), to: isoDate.nullable(),
  entries: z.array(salonEntryResponseSchema),
  totals: z.strictObject({ childCount: count, cash: cashAmountSchema, link: cashAmountSchema, knet: cashAmountSchema, total: cashAmountSchema }),
});

// Collected money per method plus the share of the combined total; the salon row is the shop's in-shop entry.
export const comprehensiveReportQuerySchema = salonQuerySchema;
const collected = z.strictObject({ cash: reportMoneySchema, link: reportMoneySchema, knet: reportMoneySchema, collected: reportMoneySchema });
const share = z.number().min(0).max(100);
export const comprehensiveReportResponseSchema = z.strictObject({
  timeZone: z.literal("Asia/Kuwait"),
  barbers: z.array(z.strictObject({ employeeId: z.uuid(), displayName: z.string(), enabled: z.boolean(), ...collected.shape, share })),
  salon: z.strictObject({ ...collected.shape, share }),
  totals: collected,
});

export type SalonEntryCreate = z.infer<typeof salonEntryCreateSchema>;
export type SalonEntryUpdate = z.infer<typeof salonEntryUpdateSchema>;
export type SalonQuery = z.infer<typeof salonQuerySchema>;
export type SalonEntryResponse = z.infer<typeof salonEntryResponseSchema>;
export type SalonEntryEvent = z.infer<typeof salonEntryEventSchema>;
export type SalonReportResponse = z.infer<typeof salonReportResponseSchema>;
export type ComprehensiveReportResponse = z.infer<typeof comprehensiveReportResponseSchema>;
