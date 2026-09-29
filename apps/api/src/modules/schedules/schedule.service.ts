import { eligibilityQuerySchema, eligibilityResponseSchema, scheduleDateSchema, scheduleExceptionSchema, scheduleResponseSchema, weeklyScheduleSchema } from "@just4kids/contracts";
import type { WorkInterval } from "@just4kids/contracts";
import { isWindowAvailable } from "../availability/availability.service.js";
import type { ScheduleRepository } from "./schedule.repository.js";

function serialize(row: NonNullable<Awaited<ReturnType<ScheduleRepository["get"]>>>) {
  const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, intervals: row.work.filter(interval => interval.dayOfWeek === dayOfWeek)
    .map(interval => ({ startTime: interval.startTime, endTime: interval.endTime })) })).filter(day => day.intervals.length > 0);
  const exceptions = row.exceptions.map(exception => ({ date: exception.date, intervals: row.intervals
    .filter(interval => interval.exceptionId === exception.id).map(interval => ({ startTime: interval.startTime, endTime: interval.endTime })) }));
  return scheduleResponseSchema.parse({ employeeId: row.employeeId, days, exceptions });
}

export function createScheduleService(repository: ScheduleRepository) {
  return {
    async get(id: string) { const row = await repository.get(id); return row ? serialize(row) : undefined; },
    async replaceWeekly(id: string, body: unknown) {
      const schedule = weeklyScheduleSchema.parse(body);
      const row = await repository.replaceWeekly(id, schedule);
      return row ? serialize(row) : undefined;
    },
    async replaceException(id: string, dateInput: unknown, body: unknown) {
      const date = scheduleDateSchema.parse(dateInput);
      const { intervals } = scheduleExceptionSchema.parse(body);
      const row = await repository.replaceException(id, date, intervals);
      return row ? serialize(row) : undefined;
    },
    async deleteException(id: string, dateInput: unknown) {
      const date = scheduleDateSchema.parse(dateInput);
      return repository.deleteException(id, date);
    },
    async eligible(queryInput: unknown) {
      const query = eligibilityQuerySchema.parse(queryInput);
      const rows = await repository.eligibilityRows(query.date);
      const barbers = rows.barbers.filter(barber => {
        const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, intervals: rows.work.filter(interval => interval.employeeId === barber.id && interval.dayOfWeek === dayOfWeek)
          .map(interval => ({ startTime: interval.startTime, endTime: interval.endTime })) })).filter(day => day.intervals.length > 0);
        const ownExceptions = rows.exceptions.filter(exception => exception.employeeId === barber.id);
        const exception: WorkInterval[] | undefined = ownExceptions.length ? ownExceptions.flatMap(row => row.interval ? [{ startTime: row.interval.startTime, endTime: row.interval.endTime }] : []) : undefined;
        return isWindowAvailable(query, days, exception, []);
      }).map(barber => ({ id: barber.id, displayName: barber.displayName, branch: { id: barber.branchId, name: barber.branchName, location: barber.branchLocation } }));
      return eligibilityResponseSchema.parse({ date: query.date, startTime: query.startTime, endTime: query.endTime, timeZone: "Asia/Kuwait", barbers });
    },
  };
}

export type ScheduleService = ReturnType<typeof createScheduleService>;
