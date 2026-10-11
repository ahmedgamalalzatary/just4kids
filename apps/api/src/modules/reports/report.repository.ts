import { and, asc, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, bookingRevisions, bookingVisitEvents, bookings, branches, cashPayments, clients, employeeExceptionIntervals, employeeScheduleExceptions, employeeWorkIntervals, employees, invoices } from "@just4kids/db/schema";
import type { ClientReportQuery, HaircutReportQuery, InvoiceReportQuery, ReservationReportQuery } from "@just4kids/contracts";

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

// Performance measures read one invoice per reservation and at most one active receipt per invoice, so joins never duplicate rows.
const reservedMinutes = sql`(TIME_TO_SEC(CONCAT(${bookings.endTime}, ':00')) - TIME_TO_SEC(CONCAT(${bookings.startTime}, ':00'))) DIV 60`;
const exact = (expression: SQL) => sql<string>`CAST(COALESCE(SUM(${expression}), 0) AS DECIMAL(65, 3))`.mapWith(String);
const invoiceTotal = (condition: SQL) => exact(sql`CASE WHEN ${condition} THEN ${invoices.total} ELSE 0 END`);
const issued = sql`${invoices.status} = 'issued'`, cancelled = sql`${invoices.status} = 'cancelled'`, outstanding = sql`${invoices.status} = 'issued' AND ${invoices.paymentStatus} = 'unpaid'`;
// Active receipts joined at most once per booking, split by the recorded payment method.
const cashMethodCount = (method: string) => total(sql`${cashPayments.id} IS NOT NULL AND ${cashPayments.method} = ${method}`);
const cashMethodTotal = (method: string) => exact(sql`CASE WHEN ${cashPayments.method} = ${method} THEN ${cashPayments.amount} ELSE 0 END`);
const cashMethodMeasures = {
  byMethodCashCount: cashMethodCount("cash"), byMethodCashTotal: cashMethodTotal("cash"),
  byMethodLinkCount: cashMethodCount("link"), byMethodLinkTotal: cashMethodTotal("link"),
  byMethodKnetCount: cashMethodCount("knet"), byMethodKnetTotal: cashMethodTotal("knet"),
};
const performanceMeasures = {
  ...measures,
  completedVisits: total(sql`${bookings.visitStatus} = 'completed'`),
  reservedMinutes: total(sql`CASE WHEN ${bookings.visitStatus} IN ('booked', 'arrived', 'completed') THEN ${reservedMinutes} ELSE 0 END`),
  issuedCount: total(issued), issuedTotal: invoiceTotal(issued), cancelledCount: total(cancelled), cancelledTotal: invoiceTotal(cancelled),
  outstandingCount: total(outstanding), outstandingTotal: invoiceTotal(outstanding),
  cashCount: total(sql`${cashPayments.id} IS NOT NULL`), cashTotal: exact(sql`${cashPayments.amount}`),
  ...cashMethodMeasures,
};
type PerformanceRow = { [Key in keyof typeof performanceMeasures]: Key extends "issuedTotal" | "cancelledTotal" | "outstandingTotal" | "cashTotal" | "byMethodCashTotal" | "byMethodLinkTotal" | "byMethodKnetTotal" ? string : number };
const emptyPerformance: PerformanceRow = {
  ...Object.fromEntries(Object.keys(measures).map(key => [key, 0])) as MeasureRow,
  completedVisits: 0, reservedMinutes: 0, issuedCount: 0, issuedTotal: "0.000", cancelledCount: 0, cancelledTotal: "0.000", outstandingCount: 0, outstandingTotal: "0.000", cashCount: 0, cashTotal: "0.000",
  byMethodCashCount: 0, byMethodCashTotal: "0.000", byMethodLinkCount: 0, byMethodLinkTotal: "0.000", byMethodKnetCount: 0, byMethodKnetTotal: "0.000",
};
export function shapePerformance(row: PerformanceRow = emptyPerformance) {
  return {
    work: { ...shapeMeasures(row), completedVisits: row.completedVisits, reservedMinutes: row.reservedMinutes },
    invoices: { issued: { count: row.issuedCount, total: row.issuedTotal }, cancelled: { count: row.cancelledCount, total: row.cancelledTotal }, outstanding: { count: row.outstandingCount, total: row.outstandingTotal } },
    cash: {
      count: row.cashCount, total: row.cashTotal,
      byMethod: {
        cash: { count: row.byMethodCashCount, total: row.byMethodCashTotal },
        link: { count: row.byMethodLinkCount, total: row.byMethodLinkTotal },
        knet: { count: row.byMethodKnetCount, total: row.byMethodKnetTotal },
      },
    },
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
    /** Work grouped by the barber and/or branch recorded on each reservation. */
    async performance<Key extends "employeeId" | "branchId">(query: HaircutReportQuery, keys: Key[]) {
      const columns = { employeeId: bookings.employeeId, branchId: bookings.branchId };
      const groups = keys.map(key => columns[key]);
      return db.select({ ...Object.fromEntries(keys.map(key => [key, columns[key]])) as { [Name in Key]: typeof columns[Name] }, ...performanceMeasures }).from(bookings)
        .innerJoin(invoices, eq(invoices.bookingId, bookings.id)).leftJoin(cashPayments, and(eq(cashPayments.bookingId, bookings.id), eq(cashPayments.status, "active")))
        .where(filter(query)).groupBy(...groups) as unknown as Promise<({ [Name in Key]: string } & PerformanceRow)[]>;
    },
    async employees(employeeId: string | undefined) {
      return db.select({ employeeId: employees.accountId, displayName: employees.displayName, enabled: accounts.enabled, branchId: employees.branchId, branchName: branches.name }).from(employees)
        .innerJoin(accounts, eq(accounts.id, employees.accountId)).innerJoin(branches, eq(branches.id, employees.branchId))
        .where(employeeId ? eq(employees.accountId, employeeId) : undefined).orderBy(asc(employees.displayName), asc(employees.accountId));
    },
    async branches(branchId: string | undefined) {
      return db.select({ branchId: branches.id, branchName: branches.name }).from(branches).where(branchId ? eq(branches.id, branchId) : undefined).orderBy(asc(branches.name), asc(branches.id));
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
      return db.select({ clientId: clients.id, name: clients.name, phone: clients.phone, ...performanceMeasures }).from(bookings)
        .innerJoin(clients, eq(clients.id, bookings.clientId)).innerJoin(invoices, eq(invoices.bookingId, bookings.id))
        .leftJoin(cashPayments, and(eq(cashPayments.bookingId, bookings.id), eq(cashPayments.status, "active")))
        .where(filter(query)).groupBy(clients.id, clients.name, clients.phone)
        .orderBy(asc(clients.name), asc(clients.id)) as unknown as Promise<({ clientId: string; name: string; phone: string } & PerformanceRow)[]>;
    },
    async invoiceList(query: InvoiceReportQuery) {
      const where = filter(query);
      const conditions = query.paymentStatus ? and(where, eq(invoices.paymentStatus, query.paymentStatus)) : where;
      const [summary] = await db.select({
        issuedCount: total(issued), issuedTotal: invoiceTotal(issued), cancelledCount: total(cancelled), cancelledTotal: invoiceTotal(cancelled),
        outstandingCount: total(outstanding), outstandingTotal: invoiceTotal(outstanding),
        cashCount: total(sql`${cashPayments.id} IS NOT NULL`), cashTotal: exact(sql`${cashPayments.amount}`),
        ...cashMethodMeasures,
        editedBookings: total(sql`${editCount} > 0`), edits: total(editCount), correctedBookings: total(sql`${correctionCount} > 0`), corrections: total(correctionCount),
        bookings: count(),
      }).from(bookings).innerJoin(invoices, eq(invoices.bookingId, bookings.id))
        .leftJoin(cashPayments, and(eq(cashPayments.bookingId, bookings.id), eq(cashPayments.status, "active")))
        .where(conditions);
      const order = query.dateBasis === "visit_date" ? [desc(bookings.date), desc(bookings.startTime), desc(bookings.id)] : [desc(bookings.createdAt), desc(bookings.id)];
      const rows = await db.select({ booking: bookings, invoice: invoices, cash: cashPayments, editCount, correctionCount }).from(bookings)
        .innerJoin(invoices, eq(invoices.bookingId, bookings.id))
        .leftJoin(cashPayments, and(eq(cashPayments.bookingId, bookings.id), eq(cashPayments.status, "active")))
        .where(conditions).orderBy(...order).limit(query.limit).offset(query.offset);
      return { summary: summary!, rows };
    },
  };
}
export type ReportRepository = ReturnType<typeof createReportRepository>;
