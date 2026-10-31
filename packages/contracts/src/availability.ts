import { z } from "zod";

const timeSchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const dateSchema = z.iso.date().refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});
const minuteOfDay = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const workIntervalSchema = z.strictObject({ startTime: timeSchema, endTime: timeSchema })
  .refine(value => minuteOfDay(value.endTime) > minuteOfDay(value.startTime), "Work shifts must end on the same day after they start");

const intervalsSchema = z.array(workIntervalSchema).max(16).superRefine((intervals, context) => {
  const sorted = [...intervals].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index]!.startTime < sorted[index - 1]!.endTime) {
      context.addIssue({ code: "custom", message: "Work shifts cannot overlap" });
      break;
    }
  }
});

export const weeklyScheduleSchema = z.strictObject({
  days: z.array(z.strictObject({ dayOfWeek: z.number().int().min(0).max(6), active: z.boolean(), intervals: intervalsSchema })).max(7),
}).superRefine((value, context) => {
  if (new Set(value.days.map(day => day.dayOfWeek)).size !== value.days.length) {
    context.addIssue({ code: "custom", message: "Each weekday may appear only once" });
  }
});

export const scheduleExceptionSchema = z.strictObject({ intervals: intervalsSchema });
export const scheduleDateSchema = dateSchema;
export const timeBlockCreateSchema = z.strictObject({
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  reason: z.string().trim().max(500).optional(),
}).refine(value => {
  const start = minuteOfDay(value.startTime), end = minuteOfDay(value.endTime);
  return start % 30 === 0 && end % 30 === 0 && end > start;
}, "Locks must be whole half-hours on the same day, ending after they start");
export const timeBlockResponseSchema = z.strictObject({
  id: z.uuid(), employeeId: z.uuid(), date: dateSchema, startTime: timeSchema, endTime: timeSchema,
  reason: z.string().max(500).nullable(), createdBy: z.uuid(), createdAt: z.iso.datetime(),
});
export type TimeBlockCreate = z.infer<typeof timeBlockCreateSchema>;
export const eligibilityQuerySchema = z.strictObject({ date: dateSchema, startTime: timeSchema, endTime: timeSchema })
  .refine(value => {
    const duration = minuteOfDay(value.endTime) - minuteOfDay(value.startTime);
    return duration >= 20 && duration <= 240;
  }, "Booking windows must last between 20 minutes and 4 hours within one Kuwait day");

/** A new reservation starts on the hour and lasts whole hours; with the bounds above that means 1 to 4 hours. Older visits and corrections may differ. */
export const isWholeHourWindow = ({ startTime, endTime }: { startTime: string; endTime: string }) => startTime.endsWith(":00") && endTime.endsWith(":00");

export const scheduleResponseSchema = z.strictObject({
  employeeId: z.uuid(),
  days: weeklyScheduleSchema.shape.days,
  exceptions: z.array(z.strictObject({ date: dateSchema, intervals: intervalsSchema })),
  blocks: z.array(timeBlockResponseSchema).default([]),
});
export const eligibilityResponseSchema = z.strictObject({
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  timeZone: z.literal("Asia/Kuwait"),
  barbers: z.array(z.strictObject({
    id: z.uuid(),
    displayName: z.string().trim().min(1).max(120),
  })),
});

export type WorkInterval = z.infer<typeof workIntervalSchema>;
export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;
export type ScheduleException = z.infer<typeof scheduleExceptionSchema>;
export type EligibilityQuery = z.infer<typeof eligibilityQuerySchema>;
