import { bookingMessageResponseSchema, bookingRevisionResponseSchema, bookingTrackingQuerySchema, bookingTrackingResponseSchema, clientReportQuerySchema, clientReportResponseSchema, comprehensiveReportQuerySchema, comprehensiveReportResponseSchema, employeeReportQuerySchema, employeeReportResponseSchema, haircutReportQuerySchema, haircutReportResponseSchema, invoiceReportQuerySchema, invoiceReportResponseSchema, reservationReportQuerySchema, reservationReportResponseSchema, trackingPeriod } from "@just4kids/contracts";
import type { Account, BookingTrackingEvent, HaircutReportQuery } from "@just4kids/contracts";
import { ForbiddenError } from "../../lib/http-error.js";
import { fils, money } from "../bookings/booking.repository.js";
import { serializeBooking } from "../bookings/booking.service.js";
import { serializeVisitHistory } from "../bookings/visit.service.js";
import { scheduledMinutes, shapePerformance } from "./report.repository.js";
import type { ReportRepository } from "./report.repository.js";

// Employees report only on reservations currently assigned to them, the same records they may open directly.
function scope<Query extends HaircutReportQuery>(query: Query, actor: Account): Query {
  if (actor.role === "admin") return query;
  if (query.employeeId !== undefined && query.employeeId !== actor.id) throw new ForbiddenError();
  return { ...query, employeeId: actor.id };
}

type CollectionRow = { cashCount: number; cashTotal: string; linkCount: number; linkTotal: string; knetCount: number; knetTotal: string; count: number; total: string };
// The barber and comprehensive money measures come from the administrator's daily collections.
function collectionCash(row: CollectionRow | undefined) {
  return {
    count: row?.count ?? 0, total: row?.total ?? "0.000",
    byMethod: {
      cash: { count: row?.cashCount ?? 0, total: row?.cashTotal ?? "0.000" },
      link: { count: row?.linkCount ?? 0, total: row?.linkTotal ?? "0.000" },
      knet: { count: row?.knetCount ?? 0, total: row?.knetTotal ?? "0.000" },
    },
  };
}

// Daily collections carry only a barber and a day, so they follow the period and barber filters and nothing else.
function collectionsFollow(query: HaircutReportQuery & { paymentStatus?: string | undefined }) {
  return !query.clientId && !query.status && !query.source && !query.q && !query.paymentStatus;
}

