import { bookingCreateSchema, bookingListQuerySchema, bookingResponseSchema, bookingWithClientCreateSchema } from "@just4kids/contracts";
import type { Account } from "@just4kids/contracts";
import { ForbiddenError, HttpError } from "../../lib/http-error.js";
import type { BookingRepository } from "./booking.repository.js";

export function serializeBooking(booking: NonNullable<Awaited<ReturnType<BookingRepository["get"]>>>) {
  const snapshots = { client: booking.clientSnapshot, address: booking.addressSnapshot, employee: booking.employeeSnapshot };
  return bookingResponseSchema.parse({
    id: booking.id, reference: booking.reference, clientId: booking.clientId, addressId: booking.addressId, employeeId: booking.employeeId,
    date: booking.date, startTime: booking.startTime, endTime: booking.endTime, timeZone: "Asia/Kuwait", adultCount: booking.adultCount, childCount: booking.childCount, specialChildCount: booking.specialChildCount, notes: booking.notes,
    seenByBarberAt: booking.seenByBarberAt ? booking.seenByBarberAt.toISOString() : null,
    visitStatus: booking.visitStatus, visitVersion: booking.visitVersion, createdAt: booking.createdAt.toISOString(), ...snapshots,
  });
}
export function createBookingService(repository: BookingRepository) {
  return {
    async create(body: unknown, accountId: string) { return serializeBooking(await repository.create(bookingCreateSchema.parse(body), accountId)); },
    async createWithClient(body: unknown, accountId: string) {
      const input = bookingWithClientCreateSchema.parse(body);
      try { return serializeBooking(await repository.createWithClient(input, accountId)); }
      catch (error) {
        const underlying = typeof error === "object" && error !== null && "cause" in error ? error.cause : error;
        if (typeof underlying === "object" && underlying !== null && "code" in underlying && underlying.code === "ER_DUP_ENTRY") throw new HttpError(409, "PHONE_ALREADY_USED", "The phone number was just registered. Check the client details again");
        throw error;
      }
    },
    async get(id: string, actor: Account) {
      const booking = await repository.get(id);
      if (!booking) return undefined;
      if (actor.role !== "admin" && actor.id !== booking.employeeId) throw new ForbiddenError();
      // The assigned barber opening the booking clears their "new booking" marker; the administrator never does.
      if (actor.role === "employee" && booking.seenByBarberAt === null) {
        const seenByBarberAt = new Date();
        await repository.markSeenByBarber(id, actor.id, seenByBarberAt, booking.visitVersion);
        return serializeBooking({ ...booking, seenByBarberAt });
      }
      return serializeBooking(booking);
    },
    async list(queryInput: unknown, actor: Account) {
      const query = bookingListQuerySchema.parse(queryInput);
      const result = await repository.list(actor, query);
      return { bookings: result.rows.map(serializeBooking), total: result.total, ...query };
    },
  };
}
