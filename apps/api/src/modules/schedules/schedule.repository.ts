import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, branches, bookings, employees, employeeExceptionIntervals, employeeScheduleExceptions, employeeWorkIntervals } from "@just4kids/db/schema";
import type { WorkInterval, WeeklySchedule } from "@just4kids/contracts";
import { assertSchedulePreservesBookings, lockEmployee } from "../availability/availability.repository.js";

export function createScheduleRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  async function employeeExists(id: string) {
    const [row] = await db.select({ id: employees.accountId }).from(employees).where(eq(employees.accountId, id));
    return !!row;
  }
  async function get(id: string) {
    if (!await employeeExists(id)) return undefined;
    const work = await db.select().from(employeeWorkIntervals).where(eq(employeeWorkIntervals.employeeId, id)).orderBy(asc(employeeWorkIntervals.dayOfWeek), asc(employeeWorkIntervals.startTime));
    const exceptions = await db.select().from(employeeScheduleExceptions).where(eq(employeeScheduleExceptions.employeeId, id)).orderBy(asc(employeeScheduleExceptions.date));
    const exceptionIds = exceptions.map(row => row.id);
    const intervals = exceptionIds.length ? await db.select().from(employeeExceptionIntervals)
      .where(inArray(employeeExceptionIntervals.exceptionId, exceptionIds))
      .orderBy(asc(employeeExceptionIntervals.startTime)) : [];
    return { employeeId: id, work, exceptions, intervals };
  }
  return {
    employeeExists,
    get,
    async replaceWeekly(id: string, schedule: WeeklySchedule) {
      const found = await db.transaction(async transaction => {
        const employee = await lockEmployee(transaction, id);
        if (!employee) return false;
        await transaction.delete(employeeWorkIntervals).where(eq(employeeWorkIntervals.employeeId, id));
        const rows = schedule.days.flatMap(day => day.intervals.map(interval => ({ employeeId: id, dayOfWeek: day.dayOfWeek, ...interval })));
        if (rows.length) await transaction.insert(employeeWorkIntervals).values(rows);
        await assertSchedulePreservesBookings(transaction, id);
        return true;
      });
      return found ? get(id) : undefined;
    },
    async replaceException(id: string, date: string, intervals: WorkInterval[]) {
      const found = await db.transaction(async transaction => {
        const employee = await lockEmployee(transaction, id);
        if (!employee) return false;
        const [prior] = await transaction.select({ id: employeeScheduleExceptions.id }).from(employeeScheduleExceptions)
          .where(and(eq(employeeScheduleExceptions.employeeId, id), eq(employeeScheduleExceptions.date, date)));
        if (prior) await transaction.delete(employeeScheduleExceptions).where(eq(employeeScheduleExceptions.id, prior.id));
        const exceptionId = randomUUID();
        await transaction.insert(employeeScheduleExceptions).values({ id: exceptionId, employeeId: id, date });
        if (intervals.length) await transaction.insert(employeeExceptionIntervals).values(intervals.map(interval => ({ exceptionId, ...interval })));
        await assertSchedulePreservesBookings(transaction, id);
        return true;
      });
      return found ? get(id) : undefined;
    },
    async deleteException(id: string, date: string) {
      const found = await db.transaction(async transaction => {
        const employee = await lockEmployee(transaction, id);
        if (!employee) return false;
        await transaction.delete(employeeScheduleExceptions).where(and(eq(employeeScheduleExceptions.employeeId, id), eq(employeeScheduleExceptions.date, date)));
        await assertSchedulePreservesBookings(transaction, id);
        return true;
      });
      return found;
    },
    async eligibilityRows(date: string) {
      return db.transaction(async transaction => {
        const barbers = await transaction.select({ id: employees.accountId, displayName: employees.displayName, branchId: branches.id, branchName: branches.name, branchLocation: branches.location })
          .from(employees).innerJoin(accounts, eq(employees.accountId, accounts.id)).innerJoin(branches, eq(employees.branchId, branches.id))
          .where(and(eq(accounts.role, "employee"), eq(accounts.enabled, true))).orderBy(asc(employees.displayName), asc(employees.accountId));
        const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
        const work = await transaction.select().from(employeeWorkIntervals).where(eq(employeeWorkIntervals.dayOfWeek, weekday));
        const exceptions = await transaction.select({ employeeId: employeeScheduleExceptions.employeeId, exceptionId: employeeScheduleExceptions.id, interval: employeeExceptionIntervals })
          .from(employeeScheduleExceptions).leftJoin(employeeExceptionIntervals, eq(employeeScheduleExceptions.id, employeeExceptionIntervals.exceptionId))
          .where(eq(employeeScheduleExceptions.date, date));
        const visits = await transaction.select().from(bookings).where(eq(bookings.date, date));
        return { barbers, work, exceptions, visits };
      });
    },
  };
}

export type ScheduleRepository = ReturnType<typeof createScheduleRepository>;
