import { branchReportQuerySchema, branchReportResponseSchema, clientReportQuerySchema, clientReportResponseSchema, comprehensiveReportQuerySchema, comprehensiveReportResponseSchema, employeeReportQuerySchema, employeeReportResponseSchema, haircutReportQuerySchema, haircutReportResponseSchema, invoiceReportQuerySchema, invoiceReportResponseSchema, reservationReportQuerySchema, reservationReportResponseSchema } from "@just4kids/contracts";
import type { Account, HaircutReportQuery } from "@just4kids/contracts";
import { ForbiddenError } from "../../lib/http-error.js";
import { fils, money } from "../bookings/booking.repository.js";
import { serializeBooking } from "../bookings/booking.service.js";
import { scheduledMinutes, shapePerformance } from "./report.repository.js";
import type { ReportRepository } from "./report.repository.js";

// Employees report only on reservations currently assigned to them, the same records they may open directly.
function scope<Query extends HaircutReportQuery>(query: Query, actor: Account): Query {
  if (actor.role === "admin") return query;
  if (query.employeeId !== undefined && query.employeeId !== actor.id) throw new ForbiddenError();
  return { ...query, employeeId: actor.id };
}

export function createReportService(repository: ReportRepository) {
  return {
    async reservations(queryInput: unknown, actor: Account) {
      const query = scope(reservationReportQuerySchema.parse(queryInput), actor);
      const { summary, rows } = await repository.reservations(query);
      return reservationReportResponseSchema.parse({
        dateBasis: query.dateBasis, timeZone: "Asia/Kuwait",
        summary: {
          bookings: summary.bookings, statuses: { booked: summary.booked, arrived: summary.arrived, completed: summary.completed, cancelled: summary.cancelled, no_show: summary.noShow },
          sources: { manual: summary.manual, ai: summary.ai },
          editedBookings: summary.editedBookings, edits: summary.edits, correctedBookings: summary.correctedBookings, corrections: summary.corrections,
        },
        bookings: rows.map(row => ({ ...serializeBooking(row), editCount: row.editCount, correctionCount: row.correctionCount })),
        total: summary.bookings, limit: query.limit, offset: query.offset,
      });
    },
    async haircuts(queryInput: unknown, actor: Account) {
      const query = scope(haircutReportQuerySchema.parse(queryInput), actor);
      return haircutReportResponseSchema.parse({ dateBasis: query.dateBasis, timeZone: "Asia/Kuwait", ...await repository.haircuts(query) });
    },
    async employees(queryInput: unknown, actor: Account) {
      const query = scope(employeeReportQuerySchema.parse(queryInput), actor);
      const work = new Map((await repository.performance(query, ["employeeId"])).map(row => [row.employeeId, row]));
      // With a branch filter, list barbers currently in that branch and any barber whose recorded work there matches.
      const people = (await repository.employees(query.employeeId)).filter(person => !query.branchId || person.branchId === query.branchId || work.has(person.employeeId));
      const range = query.dateBasis === "visit_date" && query.from && query.to ? { from: query.from, to: query.to } : undefined;
      const schedules = range ? await repository.schedules(people.map(person => person.employeeId), range.from, range.to) : undefined;
      return employeeReportResponseSchema.parse({
        dateBasis: query.dateBasis, timeZone: "Asia/Kuwait",
        employees: people.map(person => {
          let availableMinutes = null;
          if (range && schedules) {
            const exceptions = new Map<string, { startTime: string; endTime: string }[]>();
            for (const row of schedules.exceptions.filter(exception => exception.employeeId === person.employeeId)) {
              const intervals = exceptions.get(row.date) ?? [];
              if (row.startTime && row.endTime) intervals.push({ startTime: row.startTime, endTime: row.endTime });
              exceptions.set(row.date, intervals);
            }
            availableMinutes = scheduledMinutes(range.from, range.to, schedules.weekly.filter(interval => interval.employeeId === person.employeeId), exceptions);
          }
          return { ...person, availableMinutes, ...shapePerformance(work.get(person.employeeId)) };
        }),
      });
    },
    async branches(queryInput: unknown, actor: Account) {
      const query = scope(branchReportQuerySchema.parse(queryInput), actor);
      type Performance = NonNullable<Parameters<typeof shapePerformance>[0]>;
      const work = new Map<string | null, Performance>((await repository.performance(query, ["branchId"])).map(row => [row.branchId, row]));
      const split = await repository.performance(query, ["branchId", "employeeId"]);
      const names = new Map((await repository.employees(query.employeeId)).map(person => [person.employeeId, person.displayName]));
      // Administrators compare every branch; an employee sees only branches holding their own matching work.
      const places = (await repository.branches(query.branchId)).filter(place => actor.role === "admin" || work.has(place.branchId));
      const unassigned = work.get(null);
      // Branches are optional now; work on branchless reservations is grouped under a "no branch" row.
      const rows = [
        ...places.map(place => ({ branchId: place.branchId as string | null, branchName: place.branchName as string, info: work.get(place.branchId) })),
        ...(unassigned ? [{ branchId: null, branchName: "بدون فرع", info: unassigned }] : []),
      ];
      return branchReportResponseSchema.parse({
        dateBasis: query.dateBasis, timeZone: "Asia/Kuwait",
        branches: rows.map(row => ({
          branchId: row.branchId, branchName: row.branchName, ...shapePerformance(row.info),
          employees: split.filter(item => item.branchId === row.branchId).map(item => ({ employeeId: item.employeeId, displayName: names.get(item.employeeId) ?? "", ...shapePerformance(item) }))
            .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar") || left.employeeId.localeCompare(right.employeeId)),
        })),
      });
    },
    async clients(queryInput: unknown, actor: Account) {
      const query = scope(clientReportQuerySchema.parse(queryInput), actor);
      const rows = await repository.clients(query);
      return clientReportResponseSchema.parse({
        dateBasis: query.dateBasis, timeZone: "Asia/Kuwait",
        clients: rows.map(row => ({ clientId: row.clientId, name: row.name, phone: row.phone, ...shapePerformance(row) })),
      });
    },
    async comprehensive(queryInput: unknown) {
      const query = comprehensiveReportQuerySchema.parse(queryInput);
      const { barbers, salon } = await repository.comprehensive(query);
      const addMoney = (left: { count: number; total: string }, right: { count: number; total: string }) => ({ count: left.count + right.count, total: money(fils(left.total) + fils(right.total)) });
      const shaped = barbers.map(row => {
        const cash = shapePerformance(row).cash;
        return { employeeId: row.employeeId, displayName: row.displayName, enabled: row.enabled, cash: cash.byMethod.cash, link: cash.byMethod.link, knet: cash.byMethod.knet, collected: { count: cash.count, total: cash.total } };
      });
      const salonRow = { cash: { count: salon.cashCount, total: salon.cashTotal }, link: { count: salon.linkCount, total: salon.linkTotal }, knet: { count: salon.knetCount, total: salon.knetTotal }, collected: { count: salon.count, total: salon.total } };
      const zero = { cash: { count: 0, total: "0.000" }, link: { count: 0, total: "0.000" }, knet: { count: 0, total: "0.000" }, collected: { count: 0, total: "0.000" } };
      const totals = [...shaped, salonRow].reduce((accumulator, row) => ({ cash: addMoney(accumulator.cash, row.cash), link: addMoney(accumulator.link, row.link), knet: addMoney(accumulator.knet, row.knet), collected: addMoney(accumulator.collected, row.collected) }), zero);
      // Kotlin-style percentage with one decimal, guarded against an empty period.
      const share = (total: string) => totals.collected.total === "0.000" ? 0 : Math.round((Number(fils(total)) / Number(fils(totals.collected.total))) * 1000) / 10;
      return comprehensiveReportResponseSchema.parse({
        timeZone: "Asia/Kuwait",
        barbers: shaped.map(row => ({ ...row, share: share(row.collected.total) })),
        salon: { ...salonRow, share: share(salonRow.collected.total) },
        totals,
      });
    },
    async invoices(queryInput: unknown, actor: Account) {
      const query = scope(invoiceReportQuerySchema.parse(queryInput), actor);
      const { summary, rows } = await repository.invoiceList(query);
      return invoiceReportResponseSchema.parse({
        dateBasis: query.dateBasis, timeZone: "Asia/Kuwait",
        summary: {
          invoices: { issued: { count: summary.issuedCount, total: summary.issuedTotal }, cancelled: { count: summary.cancelledCount, total: summary.cancelledTotal }, outstanding: { count: summary.outstandingCount, total: summary.outstandingTotal } },
          cash: {
            count: summary.cashCount, total: summary.cashTotal,
            byMethod: {
              cash: { count: summary.byMethodCashCount, total: summary.byMethodCashTotal },
              link: { count: summary.byMethodLinkCount, total: summary.byMethodLinkTotal },
              knet: { count: summary.byMethodKnetCount, total: summary.byMethodKnetTotal },
            },
          },
          editedBookings: summary.editedBookings, edits: summary.edits, correctedBookings: summary.correctedBookings, corrections: summary.corrections,
        },
        invoices: rows.map(row => {
          const { booking, invoice, cash } = row;
          const snapshots = { client: booking.clientSnapshot, address: booking.addressSnapshot, employee: booking.employeeSnapshot };
          return {
            id: invoice.id, bookingId: booking.id, reference: booking.reference, issuedAt: invoice.issuedAt.toISOString(), currency: "KWD",
            status: invoice.status, paymentStatus: invoice.paymentStatus,
            adultCount: booking.adultCount, childCount: booking.childCount, specialChildCount: booking.specialChildCount,
            amountCash: invoice.amountCash, amountLink: invoice.amountLink, total: invoice.total,
            date: booking.date, startTime: booking.startTime, endTime: booking.endTime, visitStatus: booking.visitStatus, source: booking.source,
            editCount: row.editCount, correctionCount: row.correctionCount,
            cash: cash ? { amount: cash.amount, status: cash.status, method: cash.method, recordedAt: cash.recordedAt.toISOString(), recordedBy: cash.recordedBy } : null,
            ...snapshots,
          };
        }),
        total: summary.bookings, limit: query.limit, offset: query.offset,
      });
    },
  };
}
