import { and, asc, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, barberCollections, bookingMessages, bookingRevisions, bookingVisitEvents, bookings, clients, employeeExceptionIntervals, employeeScheduleExceptions, employeeWorkIntervals, employees, salonEntries } from "@just4kids/db/schema";
import type { BookingTrackingQuery, ClientReportQuery, ComprehensiveReportQuery, HaircutReportQuery, ReservationReportQuery } from "@just4kids/contracts";

// Kuwait is UTC+3 without daylight saving; created_at is stored in UTC. Grouped expressions stay parameter-free for ONLY_FULL_GROUP_BY.
const createdDay = sql`DATE(${bookings.createdAt} + INTERVAL 3 HOUR)`;
const reportDay = (query: HaircutReportQuery) => query.dateBasis === "visit_date" ? sql`${bookings.date}` : createdDay;
// The correlated subqueries must qualify the outer booking column: inside a single-table select Drizzle leaves booking columns unqualified, and a bare `id` would bind to the subquery's own table.
const bookingId = sql.raw("`bookings`.`id`");
const editCount = sql<number>`(SELECT COUNT(*) FROM ${bookingRevisions} WHERE ${bookingRevisions.bookingId} = ${bookingId})`.mapWith(Number);
const correctionCount = sql<number>`(SELECT COUNT(*) FROM ${bookingVisitEvents} WHERE ${bookingVisitEvents.bookingId} = ${bookingId} AND ${bookingVisitEvents.correction} = TRUE)`.mapWith(Number);
const total = (expression: SQL) => sql<number>`COALESCE(SUM(${expression}), 0)`.mapWith(Number);
const quantity = (statuses: string[] | undefined, column: AnyColumn) => statuses
  ? total(sql`CASE WHEN ${bookings.visitStatus} IN (${sql.join(statuses.map(status => sql.raw(`'${status}'`)), sql`, `)}) THEN ${column} ELSE 0 END`)
  : total(sql`${column}`);
const measures = {
  bookings: count(),
  reservedAdult: quantity(undefined, bookings.adultCount), reservedChild: quantity(undefined, bookings.childCount), reservedSpecial: quantity(undefined, bookings.specialChildCount),
  completedAdult: quantity(["completed"], bookings.adultCount), completedChild: quantity(["completed"], bookings.childCount), completedSpecial: quantity(["completed"], bookings.specialChildCount),
  openAdult: quantity(["booked", "arrived"], bookings.adultCount), openChild: quantity(["booked", "arrived"], bookings.childCount), openSpecial: quantity(["booked", "arrived"], bookings.specialChildCount),
  cancelledAdult: quantity(["cancelled"], bookings.adultCount), cancelledChild: quantity(["cancelled"], bookings.childCount), cancelledSpecial: quantity(["cancelled"], bookings.specialChildCount),
  noShowAdult: quantity(["no_show"], bookings.adultCount), noShowChild: quantity(["no_show"], bookings.childCount), noShowSpecial: quantity(["no_show"], bookings.specialChildCount),
};
type MeasureRow = { [Key in keyof typeof measures]: number };
function shapeMeasures(row: MeasureRow) {
  return {
    bookings: row.bookings, reserved: { adult: row.reservedAdult, child: row.reservedChild, special: row.reservedSpecial }, completed: { adult: row.completedAdult, child: row.completedChild, special: row.completedSpecial },
    open: { adult: row.openAdult, child: row.openChild, special: row.openSpecial }, cancelled: { adult: row.cancelledAdult, child: row.cancelledChild, special: row.cancelledSpecial }, noShow: { adult: row.noShowAdult, child: row.noShowChild, special: row.noShowSpecial },
  };
}

