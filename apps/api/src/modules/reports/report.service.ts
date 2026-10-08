import { haircutReportQuerySchema, haircutReportResponseSchema, reservationReportQuerySchema, reservationReportResponseSchema } from "@just4kids/contracts";
import type { Account, HaircutReportQuery } from "@just4kids/contracts";
import { ForbiddenError } from "../../lib/http-error.js";
import { serializeBooking } from "../bookings/booking.service.js";
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
  };
}
