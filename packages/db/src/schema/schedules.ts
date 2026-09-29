import { sql } from "drizzle-orm";
import { check, date, foreignKey, int, mysqlTable, primaryKey, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { employees } from "./organization.js";

export const employeeWorkIntervals = mysqlTable("employee_work_intervals", {
  employeeId: varchar("employee_id", { length: 36 }).notNull(),
  dayOfWeek: int("day_of_week").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
}, table => [
  primaryKey({ columns: [table.employeeId, table.dayOfWeek, table.startTime] }),
  foreignKey({ name: "work_employee_fk", columns: [table.employeeId], foreignColumns: [employees.accountId] }).onDelete("cascade"),
  check("work_day_range", sql`${table.dayOfWeek} BETWEEN 0 AND 6`),
  check("work_time_order", sql`${table.startTime} < ${table.endTime}`),
]);

export const employeeScheduleExceptions = mysqlTable("employee_schedule_exceptions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
}, table => [
  uniqueIndex("employee_exception_date_unique").on(table.employeeId, table.date),
  foreignKey({ name: "exception_employee_fk", columns: [table.employeeId], foreignColumns: [employees.accountId] }).onDelete("cascade"),
]);

export const employeeExceptionIntervals = mysqlTable("employee_exception_intervals", {
  exceptionId: varchar("exception_id", { length: 36 }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
}, table => [
  primaryKey({ columns: [table.exceptionId, table.startTime] }),
  foreignKey({ name: "exception_interval_fk", columns: [table.exceptionId], foreignColumns: [employeeScheduleExceptions.id] }).onDelete("cascade"),
  check("exception_time_order", sql`${table.startTime} < ${table.endTime}`),
]);