// Performance measures read the reservation's assigned work for the period.
const reservedMinutes = sql`(TIME_TO_SEC(CONCAT(${bookings.endTime}, ':00')) - TIME_TO_SEC(CONCAT(${bookings.startTime}, ':00'))) DIV 60`;
const exact = (expression: SQL) => sql<string>`CAST(COALESCE(SUM(${expression}), 0) AS DECIMAL(65, 3))`.mapWith(String);
// The barber and comprehensive reports read the administrator's daily collections, not per-booking receipts.
const collectionWhere = (query: { from?: string | undefined; to?: string | undefined; employeeId?: string | undefined }) => and(
  query.from ? gte(barberCollections.date, query.from) : undefined,
  query.to ? lte(barberCollections.date, query.to) : undefined,
  query.employeeId ? eq(barberCollections.employeeId, query.employeeId) : undefined,
);
const collectionMeasures = {
  cashCount: total(sql`${barberCollections.cash} > 0`), cashTotal: exact(sql`${barberCollections.cash}`),
  linkCount: total(sql`${barberCollections.link} > 0`), linkTotal: exact(sql`${barberCollections.link}`),
  knetCount: total(sql`${barberCollections.knet} > 0`), knetTotal: exact(sql`${barberCollections.knet}`),
  count: count(), total: exact(sql`${barberCollections.total}`),
};
const performanceMeasures = {
  ...measures,
  completedVisits: total(sql`${bookings.visitStatus} = 'completed'`),
  reservedMinutes: total(sql`CASE WHEN ${bookings.visitStatus} IN ('booked', 'arrived', 'completed') THEN ${reservedMinutes} ELSE 0 END`),
};
type PerformanceRow = MeasureRow & { completedVisits: number; reservedMinutes: number };
const emptyPerformance: PerformanceRow = {
  ...Object.fromEntries(Object.keys(measures).map(key => [key, 0])) as MeasureRow,
  completedVisits: 0, reservedMinutes: 0,
};
export function shapePerformance(row: PerformanceRow = emptyPerformance) {
  return {
    work: { ...shapeMeasures(row), completedVisits: row.completedVisits, reservedMinutes: row.reservedMinutes },
  };
}

/** Scheduled minutes for each Kuwait date in the inclusive range: a dated exception replaces that day's weekly hours, and an empty exception closes it. */
export function scheduledMinutes(from: string, to: string, weekly: { dayOfWeek: number; startTime: string; endTime: string }[], exceptions: Map<string, { startTime: string; endTime: string }[]>) {
  const length = (interval: { startTime: string; endTime: string }) => minute(interval.endTime) - minute(interval.startTime);
  let minutes = 0;
  for (let day = new Date(`${from}T00:00:00Z`); day.toISOString().slice(0, 10) <= to; day.setUTCDate(day.getUTCDate() + 1)) {
    const intervals = exceptions.get(day.toISOString().slice(0, 10)) ?? weekly.filter(interval => interval.dayOfWeek === day.getUTCDay());
    minutes += intervals.reduce((sum, interval) => sum + length(interval), 0);
  }
  return minutes;
}
function minute(time: string) { return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)); }

function filter(query: HaircutReportQuery) {
  const day = reportDay(query);
  const pattern = `%${query.q.replace(/[!%_]/g, character => `!${character}`)}%`;
  return and(
    query.from ? gte(day, query.from) : undefined, query.to ? lte(day, query.to) : undefined,
    query.employeeId ? eq(bookings.employeeId, query.employeeId) : undefined,
    query.clientId ? eq(bookings.clientId, query.clientId) : undefined, query.status ? eq(bookings.visitStatus, query.status) : undefined,
    query.source ? eq(bookings.source, query.source) : undefined,
    query.q ? or(
      sql`${bookings.reference} LIKE ${pattern} ESCAPE '!'`,
      sql`JSON_UNQUOTE(JSON_EXTRACT(${bookings.clientSnapshot}, '$.phone')) LIKE ${pattern} ESCAPE '!'`,
    ) : undefined,
  );
}

