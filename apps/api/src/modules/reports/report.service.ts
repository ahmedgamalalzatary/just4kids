import { branchReportQuerySchema, branchReportResponseSchema, employeeReportQuerySchema, employeeReportResponseSchema, haircutReportQuerySchema, haircutReportResponseSchema, reservationReportQuerySchema, reservationReportResponseSchema } from "@just4kids/contracts";
import type { Account, HaircutReportQuery } from "@just4kids/contracts";
import { ForbiddenError } from "../../lib/http-error.js";
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
      const work = new Map((await repository.performance(query, ["branchId"])).map(row => [row.branchId, row]));
      const split = await repository.performance(query, ["branchId", "employeeId"]);
      const names = new Map((await repository.employees(query.employeeId)).map(person => [person.employeeId, person.displayName]));
      // Administrators compare every branch; an employee sees only branches holding their own matching work.
      const places = (await repository.branches(query.branchId)).filter(place => actor.role === "admin" || work.has(place.branchId));
      return branchReportResponseSchema.parse({
        dateBasis: query.dateBasis, timeZone: "Asia/Kuwait",
        branches: places.map(place => ({
          ...place, ...shapePerformance(work.get(place.branchId)),
          employees: split.filter(row => row.branchId === place.branchId).map(row => ({ employeeId: row.employeeId, displayName: names.get(row.employeeId) ?? "", ...shapePerformance(row) }))
            .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar") || left.employeeId.localeCompare(right.employeeId)),
        })),
      });
    },
  };
}
