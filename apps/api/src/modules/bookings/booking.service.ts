import { bookingCreateSchema, bookingListQuerySchema, bookingResponseSchema } from "@just4kids/contracts";
import type { Account } from "@just4kids/contracts";
import { ForbiddenError } from "../../lib/http-error.js";
import type { BookingActor, BookingRepository } from "./booking.repository.js";

export function serializeBooking(row: NonNullable<Awaited<ReturnType<BookingRepository["get"]>>>) {
  const { booking, invoice } = row;
  const snapshots = { client: booking.clientSnapshot, address: booking.addressSnapshot, employee: booking.employeeSnapshot };
  return bookingResponseSchema.parse({
    id: booking.id, reference: booking.reference, clientId: booking.clientId, addressId: booking.addressId, employeeId: booking.employeeId,
    date: booking.date, startTime: booking.startTime, endTime: booking.endTime, timeZone: "Asia/Kuwait", adultCount: booking.adultCount, childCount: booking.childCount, specialChildCount: booking.specialChildCount, notes: booking.notes,
    seenByBarberAt: booking.seenByBarberAt ? booking.seenByBarberAt.toISOString() : null,
    source: booking.source, visitStatus: booking.visitStatus, visitVersion: booking.visitVersion, createdAt: booking.createdAt.toISOString(), ...snapshots,
    invoice: { ...invoice, reference: booking.reference, issuedAt: invoice.issuedAt.toISOString(), currency: "KWD", adultCount: booking.adultCount, childCount: booking.childCount, specialChildCount: booking.specialChildCount, notes: booking.notes, ...snapshots },
  });
}
export function createBookingService(repository: BookingRepository) {
  return {
    async create(body: unknown, actor: BookingActor) { return serializeBooking(await repository.create(bookingCreateSchema.parse(body), actor)); },
    async get(id: string, actor: Account) {
      const row = await repository.get(id);
      if (!row) return undefined;
      if (actor.role !== "admin" && actor.id !== row.booking.employeeId) throw new ForbiddenError();
      // The assigned barber opening the booking clears their "new booking" marker; the administrator never does.
      if (actor.role === "employee" && row.booking.seenByBarberAt === null) {
        const seenByBarberAt = new Date();
        await repository.markSeenByBarber(id, actor.id, seenByBarberAt);
        return serializeBooking({ booking: { ...row.booking, seenByBarberAt }, invoice: row.invoice });
      }
      return serializeBooking(row);
    },
    async list(queryInput: unknown, actor: Account) {
      const query = bookingListQuerySchema.parse(queryInput);
      const result = await repository.list(actor, query);
      return { bookings: result.rows.map(serializeBooking), total: result.total, ...query };
    },
  };
}
