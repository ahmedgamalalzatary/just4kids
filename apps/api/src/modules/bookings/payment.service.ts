import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, bookings, invoices, cashPayments, cashPaymentEvents } from "@just4kids/db/schema";
import type { Account } from "@just4kids/contracts";
import { paymentRecordSchema, paymentUndoSchema, paymentResponseSchema, paymentEventResponseSchema } from "@just4kids/contracts";
import { ForbiddenError, HttpError } from "../../lib/http-error.js";
import { lockEmployee } from "../availability/availability.repository.js";
import { serializeBooking } from "./booking.service.js";

type PaymentRow = Omit<typeof cashPayments.$inferSelect, "activeInvoiceId">;
export function serializePayment(row: PaymentRow) { return paymentResponseSchema.parse({ id: row.id, bookingId: row.bookingId, invoiceId: row.invoiceId, originalAmount: row.originalAmount, amount: row.amount, status: row.status, recordedBy: row.recordedBy, recordedAt: row.recordedAt.toISOString(), currency: "KWD", bookingAtReceipt: row.bookingAtReceipt }); }

export function createPaymentService(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  async function change(id: string, body: unknown, actor: Account, undo: boolean) {
    if (undo && actor.role !== "admin") throw new ForbiddenError();
    const undoInput = undo ? paymentUndoSchema.parse(body) : undefined;
    const input = undoInput ?? paymentRecordSchema.parse(body);
    const [identity] = await db.select({ employeeId: bookings.employeeId }).from(bookings).where(eq(bookings.id, id));
    if (!identity) throw new HttpError(404, "NOT_FOUND", "الحجز غير موجود");
    return db.transaction(async transaction => {
      if (actor.role === "admin") {
        const [administrator] = await transaction.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, actor.id), eq(accounts.role, "admin"), eq(accounts.enabled, true))).for("share");
        if (!administrator) throw new ForbiddenError();
      }
      const barber = await lockEmployee(transaction, identity.employeeId);
      const [booking] = await transaction.select().from(bookings).where(eq(bookings.id, id)).for("update");
      if (!barber || !booking) throw new HttpError(404, "NOT_FOUND", "الحجز غير موجود");
      if (actor.role !== "admin" && (actor.id !== booking.employeeId || !barber.account.enabled)) throw new ForbiddenError();
      if (booking.employeeId !== identity.employeeId || booking.visitVersion !== input.expectedVersion) throw new HttpError(409, "PAYMENT_CONFLICT", "تم تعديل الحجز أو الدفع، أعد تحميله");
      const [invoice] = await transaction.select().from(invoices).where(eq(invoices.bookingId, id)).for("update");
      if (!invoice) throw new Error("Booking invoice missing");
      const activeQuery = transaction.select().from(cashPayments).where(eq(cashPayments.activeInvoiceId, invoice.id));
      // The invoice lock already serializes receipts. Avoid locking a missing unique-index key before inserting a first receipt.
      const [active] = await (invoice.paymentStatus === "paid" ? activeQuery.for("update") : activeQuery);
      const version = booking.visitVersion + 1, now = new Date(Date.now());
      if (undoInput) {
        if (!active || active.id !== undoInput.paymentId || invoice.paymentStatus !== "paid" || active.amount !== invoice.total) throw new HttpError(409, "PAYMENT_CONFLICT", "سجل الدفع الحالي لا يطابق التصحيح");
        const before = serializePayment(active), payment = serializePayment({ ...active, status: "voided" });
        const nextBooking = serializeBooking({ booking: { ...booking, visitVersion: version }, invoice: { ...invoice, paymentStatus: "unpaid" } });
        await transaction.update(cashPayments).set({ status: "voided" }).where(eq(cashPayments.id, active.id));
        await transaction.update(invoices).set({ paymentStatus: "unpaid" }).where(eq(invoices.id, invoice.id));
        await transaction.update(bookings).set({ visitVersion: version }).where(eq(bookings.id, id));
        await transaction.insert(cashPaymentEvents).values({ id: randomUUID(), bookingId: id, paymentId: active.id, version, revisionId: null, kind: "voided", amount: active.amount, actorAccountId: actor.id, reason: undoInput.reason, occurredAt: now, before, after: payment });
        return { booking: nextBooking, payment };
      }
      if (invoice.paymentStatus === "paid" || active) throw new HttpError(409, "PAYMENT_ALREADY_RECORDED", "تم تسجيل الدفع بالفعل");
      if (invoice.status !== "issued" || !["arrived", "completed"].includes(booking.visitStatus)) throw new HttpError(409, "PAYMENT_NOT_ALLOWED", "يمكن تسجيل النقد بعد الوصول أو إتمام الزيارة فقط");
      const nextBooking = serializeBooking({ booking: { ...booking, visitVersion: version }, invoice: { ...invoice, paymentStatus: "paid" } });
      const row = { id: randomUUID(), bookingId: id, invoiceId: invoice.id, originalAmount: invoice.total, amount: invoice.total, status: "active" as const, recordedBy: actor.id, recordedAt: now, bookingAtReceipt: nextBooking };
      const payment = serializePayment(row);
      await transaction.insert(cashPayments).values(row);
      await transaction.update(invoices).set({ paymentStatus: "paid" }).where(eq(invoices.id, invoice.id));
      await transaction.update(bookings).set({ visitVersion: version }).where(eq(bookings.id, id));
      await transaction.insert(cashPaymentEvents).values({ id: randomUUID(), bookingId: id, paymentId: row.id, version, revisionId: null, kind: "recorded", amount: invoice.total, actorAccountId: actor.id, reason: null, occurredAt: now, before: null, after: payment });
      return { booking: nextBooking, payment };
    });
  }
  return {
    record: (id: string, body: unknown, actor: Account) => change(id, body, actor, false),
    undo: (id: string, body: unknown, actor: Account) => change(id, body, actor, true),
    async details(id: string, actor: Account) {
      return db.transaction(async transaction => {
        const [booking] = await transaction.select({ employeeId: bookings.employeeId }).from(bookings).where(eq(bookings.id, id)).for("share");
        if (!booking) throw new HttpError(404, "NOT_FOUND", "الحجز غير موجود");
        if (actor.role !== "admin" && actor.id !== booking.employeeId) throw new ForbiddenError();
        const rows = await transaction.select().from(cashPayments).where(eq(cashPayments.bookingId, id)).orderBy(asc(cashPayments.recordedAt), asc(cashPayments.id));
        const events = await transaction.select().from(cashPaymentEvents).where(eq(cashPaymentEvents.bookingId, id)).orderBy(asc(cashPaymentEvents.version));
        const payments = rows.map(serializePayment);
        return { payment: payments.find(payment => payment.status === "active") ?? null, payments, events: events.map(event => paymentEventResponseSchema.parse({ ...event, occurredAt: event.occurredAt.toISOString() })) };
      });
    },
  };
}
