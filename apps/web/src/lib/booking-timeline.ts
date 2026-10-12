import type { BookingMessage, VisitEvent } from "@/lib/api/types";

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
