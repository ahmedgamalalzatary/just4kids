import { and, asc, count, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { bookingRevisions, bookingVisitEvents, bookings, branches, employees, invoices } from "@just4kids/db/schema";
import type { HaircutReportQuery, ReservationReportQuery } from "@just4kids/contracts";

// Kuwait is UTC+3 without daylight saving; created_at is stored in UTC. Grouped expressions stay parameter-free for ONLY_FULL_GROUP_BY.
const createdDay = sql`DATE(${bookings.createdAt} + INTERVAL 3 HOUR)`;
const reportDay = (query: HaircutReportQuery) => query.dateBasis === "visit_date" ? sql`${bookings.date}` : createdDay;
const editCount = sql<number>`(SELECT COUNT(*) FROM ${bookingRevisions} WHERE ${bookingRevisions.bookingId} = ${bookings.id})`.mapWith(Number);
const correctionCount = sql<number>`(SELECT COUNT(*) FROM ${bookingVisitEvents} WHERE ${bookingVisitEvents.bookingId} = ${bookings.id} AND ${bookingVisitEvents.correction} = TRUE)`.mapWith(Number);
const total = (expression: SQL) => sql<number>`COALESCE(SUM(${expression}), 0)`.mapWith(Number);
const quantity = (statuses: string[] | undefined, column: AnyColumn) => statuses
  ? total(sql`CASE WHEN ${bookings.visitStatus} IN (${sql.join(statuses.map(status => sql.raw(`'${status}'`)), sql`, `)}) THEN ${column} ELSE 0 END`)
  : total(sql`${column}`);
const measures = {
  bookings: count(),
  reservedAdult: quantity(undefined, bookings.adultCount), reservedChild: quantity(undefined, bookings.childCount),
  completedAdult: quantity(["completed"], bookings.adultCount), completedChild: quantity(["completed"], bookings.childCount),
  openAdult: quantity(["booked", "arrived"], bookings.adultCount), openChild: quantity(["booked", "arrived"], bookings.childCount),
  cancelledAdult: quantity(["cancelled"], bookings.adultCount), cancelledChild: quantity(["cancelled"], bookings.childCount),
  noShowAdult: quantity(["no_show"], bookings.adultCount), noShowChild: quantity(["no_show"], bookings.childCount),
};
type MeasureRow = { [Key in keyof typeof measures]: number };
function shapeMeasures(row: MeasureRow) {
  return {
    bookings: row.bookings, reserved: { adult: row.reservedAdult, child: row.reservedChild }, completed: { adult: row.completedAdult, child: row.completedChild },
    open: { adult: row.openAdult, child: row.openChild }, cancelled: { adult: row.cancelledAdult, child: row.cancelledChild }, noShow: { adult: row.noShowAdult, child: row.noShowChild },
  };
}

function filter(query: HaircutReportQuery) {
  const day = reportDay(query);
  const pattern = `%${query.q.replace(/[!%_]/g, character => `!${character}`)}%`;
  return and(
    query.from ? gte(day, query.from) : undefined, query.to ? lte(day, query.to) : undefined,
    query.branchId ? eq(bookings.branchId, query.branchId) : undefined, query.employeeId ? eq(bookings.employeeId, query.employeeId) : undefined,
    query.clientId ? eq(bookings.clientId, query.clientId) : undefined, query.status ? eq(bookings.visitStatus, query.status) : undefined,
    query.source ? eq(bookings.source, query.source) : undefined,
    query.q ? or(
      sql`${bookings.reference} LIKE ${pattern} ESCAPE '!'`,
      sql`JSON_UNQUOTE(JSON_EXTRACT(${bookings.clientSnapshot}, '$.name')) LIKE ${pattern} ESCAPE '!'`,
      sql`JSON_UNQUOTE(JSON_EXTRACT(${bookings.clientSnapshot}, '$.phone')) LIKE ${pattern} ESCAPE '!'`,
    ) : undefined,
  );
}

export function createReportRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  return {
    async reservations(query: ReservationReportQuery) {
      const where = filter(query);
      const status = (value: string) => total(sql`${bookings.visitStatus} = ${value}`);
      const [summary] = await db.select({
        bookings: count(), booked: status("booked"), arrived: status("arrived"), completed: status("completed"), cancelled: status("cancelled"), noShow: status("no_show"),
        manual: total(sql`${bookings.source} = 'manual'`), ai: total(sql`${bookings.source} = 'ai'`),
        editedBookings: total(sql`${editCount} > 0`), edits: total(editCount), correctedBookings: total(sql`${correctionCount} > 0`), corrections: total(correctionCount),
      }).from(bookings).where(where);
      const order = query.dateBasis === "visit_date" ? [desc(bookings.date), desc(bookings.startTime), desc(bookings.id)] : [desc(bookings.createdAt), desc(bookings.id)];
      const rows = await db.select({ booking: bookings, invoice: invoices, editCount, correctionCount }).from(bookings).innerJoin(invoices, eq(invoices.bookingId, bookings.id))
        .where(where).orderBy(...order).limit(query.limit).offset(query.offset);
      return { summary: summary!, rows };
    },
    async haircuts(query: HaircutReportQuery) {
      const where = filter(query);
      const day = sql<string>`DATE_FORMAT(${reportDay(query)}, '%Y-%m-%d')`;
      const [totals] = await db.select(measures).from(bookings).where(where);
      const byDate = await db.select({ date: day, ...measures }).from(bookings).where(where).groupBy(day).orderBy(asc(day));
      const byBranch = await db.select({ branchId: bookings.branchId, branchName: branches.name, ...measures }).from(bookings).innerJoin(branches, eq(branches.id, bookings.branchId))
        .where(where).groupBy(bookings.branchId, branches.name).orderBy(asc(branches.name), asc(bookings.branchId));
      const byEmployee = await db.select({ employeeId: bookings.employeeId, displayName: employees.displayName, branchId: bookings.branchId, branchName: branches.name, ...measures }).from(bookings)
        .innerJoin(employees, eq(employees.accountId, bookings.employeeId)).innerJoin(branches, eq(branches.id, bookings.branchId))
        .where(where).groupBy(bookings.employeeId, employees.displayName, bookings.branchId, branches.name)
        .orderBy(asc(employees.displayName), asc(bookings.employeeId), asc(branches.name), asc(bookings.branchId));
      return {
        totals: shapeMeasures(totals!),
        byDate: byDate.map(({ date, ...row }) => ({ date, ...shapeMeasures(row) })),
        byBranch: byBranch.map(({ branchId, branchName, ...row }) => ({ branchId, branchName, ...shapeMeasures(row) })),
        byEmployee: byEmployee.map(({ employeeId, displayName, branchId, branchName, ...row }) => ({ employeeId, displayName, branchId, branchName, ...shapeMeasures(row) })),
      };
    },
  };
}
export type ReportRepository = ReturnType<typeof createReportRepository>;
