import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@just4kids/db";
import { accounts, employees, bookings, employeeWorkIntervals, employeeScheduleExceptions, employeeExceptionIntervals } from "@just4kids/db/schema";
import { HttpError } from "../../lib/http-error.js";
import { isWindowAvailable } from "./availability.service.js";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export async function lockEmployee(transaction: Transaction, employeeId: string) {
  const [account] = await transaction.select().from(accounts).where(and(eq(accounts.id, employeeId), eq(accounts.role, "employee"))).for("update");
  if (!account) return undefined;
  const [employee] = await transaction.select().from(employees).where(eq(employees.accountId, employeeId)).for("update");
  return employee ? { account, employee } : undefined;
}
export async function readWorkingHours(transaction: Transaction, employeeId: string, date: string) {
  const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const work = await transaction.select().from(employeeWorkIntervals).where(and(eq(employeeWorkIntervals.employeeId, employeeId), eq(employeeWorkIntervals.dayOfWeek, dayOfWeek))).for("update");
  const [exception] = await transaction.select().from(employeeScheduleExceptions).where(and(eq(employeeScheduleExceptions.employeeId, employeeId), eq(employeeScheduleExceptions.date, date))).for("update");
  const intervals = exception ? await transaction.select().from(employeeExceptionIntervals).where(eq(employeeExceptionIntervals.exceptionId, exception.id)).for("update") : undefined;
  return { days: [{ dayOfWeek, intervals: work.map(row => ({ startTime: row.startTime, endTime: row.endTime })) }], exception: intervals?.map(row => ({ startTime: row.startTime, endTime: row.endTime })) };
}
export async function readBlockingBookings(transaction: Transaction, employeeId: string, date?: string) {
  return transaction.select().from(bookings).where(and(eq(bookings.employeeId, employeeId), inArray(bookings.visitStatus, ["booked", "arrived", "completed"]), date ? eq(bookings.date, date) : undefined)).for("update");
}
export async function assertSchedulePreservesBookings(transaction: Transaction, employeeId: string) {
  const existing = await readBlockingBookings(transaction, employeeId);
  for (const booking of existing) {
    const hours = await readWorkingHours(transaction, employeeId, booking.date);
    if (!isWindowAvailable({ date: booking.date, startTime: booking.startTime, endTime: booking.endTime }, hours.days, hours.exception, [])) throw new HttpError(409, "SCHEDULE_BOOKING_CONFLICT", "تعديل الجدول يتعارض مع حجز قائم");
  }
}
