import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, bookings, invoices, clientAddresses, bookingRevisions, cashPayments } from "@just4kids/db/schema";
import type { Account } from "@just4kids/contracts";
import { bookingEditSchema, bookingCreateSchema, bookingAddressSnapshotSchema, bookingRevisionResponseSchema } from "@just4kids/contracts";
import { ForbiddenError, HttpError } from "../../lib/http-error.js";
import { lockEmployee, readBlockingBookings, readWorkingHours, readTimeBlocks } from "../availability/availability.repository.js";
import { isWindowAvailable } from "../availability/availability.service.js";
import { assertFutureStart } from "./booking.repository.js";
import { serializeBooking } from "./booking.service.js";

export function createBookingEditService(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  return {
    async edit(id: string, body: unknown, actor: Account) {
      if (actor.role !== "admin") throw new ForbiddenError();
      const input = bookingEditSchema.parse(body);
      const [identity] = await db.select({ employeeId: bookings.employeeId }).from(bookings).where(eq(bookings.id, id));
      if (!identity) throw new HttpError(404, "NOT_FOUND", "الحجز غير موجود");
      return db.transaction(async transaction => {
        const [administrator] = await transaction.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, actor.id), eq(accounts.role, "admin"), eq(accounts.enabled, true))).for("share");
        if (!administrator) throw new ForbiddenError();
        // Always lock both barbers in stable ID order, before the booking, so opposing reassignments cannot deadlock.
        const targetId = input.employeeId ?? identity.employeeId;
        const barbers = new Map<string, NonNullable<Awaited<ReturnType<typeof lockEmployee>>>>();
        for (const employeeId of [...new Set([identity.employeeId, targetId])].sort()) {
          const barber = await lockEmployee(transaction, employeeId);
          if (!barber) throw new HttpError(404, "EMPLOYEE_NOT_FOUND", "الموظف غير موجود");
          barbers.set(employeeId, barber);
        }
        const [booking] = await transaction.select().from(bookings).where(eq(bookings.id, id)).for("update");
        if (!booking) throw new HttpError(404, "NOT_FOUND", "الحجز غير موجود");
        if (booking.employeeId !== identity.employeeId || booking.visitVersion !== input.expectedVersion) throw new HttpError(409, "BOOKING_CONFLICT", "تم تعديل الحجز، أعد تحميله");
        // A started or finished visit is a correction: it must state a reason, and it may be moved into the past.
        const correction = booking.visitStatus !== "booked" || Date.parse(`${booking.date}T${booking.startTime}:00+03:00`) <= Date.now();
        if (correction && input.reason === undefined) throw new HttpError(400, "CORRECTION_REASON_REQUIRED", "سبب التصحيح مطلوب");
        const [invoice] = await transaction.select().from(invoices).where(eq(invoices.bookingId, id)).for("update");
        if (!invoice) throw new Error("Booking invoice missing");
        const [activePayment] = invoice.paymentStatus === "paid" ? await transaction.select().from(cashPayments).where(eq(cashPayments.activeInvoiceId, invoice.id)).for("update") : [];
        if (invoice.paymentStatus === "paid" && !activePayment) throw new HttpError(409, "PAYMENT_RECORD_MISSING", "سجل النقد المدفوع غير موجود");
        if (activePayment && activePayment.amount !== invoice.total) throw new HttpError(409, "PAYMENT_CONFLICT", "سجل النقد لا يطابق الفاتورة");
        if (invoice.paymentStatus !== "paid" && input.reconciliation) throw new HttpError(409, "RECONCILIATION_NOT_ALLOWED", "تسوية النقد تتطلب فاتورة مدفوعة");
        const parsed = bookingCreateSchema.parse({ clientId: booking.clientId, addressId: input.addressId ?? booking.addressId, employeeId: targetId,
          date: input.date ?? booking.date, startTime: input.startTime ?? booking.startTime, endTime: input.endTime ?? booking.endTime,
          adultCount: input.adultCount ?? booking.adultCount, childCount: input.childCount ?? booking.childCount, specialChildCount: input.specialChildCount ?? booking.specialChildCount,
          amountCash: invoice.amountCash, amountLink: invoice.amountLink });
        // The invoice amounts are inputs to validation only; the reservation edit never changes them.
        const merged = { clientId: parsed.clientId, addressId: parsed.addressId, employeeId: parsed.employeeId, date: parsed.date, startTime: parsed.startTime, endTime: parsed.endTime, adultCount: parsed.adultCount, childCount: parsed.childCount, specialChildCount: parsed.specialChildCount };
        if (!correction) assertFutureStart(merged);
        const reassigned = targetId !== booking.employeeId;
        const windowChanged = merged.date !== booking.date || merged.startTime !== booking.startTime || merged.endTime !== booking.endTime;
        const barber = barbers.get(targetId)!;
        const employeeSnapshot = reassigned ? { id: targetId, displayName: barber.employee.displayName } : booking.employeeSnapshot;
        if (reassigned || windowChanged) {
          const hours = await readWorkingHours(transaction, targetId, merged.date);
          const existing = await readBlockingBookings(transaction, targetId, merged.date);
          const blocks = await readTimeBlocks(transaction, targetId, merged.date);
          if (!barber.account.enabled || !isWindowAvailable({ date: merged.date, startTime: merged.startTime, endTime: merged.endTime }, hours.days, hours.exception, existing.filter(row => row.id !== id).map(row => ({ ...row, status: row.visitStatus })), blocks)) throw new HttpError(409, "BARBER_UNAVAILABLE", "الموظف غير متاح خلال الفترة المحددة");
        }
        let addressSnapshot = booking.addressSnapshot;
        if (input.addressId !== undefined) {
          const [address] = await transaction.select().from(clientAddresses).where(and(eq(clientAddresses.id, merged.addressId), eq(clientAddresses.clientId, booking.clientId))).for("update");
          if (!address) throw new HttpError(404, "ADDRESS_NOT_FOUND", "العنوان غير موجود لهذا العميل");
          addressSnapshot = bookingAddressSnapshotSchema.parse({ area: address.area, block: address.block, street: address.street, houseNumber: address.houseNumber, buildingName: address.buildingName, avenue: address.avenue, gate: address.gate, blueNumber: address.blueNumber, floor: address.floor, apartment: address.apartment, instructions: address.instructions, mapsUrl: address.mapsUrl, latitude: address.latitude, longitude: address.longitude });
        }
        // The price is typed at booking time and is not changed by a reservation edit.
        if (input.reconciliation) throw new HttpError(409, "RECONCILIATION_NOT_ALLOWED", "لا يمكن تعديل مبلغ الفاتورة");
        const nextNotes = input.notes === undefined ? booking.notes : input.notes;
        // A moved or reassigned visit is new again for the barber who must (re)check it.
        const seenByBarberAt = reassigned || windowChanged ? null : booking.seenByBarberAt;
        const nextBooking = { ...booking, ...merged, notes: nextNotes, seenByBarberAt, addressSnapshot, employeeSnapshot };
        const nextInvoice = invoice;
        const before = serializeBooking({ booking, invoice });
        if (JSON.stringify(before) === JSON.stringify(serializeBooking({ booking: nextBooking, invoice: nextInvoice }))) throw new HttpError(409, "BOOKING_UNCHANGED", "لا يوجد تغيير في الحجز");
        // The existing version now covers reservation edits as well as visit actions, preventing stale actions across reassignment.
        nextBooking.visitVersion++;
        const after = serializeBooking({ booking: nextBooking, invoice: nextInvoice });
        const now = Date.now();
        if (!correction && Date.parse(`${booking.date}T${booking.startTime}:00+03:00`) <= now) throw new HttpError(409, "BOOKING_EDIT_NOT_ALLOWED", "يمكن تعديل الحجز المستقبلي غير المبدوء فقط");
        if (!correction) assertFutureStart(merged);
        await transaction.update(bookings).set({ ...merged, notes: nextNotes, seenByBarberAt, addressSnapshot, employeeSnapshot, visitVersion: nextBooking.visitVersion }).where(eq(bookings.id, id));
        const revisionId = randomUUID();
        await transaction.insert(bookingRevisions).values({ id: revisionId, bookingId: id, version: nextBooking.visitVersion, actorAccountId: actor.id, reason: input.reason ?? null, occurredAt: new Date(now), before, after });
        return after;
      });
    },
    async revisions(id: string, actor: Account) {
      return db.transaction(async transaction => {
        const [booking] = await transaction.select({ employeeId: bookings.employeeId }).from(bookings).where(eq(bookings.id, id)).for("share");
        if (!booking) throw new HttpError(404, "NOT_FOUND", "الحجز غير موجود");
        if (actor.role !== "admin" && actor.id !== booking.employeeId) throw new ForbiddenError();
        const rows = await transaction.select().from(bookingRevisions).where(eq(bookingRevisions.bookingId, id)).orderBy(asc(bookingRevisions.version));
        return { revisions: rows.map(row => bookingRevisionResponseSchema.parse({ ...row, occurredAt: row.occurredAt.toISOString() })) };
      });
    },
  };
}
