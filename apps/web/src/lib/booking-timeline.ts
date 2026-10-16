import type { BookingMessage, BookingRevision, VisitEvent } from "@/lib/api/types";
import type { BookingTrackingResponse } from "@just4kids/contracts";
import { visitStatusLabels } from "@/components/status";
import { formatAddress } from "@/lib/address";
import { formatDate, formatWindow } from "@/lib/kuwait-time";

// Labels for the "message to the barber" events the booking history shows alongside visit events.
export const messageKindLabels: Record<BookingMessage["kind"], string> = { sent_to_barber: "Sent to barber" };

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
  return event.fromStatus === null ? `Reservation created: ${visitStatusLabels[event.toStatus]}` : `${event.correction ? "Correction: " : ""}${visitStatusLabels[event.fromStatus]} → ${visitStatusLabels[event.toStatus]}`;
}

const actorRoleLabels = { admin: "Administrator", employee: "barber", client: "client", system: "System" };

/** Keeps the API's booking/time order and uses the same labels and change details as per-booking history. */
export function trackingGroups(data: BookingTrackingResponse) {
  return data.bookings.map(group => ({
    booking: group.booking,
    events: group.events.map(entry => {
      const common = { at: entry.at, actor: entry.actor.name, role: actorRoleLabels[entry.actor.role] };
      switch (entry.type) {
        case "visit": return { ...common, key: `visit-${entry.event.id}`, title: visitEventTitle(entry.event), reason: entry.event.reason, details: [] };
        case "message": return { ...common, key: `message-${entry.message.id}`, title: messageKindLabels[entry.message.kind], reason: null, details: [] };
        case "revision": return { ...common, key: `revision-${entry.revision.id}`, title: "Edit reservation", reason: entry.revision.reason, details: revisionChanges(entry.revision) };
      }
    }),
  }));
}

export function revisionChanges(revision: BookingRevision): string[] {
  const { before, after } = revision;
  const changes: string[] = [];
  if (before.date !== after.date || before.startTime !== after.startTime || before.endTime !== after.endTime) {
    changes.push(`Appointment: from ${formatDate(before.date)} ${formatWindow(before.startTime, before.endTime)} to ${formatDate(after.date)} ${formatWindow(after.startTime, after.endTime)}`);
  }
  if (before.employee.id !== after.employee.id) changes.push(`Barber: from ${before.employee.displayName} to ${after.employee.displayName}`);
  if (formatAddress(before.address) !== formatAddress(after.address)) changes.push(`Address: ${formatAddress(after.address)}`);
  if (before.adultCount !== after.adultCount || before.childCount !== after.childCount || before.specialChildCount !== after.specialChildCount) {
    changes.push(`Count: from ${before.adultCount} adult${before.adultCount === 1 ? "" : "s"} and ${before.childCount} children (${before.specialChildCount} special needs) to ${after.adultCount} adult${after.adultCount === 1 ? "" : "s"} and ${after.childCount} children (${after.specialChildCount} special needs)`);
  }
  if (before.notes !== after.notes) changes.push(`Notes: from ${before.notes ?? "None"} to ${after.notes ?? "None"}`);
  return changes;
}