export function createReportService(repository: ReportRepository) {
  return {
    async tracking(queryInput: unknown) {
      const parsed = bookingTrackingQuerySchema.parse(queryInput);
      // Never open-ended: a missing period becomes the current week, and a lone bound a 7-day week.
      const query = { ...parsed, ...trackingPeriod(parsed) };
      const data = await repository.tracking(query);
      const accounts = new Map(data.actors.map(actor => [actor.id, actor]));
      const clients = new Map(data.clients.map(client => [client.id, client.phone]));
      const byBooking = <Row extends { bookingId: string }>(rows: Row[]) => {
        const groups = new Map<string, Row[]>();
        for (const row of rows) { const group = groups.get(row.bookingId); if (group) group.push(row); else groups.set(row.bookingId, [row]); }
        return groups;
      };
      const visits = byBooking(data.visits), revisions = byBooking(data.revisions), paymentEvents = byBooking(data.payments), receipts = byBooking(data.receipts), messages = byBooking(data.messages);
      const actor = (id: string | null, role?: BookingTrackingEvent["actor"]["role"]): BookingTrackingEvent["actor"] => {
        const account = id ? accounts.get(id) : undefined;
        const kind = role ?? account?.role ?? "system";
        const name = kind === "client" ? (id ? clients.get(id) : undefined) ?? "Client" : kind === "admin" ? "Administrator" : kind === "system" ? "System" : account?.name ?? "Another account";
        return { id, name, role: kind };
      };
      return bookingTrackingResponseSchema.parse({
        dateBasis: "visit_date", timeZone: "Asia/Kuwait",
        bookings: data.rows.map(row => {
          const id = row.booking.id;
          const entries: { value: BookingTrackingEvent; version: number; id: string }[] = [];
          const add = (value: BookingTrackingEvent, id: string, version = Number.MAX_SAFE_INTEGER) => entries.push({ value, id, version });
          for (const event of serializeVisitHistory(row.booking, visits.get(id) ?? [])) {
            add({ type: "visit", at: event.occurredAt, actor: actor(event.actorAccountId ?? event.actorClientId, event.actorType), event }, event.id, event.version);
          }
          for (const revision of revisions.get(id) ?? []) {
            add({ type: "revision", at: revision.occurredAt.toISOString(), actor: actor(revision.actorAccountId), revision: bookingRevisionResponseSchema.parse({ ...revision, occurredAt: revision.occurredAt.toISOString() }) }, revision.id, revision.version);
          }
          const payments = paymentEvents.get(id) ?? [];
          for (const payment of payments) {
            add({ type: "payment", at: payment.occurredAt.toISOString(), actor: actor(payment.actorAccountId), payment: { id: payment.id, paymentId: payment.paymentId, kind: payment.kind, method: payment.method, amount: payment.amount, reason: payment.reason } }, payment.id, payment.version);
          }
          for (const receipt of receipts.get(id) ?? []) {
            if (!payments.some(event => event.paymentId === receipt.id && event.kind === "recorded")) add({ type: "payment", at: receipt.recordedAt.toISOString(), actor: actor(receipt.recordedBy), payment: { id: receipt.id, paymentId: receipt.id, kind: "recorded", method: receipt.method, amount: receipt.originalAmount, reason: null } }, receipt.id);
          }
          for (const message of messages.get(id) ?? []) {
            add({ type: "message", at: message.occurredAt.toISOString(), actor: actor(message.actorAccountId), message: bookingMessageResponseSchema.parse({ ...message, occurredAt: message.occurredAt.toISOString() }) }, message.id);
          }
          entries.sort((left, right) => Date.parse(left.value.at) - Date.parse(right.value.at) || left.version - right.version || left.value.type.localeCompare(right.value.type) || left.id.localeCompare(right.id));
          return { booking: serializeBooking(row), events: entries.map(entry => entry.value) };
        }),
      });
    },
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
      const work = new Map((await repository.performance(query)).map(row => [row.employeeId, row]));
      const collected = collectionsFollow(query) ? new Map((await repository.collectionSums(query)).map(row => [row.employeeId, row])) : null;
      const people = await repository.employees(query.employeeId);
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
          return { ...person, availableMinutes, ...shapePerformance(work.get(person.employeeId)), cash: collected ? collectionCash(collected.get(person.employeeId)) : null };
        }),
      });
    },
    async clients(queryInput: unknown, actor: Account) {
      const query = scope(clientReportQuerySchema.parse(queryInput), actor);
      const rows = await repository.clients(query);
      return clientReportResponseSchema.parse({
        dateBasis: query.dateBasis, timeZone: "Asia/Kuwait",
        clients: rows.map(row => ({ clientId: row.clientId, phone: row.phone, ...shapePerformance(row) })),
      });
    },
    async comprehensive(queryInput: unknown) {
      const query = comprehensiveReportQuerySchema.parse(queryInput);
      const { barbers, salon } = await repository.comprehensive(query);
      const addMoney = (left: { count: number; total: string }, right: { count: number; total: string }) => ({ count: left.count + right.count, total: money(fils(left.total) + fils(right.total)) });
      const shaped = barbers.map(row => ({
        employeeId: row.employeeId, displayName: row.displayName, enabled: row.enabled,
        cash: { count: row.cashCount, total: row.cashTotal }, link: { count: row.linkCount, total: row.linkTotal },
        knet: { count: row.knetCount, total: row.knetTotal }, collected: { count: row.count, total: row.total },
      }));
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
      const collected = collectionsFollow(query) ? await repository.collectionTotals(query) : null;
      return invoiceReportResponseSchema.parse({
        dateBasis: query.dateBasis, timeZone: "Asia/Kuwait",
        summary: {
          invoices: { issued: { count: summary.issuedCount, total: summary.issuedTotal }, cancelled: { count: summary.cancelledCount, total: summary.cancelledTotal }, outstanding: { count: summary.outstandingCount, total: summary.outstandingTotal } },
          cash: collected ? collectionCash(collected) : null,
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
