import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, bookings, invoices, bookingVisitEvents, bookingMessages } from "@just4kids/db/schema";
import type { Account, VisitStatus, VisitCorrection, VisitTransition } from "@just4kids/contracts";
import { visitCorrectionSchema, visitTransitionSchema, visitEventResponseSchema, bookingMessageResponseSchema } from "@just4kids/contracts";
import { ForbiddenError, HttpError } from "../../lib/http-error.js";
import { lockEmployee, readBlockingBookings, readWorkingHours, readTimeBlocks } from "../availability/availability.repository.js";
import { isWindowAvailable } from "../availability/availability.service.js";
import { serializeBooking } from "./booking.service.js";

type VisitActor = { kind: "account"; account: Account } | { kind: "client"; clientId: string };
const blocking = new Set<VisitStatus>(["booked", "arrived", "completed"]);
const allowed: Partial<Record<VisitStatus, VisitStatus[]>> = { booked: ["arrived", "cancelled", "no_show"], arrived: ["completed", "cancelled", "no_show"] };
// Older bookings may predate visit events; creation is still recoverable from their source, actor and timestamp.
export function serializeVisitHistory(booking: Pick<typeof bookings.$inferSelect, "id" | "source" | "createdBy" | "clientId" | "createdAt">, rows: (typeof bookingVisitEvents.$inferSelect)[]) {
  const events = rows.map(event => visitEventResponseSchema.parse({ ...event, occurredAt: event.occurredAt.toISOString() }));
  if (!events.some(event => event.fromStatus === null)) events.unshift(visitEventResponseSchema.parse({
    id: booking.id, bookingId: booking.id, version: 0, fromStatus: null, toStatus: "booked",
    actorType: booking.source === "ai" ? "client" : "admin", actorAccountId: booking.source === "ai" ? null : booking.createdBy,
    actorClientId: booking.source === "ai" ? booking.clientId : null, reason: null, correction: false,
    previousInvoiceStatus: null, invoiceStatus: "issued", occurredAt: booking.createdAt.toISOString(),
  }));
  return events;
}
export function createVisitService(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  async function change(id: string, input: VisitTransition | VisitCorrection, actor: VisitActor, correction: boolean) {
    const [identity] = await db.select({ employeeId: bookings.employeeId }).from(bookings).where(eq(bookings.id, id));
    if (!identity) throw new HttpError(404, "NOT_FOUND", "Reservation not found");
    return db.transaction(async transaction => {
      // Account/employee first, then booking/invoice: the same lock order as booking creation and schedule changes.
      const barber = await lockEmployee(transaction, identity.employeeId);
      const [booking] = await transaction.select().from(bookings).where(eq(bookings.id, id)).for("update");
      if (!barber || !booking) throw new HttpError(404, "NOT_FOUND", "Reservation not found");
      if (booking.employeeId !== identity.employeeId) throw new HttpError(409, "VISIT_CONFLICT", "The reservation changed. Reload it");
      if (actor.kind === "client") {
        if (correction || actor.clientId !== booking.clientId || input.status !== "cancelled") throw new ForbiddenError();
      } else {
        const [currentActor] = await transaction.select({ role: accounts.role }).from(accounts).where(and(eq(accounts.id, actor.account.id), eq(accounts.enabled, true)));
        if (!currentActor || currentActor.role !== actor.account.role || (actor.account.role === "employee" && actor.account.id !== booking.employeeId) || (correction && actor.account.role !== "admin")) throw new ForbiddenError();
      }
      if (booking.visitVersion !== input.expectedVersion) throw new HttpError(409, "VISIT_CONFLICT", "The visit status changed. Reload the reservation");
      const now = Date.now(), start = Date.parse(`${booking.date}T${booking.startTime}:00+03:00`), end = Date.parse(`${booking.date}T${booking.endTime}:00+03:00`);
      if (actor.kind === "client" && (booking.visitStatus !== "booked" || start <= now)) throw new HttpError(409, "CLIENT_CANCELLATION_NOT_ALLOWED", "Only a future visit that has not started can be cancelled");
      if (booking.visitStatus === input.status || (!correction && !allowed[booking.visitStatus]?.includes(input.status))) throw new HttpError(409, "INVALID_VISIT_TRANSITION", "Visit status change is not allowed");
      if (!correction && ((["arrived", "completed"].includes(input.status) && now < start) || (input.status === "no_show" && now < end))) throw new HttpError(409, "VISIT_TOO_EARLY", "It is too early to record this status");
      if (correction && blocking.has(input.status)) {
        const hours = await readWorkingHours(transaction, booking.employeeId, booking.date);
        const existing = await readBlockingBookings(transaction, booking.employeeId, booking.date);
        const blocks = await readTimeBlocks(transaction, booking.employeeId, booking.date);
        const window = { date: booking.date, startTime: booking.startTime, endTime: booking.endTime };
        if (!barber.account.enabled || !isWindowAvailable(window, hours.days, hours.exception, existing.filter(row => row.id !== booking.id).map(row => ({ ...row, status: row.visitStatus })), blocks)) throw new HttpError(409, "BARBER_UNAVAILABLE", "Cannot restore the visit because the employee is unavailable");
      }
      const [invoice] = await transaction.select().from(invoices).where(eq(invoices.bookingId, id)).for("update");
      if (!invoice) throw new Error("Booking invoice missing");
      const invoiceStatus = input.status === "cancelled" ? "cancelled" as const : "issued" as const;
      const version = booking.visitVersion + 1;
      await transaction.update(bookings).set({ visitStatus: input.status, visitVersion: version }).where(eq(bookings.id, id));
      await transaction.update(invoices).set({ status: invoiceStatus }).where(eq(invoices.id, invoice.id));
      await transaction.insert(bookingVisitEvents).values({ id: randomUUID(), bookingId: id, version, fromStatus: booking.visitStatus, toStatus: input.status,
        actorType: actor.kind === "client" ? "client" : actor.account.role, actorAccountId: actor.kind === "account" ? actor.account.id : null, actorClientId: actor.kind === "client" ? actor.clientId : null,
        reason: input.reason ?? null, correction, previousInvoiceStatus: invoice.status, invoiceStatus, occurredAt: new Date(now) });
      return serializeBooking({ booking: { ...booking, visitStatus: input.status, visitVersion: version }, invoice: { ...invoice, status: invoiceStatus } });
    });
  }
  return {
    transition: (id: string, body: unknown, account: Account) => change(id, visitTransitionSchema.parse(body), { kind: "account", account }, false),
    correct: (id: string, body: unknown, account: Account) => change(id, visitCorrectionSchema.parse(body), { kind: "account", account }, true),
    // The caller must derive clientId from an authenticated WhatsApp sender. No public client-login/action endpoint exists.
    cancelForClient: (id: string, expectedVersion: number, clientId: string, reason?: string) => change(id, visitTransitionSchema.parse({ status: "cancelled", expectedVersion, ...(reason === undefined ? {} : { reason }) }), { kind: "client", clientId }, false),
    async history(id: string, account: Account) {
      return db.transaction(async transaction => {
        const [booking] = await transaction.select().from(bookings).where(eq(bookings.id, id)).for("share");
        if (!booking) throw new HttpError(404, "NOT_FOUND", "Reservation not found");
        if (account.role !== "admin" && account.id !== booking.employeeId) throw new ForbiddenError();
        const events = await transaction.select().from(bookingVisitEvents).where(eq(bookingVisitEvents.bookingId, id)).orderBy(asc(bookingVisitEvents.version));
        const messages = await transaction.select().from(bookingMessages).where(eq(bookingMessages.bookingId, id)).orderBy(asc(bookingMessages.occurredAt));
        return {
          events: serializeVisitHistory(booking, events),
          messages: messages.map(message => bookingMessageResponseSchema.parse({ ...message, occurredAt: message.occurredAt.toISOString() })),
        };
      });
    },
  };
}
