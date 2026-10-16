import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, bookings, employees, employeeExceptionIntervals, employeeScheduleExceptions, employeeWorkIntervals, employeeTimeBlocks } from "@just4kids/db/schema";
import type { Account, TimeBlockCreate, WorkInterval, WeeklySchedule } from "@just4kids/contracts";
import { assertSchedulePreservesBookings, lockEmployee, readBlockingBookings, readWorkingHours, readTimeBlocks } from "../availability/availability.repository.js";
import { isWindowAvailable } from "../availability/availability.service.js";
import { ForbiddenError, HttpError } from "../../lib/http-error.js";

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
    const blocks = await db.select().from(employeeTimeBlocks).where(eq(employeeTimeBlocks.employeeId, id)).orderBy(asc(employeeTimeBlocks.date), asc(employeeTimeBlocks.startTime));
    return { employeeId: id, work, exceptions, intervals, blocks };
  }
  return {
    employeeExists,
    get,
    async createBlock(id: string, input: TimeBlockCreate, actor: Account) {
      return db.transaction(async transaction => {
        const [administrator] = await transaction.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, actor.id), eq(accounts.role, "admin"), eq(accounts.enabled, true))).for("share");
        if (actor.role !== "admin" || !administrator) throw new ForbiddenError();
        const barber = await lockEmployee(transaction, id);
        if (!barber) throw new HttpError(404, "EMPLOYEE_NOT_FOUND", "Barber not found");
        const window = { date: input.date, startTime: input.startTime, endTime: input.endTime };
        const hours = await readWorkingHours(transaction, id, input.date);
        const visits = await readBlockingBookings(transaction, id, input.date);
        const blocks = await readTimeBlocks(transaction, id, input.date);
        if (!barber.account.enabled || !isWindowAvailable(window, hours.days, hours.exception, visits.map(row => ({ ...row, status: row.visitStatus })), blocks)) throw new HttpError(409, "TIME_BLOCK_CONFLICT", "Cannot lock this time: booked, closed or outside working hours. Reload the times");
        // Check after acquiring the same employee lock as bookings; elapsed times cannot be newly locked.
        if (Date.parse(`${input.date}T${input.startTime}:00+03:00`) <= Date.now()) throw new HttpError(400, "TIME_BLOCK_NOT_FUTURE", "Choose a future time in Kuwait");
        const block = { id: randomUUID(), employeeId: id, ...window, reason: input.reason || null, createdBy: actor.id, createdAt: new Date() };
        await transaction.insert(employeeTimeBlocks).values(block);
        return block;
      });
    },
    async deleteBlock(id: string, blockId: string, actor: Account) {
      return db.transaction(async transaction => {
        const [administrator] = await transaction.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, actor.id), eq(accounts.role, "admin"), eq(accounts.enabled, true))).for("share");
        if (actor.role !== "admin" || !administrator) throw new ForbiddenError();
        if (!await lockEmployee(transaction, id)) return false;
        const filter = and(eq(employeeTimeBlocks.id, blockId), eq(employeeTimeBlocks.employeeId, id));
        const [block] = await transaction.select().from(employeeTimeBlocks).where(filter).for("update");
        if (!block) return false;
        await transaction.delete(employeeTimeBlocks).where(filter);
        return true;
      });
    },
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
        const barbers = await transaction.select({ id: employees.accountId, displayName: employees.displayName })
          .from(employees).innerJoin(accounts, eq(employees.accountId, accounts.id))
          .where(and(eq(accounts.role, "employee"), eq(accounts.enabled, true))).orderBy(asc(employees.displayName), asc(employees.accountId));
        const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
        const work = await transaction.select().from(employeeWorkIntervals).where(eq(employeeWorkIntervals.dayOfWeek, weekday));
        const exceptions = await transaction.select({ employeeId: employeeScheduleExceptions.employeeId, exceptionId: employeeScheduleExceptions.id, interval: employeeExceptionIntervals })
          .from(employeeScheduleExceptions).leftJoin(employeeExceptionIntervals, eq(employeeScheduleExceptions.id, employeeExceptionIntervals.exceptionId))
          .where(eq(employeeScheduleExceptions.date, date));
        const visits = await transaction.select().from(bookings).where(eq(bookings.date, date));
        const blocks = await transaction.select().from(employeeTimeBlocks).where(eq(employeeTimeBlocks.date, date));
        return { barbers, work, exceptions, visits, blocks };
      });
    },
  };
}

export type ScheduleRepository = ReturnType<typeof createScheduleRepository>;
