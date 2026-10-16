import { eligibilityQuerySchema, eligibilityResponseSchema, scheduleDateSchema, scheduleExceptionSchema, scheduleResponseSchema, weeklyScheduleSchema, timeBlockCreateSchema, timeBlockResponseSchema } from "@just4kids/contracts";
import type { Account, WorkInterval } from "@just4kids/contracts";
import { z } from "zod";
import { isWindowAvailable } from "../availability/availability.service.js";
import type { ScheduleRepository } from "./schedule.repository.js";

function serialize(row: NonNullable<Awaited<ReturnType<ScheduleRepository["get"]>>>) {
  const inactive = new Set(row.workDays.filter(day => !day.active).map(day => day.dayOfWeek));
  const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, active: !inactive.has(dayOfWeek), intervals: row.work.filter(interval => interval.dayOfWeek === dayOfWeek)
    .map(interval => ({ startTime: interval.startTime, endTime: interval.endTime })) }));
  const exceptions = row.exceptions.map(exception => ({ date: exception.date, intervals: row.intervals
    .filter(interval => interval.exceptionId === exception.id).map(interval => ({ startTime: interval.startTime, endTime: interval.endTime })) }));
  return scheduleResponseSchema.parse({ employeeId: row.employeeId, days, exceptions, blocks: row.blocks.map(block => ({ ...block, createdAt: block.createdAt.toISOString() })) });
}

export function createScheduleService(repository: ScheduleRepository) {
  return {
    async createBlock(id: string, body: unknown, actor: Account) {
      const block = await repository.createBlock(id, timeBlockCreateSchema.parse(body), actor);
      return timeBlockResponseSchema.parse({ ...block, createdAt: block.createdAt.toISOString() });
    },
    async deleteBlock(id: string, blockId: string, actor: Account) {
      return repository.deleteBlock(id, z.uuid().parse(blockId), actor);
    },
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
      const inactive = new Set(rows.workDays.filter(day => !day.active).map(day => `${day.employeeId}:${day.dayOfWeek}`));
      const workByEmployee = new Map<string, Map<number, WorkInterval[]>>();
      for (const interval of rows.work) {
        const byDay = workByEmployee.get(interval.employeeId) ?? new Map<number, WorkInterval[]>();
        const intervals = byDay.get(interval.dayOfWeek) ?? [];
        intervals.push({ startTime: interval.startTime, endTime: interval.endTime });
        byDay.set(interval.dayOfWeek, intervals);
        workByEmployee.set(interval.employeeId, byDay);
      }
      const exceptionsByEmployee = new Map<string, WorkInterval[]>();
      for (const exception of rows.exceptions) {
        const intervals = exceptionsByEmployee.get(exception.employeeId) ?? [];
        if (exception.interval) intervals.push({ startTime: exception.interval.startTime, endTime: exception.interval.endTime });
        exceptionsByEmployee.set(exception.employeeId, intervals);
      }
      const barbers = rows.barbers.filter(barber => {
        const days = [...(workByEmployee.get(barber.id) ?? new Map<number, WorkInterval[]>())]
          .sort(([firstDay], [secondDay]) => firstDay - secondDay)
          .map(([dayOfWeek, intervals]) => ({ dayOfWeek, intervals: inactive.has(`${barber.id}:${dayOfWeek}`) ? [] : intervals }));
        return isWindowAvailable(query, days, exceptionsByEmployee.get(barber.id), rows.visits.filter(visit => visit.employeeId === barber.id).map(visit => ({ ...visit, status: visit.visitStatus })), rows.blocks.filter(block => block.employeeId === barber.id));
      }).map(barber => ({ id: barber.id, displayName: barber.displayName }));
      return eligibilityResponseSchema.parse({ date: query.date, startTime: query.startTime, endTime: query.endTime, timeZone: "Asia/Kuwait", barbers });
    },
  };
}

export type ScheduleService = ReturnType<typeof createScheduleService>;
