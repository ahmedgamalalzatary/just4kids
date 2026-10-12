import { z } from "zod";
import { cashAmountSchema } from "./cash.js";

const isoDate = z.iso.date();
const count = z.number().int().min(0).max(2147483647);
const orderedRange = (value: { from?: string | undefined; to?: string | undefined }, context: z.RefinementCtx) => {
  if (value.from && value.to && value.from > value.to) context.addIssue({ code: "custom", message: "The report range must not end before it starts" });
};

// The administrator types one daily collection per barber; the report reads these rows.
export const barberCollectionCreateSchema = z.strictObject({
  employeeId: z.uuid(),
  date: isoDate,
  normalChildren: count.default(0),
  specialChildren: count.default(0),
  cash: cashAmountSchema.default("0.000"),
  link: cashAmountSchema.default("0.000"),
  knet: cashAmountSchema.default("0.000"),
});
export const barberCollectionUpdateSchema = z.strictObject({
  expectedVersion: count,
  date: isoDate.optional(),
  normalChildren: count.optional(),
  specialChildren: count.optional(),
  cash: cashAmountSchema.optional(),
  link: cashAmountSchema.optional(),
  knet: cashAmountSchema.optional(),
}).refine(value => Object.keys(value).some(key => key !== "expectedVersion"));

export const barberCollectionSnapshotSchema = z.strictObject({
  employeeId: z.uuid(), date: isoDate, normalChildren: count, specialChildren: count,
  cash: cashAmountSchema, link: cashAmountSchema, knet: cashAmountSchema, total: cashAmountSchema,
});
export const barberCollectionResponseSchema = barberCollectionSnapshotSchema.extend({
  id: z.uuid(), version: count, displayName: z.string().min(1).max(120), enteredBy: z.uuid(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const barberCollectionEventSchema = z.strictObject({
  id: z.uuid(), entryId: z.uuid(), actorAccountId: z.uuid(), occurredAt: z.iso.datetime(),
  before: barberCollectionSnapshotSchema.nullable(), after: barberCollectionSnapshotSchema,
});

export const barberCollectionQuerySchema = z.strictObject({
  from: isoDate.optional(), to: isoDate.optional(), employeeId: z.uuid().optional(),
}).superRefine(orderedRange);
export const barberCollectionReportResponseSchema = z.strictObject({
  timeZone: z.literal("Asia/Kuwait"),
  from: isoDate.nullable(), to: isoDate.nullable(),
  entries: z.array(barberCollectionResponseSchema),
  totals: z.strictObject({ normalChildren: count, specialChildren: count, cash: cashAmountSchema, link: cashAmountSchema, knet: cashAmountSchema, total: cashAmountSchema }),
});

export type BarberCollectionCreate = z.infer<typeof barberCollectionCreateSchema>;
export type BarberCollectionUpdate = z.infer<typeof barberCollectionUpdateSchema>;
export type BarberCollectionQuery = z.infer<typeof barberCollectionQuerySchema>;
export type BarberCollectionResponse = z.infer<typeof barberCollectionResponseSchema>;
export type BarberCollectionEvent = z.infer<typeof barberCollectionEventSchema>;
export type BarberCollectionReportResponse = z.infer<typeof barberCollectionReportResponseSchema>;
