import type { VisitStatus } from "@just4kids/contracts";
import { kuwaitInstant } from "./kuwait-time";

// Mirrors the backend's confirmed workflow so the UI only offers actions the server can accept.
// The server stays authoritative and rechecks every rule.

type BookingTiming = { date: string; startTime: string; endTime: string; visitStatus: VisitStatus };
export type VisitAction = { status: "arrived" | "completed" | "no_show" | "cancelled"; allowed: boolean };

export function visitActions(booking: BookingTiming, now: Date = new Date()): VisitAction[] {
  const started = now >= kuwaitInstant(booking.date, booking.startTime);
  const ended = now >= kuwaitInstant(booking.date, booking.endTime);
  if (booking.visitStatus === "booked") return [{ status: "arrived", allowed: started }, { status: "no_show", allowed: ended }, { status: "cancelled", allowed: true }];
  if (booking.visitStatus === "arrived") return [{ status: "completed", allowed: started }, { status: "no_show", allowed: ended }, { status: "cancelled", allowed: true }];
  return [];
}

// A started or finished visit is no longer a plain edit; the administrator corrects it with a reason.
export function isCorrection(booking: BookingTiming, now: Date = new Date()): boolean {
  return booking.visitStatus !== "booked" || now >= kuwaitInstant(booking.date, booking.startTime);
}

export function canEditBooking(booking: BookingTiming, now: Date = new Date()): boolean {
  return !isCorrection(booking, now);
}

/** The "new booking" marker is for the assigned barber only, until they first open the booking. */
export function isNewForBarber(booking: { seenByBarberAt: string | null }, isAdmin: boolean): boolean {
  return !isAdmin && booking.seenByBarberAt === null;
}
