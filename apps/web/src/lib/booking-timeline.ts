import type { BookingMessage, BookingRevision, PaymentEvent, VisitEvent } from "@/lib/api/types";
import type { BookingTrackingResponse } from "@just4kids/contracts";
import { visitStatusLabels } from "@/components/status";
import { formatAddress } from "@/lib/address";
import { formatDate, formatWindow } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { paymentMethodLabels } from "@/lib/payments";

// Labels for the "message to the barber" events the booking history shows alongside visit events.
export const messageKindLabels: Record<BookingMessage["kind"], string> = { sent_to_barber: "أُرسل للحلاق" };

export type TimelineEntry =
  | { type: "visit"; at: string; event: VisitEvent }
  | { type: "message"; at: string; message: BookingMessage };

/** Merges visit events and sent messages into one oldest-first timeline for the booking history. */
export function buildTimeline(events: VisitEvent[], messages: BookingMessage[]): TimelineEntry[] {
  return [
    ...events.map(event => ({ type: "visit" as const, at: event.occurredAt, event })),
    ...messages.map(message => ({ type: "message" as const, at: message.occurredAt, message })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function visitEventTitle(event: VisitEvent) {
  return event.fromStatus === null ? `أُنشئ الحجز: ${visitStatusLabels[event.toStatus]}` : `${event.correction ? "تصحيح: " : ""}${visitStatusLabels[event.fromStatus]} ← ${visitStatusLabels[event.toStatus]}`;
}

const actorRoleLabels = { admin: "مدير", employee: "حلاق", client: "عميل", system: "النظام" };

/** Keeps the API's booking/time order and uses the same labels and change details as per-booking history. */
export function trackingGroups(data: BookingTrackingResponse) {
  return data.bookings.map(group => ({
    booking: group.booking,
    events: group.events.map(entry => {
      const common = { at: entry.at, actor: entry.actor.name, role: actorRoleLabels[entry.actor.role] };
      switch (entry.type) {
        case "visit": return { ...common, key: `visit-${entry.event.id}`, title: visitEventTitle(entry.event), reason: entry.event.reason, details: entry.event.previousInvoiceStatus && entry.event.previousInvoiceStatus !== entry.event.invoiceStatus ? [`الفاتورة: ${entry.event.invoiceStatus === "cancelled" ? "أُلغيت" : "أُعيد إصدارها"}`] : [] };
        case "message": return { ...common, key: `message-${entry.message.id}`, title: messageKindLabels[entry.message.kind], reason: null, details: [] };
        case "revision": return { ...common, key: `revision-${entry.revision.id}`, title: "تعديل الحجز", reason: entry.revision.reason, details: revisionChanges(entry.revision) };
        case "payment": return { ...common, key: `payment-${entry.payment.id}`, title: `${paymentKinds[entry.payment.kind]}: ${formatKwd(entry.payment.amount)} (${paymentMethodLabels[entry.payment.method]})`, reason: entry.payment.reason, details: [] };
      }
    }),
  }));
}

export function revisionChanges(revision: BookingRevision): string[] {
  const { before, after } = revision;
  const changes: string[] = [];
  if (before.date !== after.date || before.startTime !== after.startTime || before.endTime !== after.endTime) {
    changes.push(`الموعد: من ${formatDate(before.date)} ${formatWindow(before.startTime, before.endTime)} إلى ${formatDate(after.date)} ${formatWindow(after.startTime, after.endTime)}`);
  }
  if (before.employee.id !== after.employee.id) changes.push(`الحلاق: من ${before.employee.displayName} إلى ${after.employee.displayName}`);
  if (formatAddress(before.address) !== formatAddress(after.address) || before.address.instructions !== after.address.instructions) changes.push(`العنوان: ${formatAddress(after.address)}`);
  if (before.adultCount !== after.adultCount || before.childCount !== after.childCount || before.specialChildCount !== after.specialChildCount) {
    changes.push(`العدد: من ${before.adultCount} بالغ و${before.childCount} طفل (${before.specialChildCount} احتياج خاص) إلى ${after.adultCount} بالغ و${after.childCount} طفل (${after.specialChildCount} احتياج خاص)`);
  }
  if (before.notes !== after.notes) changes.push(`الملاحظات: من «${before.notes ?? "لا شيء"}» إلى «${after.notes ?? "لا شيء"}»`);
  if (before.invoice.total !== after.invoice.total) changes.push(`الإجمالي: من ${formatKwd(before.invoice.total)} إلى ${formatKwd(after.invoice.total)}`);
  return changes;
}

export const paymentKinds: Record<PaymentEvent["kind"], string> = {
  recorded: "تسجيل دفع كامل",
  voided: "إلغاء قيد دفع خاطئ",
  extra_cash: "استلام مبلغ إضافي بعد تعديل",
  refund: "إرجاع مبلغ للعميل بعد تعديل",
};