export function createReportRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  return {
    async tracking(query: BookingTrackingQuery) {
      return db.transaction(async transaction => {
        const rows = await transaction.select({ booking: bookings }).from(bookings)
          .where(filter({ ...query, dateBasis: "visit_date", q: "" })).orderBy(desc(bookings.date), desc(bookings.startTime), desc(bookings.id));
        const ids = rows.map(row => row.booking.id);
        if (!ids.length) return { rows, visits: [], revisions: [], messages: [], actors: [], clients: [] };
        const visits = await transaction.select().from(bookingVisitEvents).where(inArray(bookingVisitEvents.bookingId, ids)).orderBy(asc(bookingVisitEvents.version));
        const revisions = await transaction.select().from(bookingRevisions).where(inArray(bookingRevisions.bookingId, ids));
        const messages = await transaction.select().from(bookingMessages).where(inArray(bookingMessages.bookingId, ids));
        const actorIds = [...new Set([...rows.map(row => row.booking.createdBy), ...visits.flatMap(event => event.actorAccountId ? [event.actorAccountId] : []), ...revisions.map(event => event.actorAccountId), ...messages.map(event => event.actorAccountId)])];
        const actors = await transaction.select({ id: accounts.id, role: accounts.role, name: employees.displayName }).from(accounts).leftJoin(employees, eq(employees.accountId, accounts.id)).where(inArray(accounts.id, actorIds));
        const clientIds = [...new Set([...rows.map(row => row.booking.clientId), ...visits.flatMap(event => event.actorClientId ? [event.actorClientId] : [])])];
        const people = await transaction.select({ id: clients.id, phone: clients.phone }).from(clients).where(inArray(clients.id, clientIds));
        return { rows, visits, revisions, messages, actors, clients: people };
      });
    },
    async reservations(query: ReservationReportQuery) {
      const where = filter(query);
      const status = (value: string) => total(sql`${bookings.visitStatus} = ${value}`);
      const [summary] = await db.select({
        bookings: count(), booked: status("booked"), arrived: status("arrived"), completed: status("completed"), cancelled: status("cancelled"), noShow: status("no_show"),
        manual: total(sql`${bookings.source} = 'manual'`), ai: total(sql`${bookings.source} = 'ai'`),
        editedBookings: total(sql`${editCount} > 0`), edits: total(editCount), correctedBookings: total(sql`${correctionCount} > 0`), corrections: total(correctionCount),
      }).from(bookings).where(where);
      const order = query.dateBasis === "visit_date" ? [desc(bookings.date), desc(bookings.startTime), desc(bookings.id)] : [desc(bookings.createdAt), desc(bookings.id)];
      const rows = await db.select({ booking: bookings, editCount, correctionCount }).from(bookings)
        .where(where).orderBy(...order).limit(query.limit).offset(query.offset);
      return { summary: summary!, rows };
    },
    async haircuts(query: HaircutReportQuery) {
      const where = filter(query);
      const day = sql<string>`DATE_FORMAT(${reportDay(query)}, '%Y-%m-%d')`;
      const [totals] = await db.select(measures).from(bookings).where(where);
      const byDate = await db.select({ date: day, ...measures }).from(bookings).where(where).groupBy(day).orderBy(asc(day));
      const byEmployee = await db.select({ employeeId: bookings.employeeId, displayName: employees.displayName, ...measures }).from(bookings)
        .innerJoin(employees, eq(employees.accountId, bookings.employeeId))
        .where(where).groupBy(bookings.employeeId, employees.displayName)
        .orderBy(asc(employees.displayName), asc(bookings.employeeId));
      return {
        totals: shapeMeasures(totals!),
        byDate: byDate.map(({ date, ...row }) => ({ date, ...shapeMeasures(row) })),
        byEmployee: byEmployee.map(({ employeeId, displayName, ...row }) => ({ employeeId, displayName, ...shapeMeasures(row) })),
      };
    },
    /** Work grouped by the barber assigned to each reservation. */
    async performance(query: HaircutReportQuery) {
      return db.select({ employeeId: bookings.employeeId, ...performanceMeasures }).from(bookings)
        .where(filter(query)).groupBy(bookings.employeeId) as unknown as Promise<({ employeeId: string } & PerformanceRow)[]>;
    },
    /** The administrator's daily collections for the period, totalled per barber. */
    async collectionSums(query: HaircutReportQuery) {
      return db.select({ employeeId: barberCollections.employeeId, ...collectionMeasures }).from(barberCollections)
        .where(collectionWhere(query)).groupBy(barberCollections.employeeId);
    },
    async employees(employeeId: string | undefined) {
      return db.select({ employeeId: employees.accountId, displayName: employees.displayName, enabled: accounts.enabled }).from(employees)
        .innerJoin(accounts, eq(accounts.id, employees.accountId))
        .where(employeeId ? eq(employees.accountId, employeeId) : undefined).orderBy(asc(employees.displayName), asc(employees.accountId));
    },
    async schedules(employeeIds: string[], from: string, to: string) {
      if (!employeeIds.length) return { weekly: [], exceptions: [] };
      const weekly = await db.select().from(employeeWorkIntervals).where(inArray(employeeWorkIntervals.employeeId, employeeIds));
      const exceptions = await db.select({ employeeId: employeeScheduleExceptions.employeeId, date: employeeScheduleExceptions.date, startTime: employeeExceptionIntervals.startTime, endTime: employeeExceptionIntervals.endTime })
        .from(employeeScheduleExceptions).leftJoin(employeeExceptionIntervals, eq(employeeExceptionIntervals.exceptionId, employeeScheduleExceptions.id))
        .where(and(inArray(employeeScheduleExceptions.employeeId, employeeIds), gte(employeeScheduleExceptions.date, from), lte(employeeScheduleExceptions.date, to)));
      return { weekly, exceptions };
    },
    async clients(query: ClientReportQuery) {
      return db.select({ clientId: clients.id, phone: clients.phone, ...performanceMeasures }).from(bookings)
        .innerJoin(clients, eq(clients.id, bookings.clientId))
        .where(filter(query)).groupBy(clients.id, clients.phone)
        .orderBy(asc(clients.phone), asc(clients.id)) as unknown as Promise<({ clientId: string; phone: string } & PerformanceRow)[]>;
    },
    /** Barber per-method collections joined with the shop's salon entries for the same period. */
    async comprehensive(query: ComprehensiveReportQuery) {
      const barbers = await db.select({ employeeId: barberCollections.employeeId, displayName: employees.displayName, enabled: accounts.enabled, ...collectionMeasures }).from(barberCollections)
        .innerJoin(employees, eq(employees.accountId, barberCollections.employeeId)).innerJoin(accounts, eq(accounts.id, barberCollections.employeeId))
        .where(collectionWhere(query)).groupBy(barberCollections.employeeId, employees.displayName, accounts.enabled)
        .orderBy(asc(employees.displayName), asc(barberCollections.employeeId));
      const [salon] = await db.select({
        cashCount: total(sql`${salonEntries.cash} > 0`), cashTotal: exact(sql`${salonEntries.cash}`),
        linkCount: total(sql`${salonEntries.link} > 0`), linkTotal: exact(sql`${salonEntries.link}`),
        knetCount: total(sql`${salonEntries.knet} > 0`), knetTotal: exact(sql`${salonEntries.knet}`),
        count: count(), total: exact(sql`${salonEntries.total}`),
      }).from(salonEntries).where(and(
        query.from ? gte(salonEntries.date, query.from) : undefined,
        query.to ? lte(salonEntries.date, query.to) : undefined,
      ));
      return { barbers, salon: salon! };
    },
  };
}
export type ReportRepository = ReturnType<typeof createReportRepository>;
