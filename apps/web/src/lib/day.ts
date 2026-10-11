import type { VisitStatus } from "@just4kids/contracts";
import { formatAddress, mapLink } from "./address";
import { formatDate, formatWindow, kuwaitInstant, minuteOfDay } from "./kuwait-time";
import { fromFils, toFils } from "./money";

// Helpers for the day views: barber time pills, the WhatsApp hand-off, cancel reasons, and today's totals.

export const SLOT_MINUTES = 30;
/** Visit lengths offered with the time pills; the API accepts 20 minutes to 4 hours. */
export const durationOptions = [30, 60, 90, 120, 150, 180, 210, 240] as const;

// Visits that still hold the barber's time, exactly as the API checks availability.
const blocking = new Set<VisitStatus>(["booked", "arrived", "completed"]);
const open = new Set<VisitStatus>(["booked", "arrived"]);

type Interval = { startTime: string; endTime: string };
type ScheduleLike = { days: { dayOfWeek: number; intervals: Interval[] }[]; exceptions: { date: string; intervals: Interval[] }[] };
type Visit = Interval & { visitStatus: VisitStatus };

export type SlotState = "free" | "booked" | "past" | "blocked";
export type Slot<T extends Visit> = { startTime: string; endTime: string; state: SlotState; booking?: T };

function timeOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The working intervals for one date: the dated exception when present (empty = closed), otherwise the weekday hours. */
export function workingIntervals(schedule: ScheduleLike, date: string): Interval[] {
  const exception = schedule.exceptions.find(item => item.date === date);
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const intervals = exception?.intervals ?? schedule.days.find(day => day.dayOfWeek === weekday)?.intervals ?? [];
  return [...intervals].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function covered(intervals: Interval[], startTime: string, endTime: string): boolean {
  let coveredUntil = startTime;
  for (const interval of intervals) {
    if (interval.startTime > coveredUntil) break;
    if (interval.endTime > coveredUntil) coveredUntil = interval.endTime;
    if (coveredUntil >= endTime) break;
  }
  return coveredUntil >= endTime;
}

/**
 * 30-minute pills over a barber's working hours. A pill is booked when a visit holds its half hour, past when it
 * already started, and blocked when the chosen visit length would run into a visit or past closing time.
 * The server stays authoritative and rechecks availability on save.
 */
export function buildSlots<T extends Visit>({ date, schedule, bookings, duration, now = new Date() }: { date: string; schedule: ScheduleLike; bookings: T[]; duration: number; now?: Date }): Slot<T>[] {
  const intervals = workingIntervals(schedule, date);
  const starts = new Set<number>();
  for (const interval of intervals) {
    for (let minute = minuteOfDay(interval.startTime); minute + SLOT_MINUTES <= minuteOfDay(interval.endTime); minute += SLOT_MINUTES) starts.add(minute);
  }
  const holding = bookings.filter(booking => blocking.has(booking.visitStatus));
  const overlapping = (startTime: string, endTime: string) => holding.find(booking => startTime < booking.endTime && endTime > booking.startTime);
  return [...starts].sort((a, b) => a - b).map(minute => {
    const startTime = timeOf(minute);
    const endTime = minute + duration < 24 * 60 ? timeOf(minute + duration) : "24:00";
    const booking = overlapping(startTime, timeOf(minute + SLOT_MINUTES));
    if (booking) return { startTime, endTime, state: "booked", booking };
    if (kuwaitInstant(date, startTime) <= now) return { startTime, endTime, state: "past" };
    if (endTime === "24:00" || !covered(intervals, startTime, endTime) || overlapping(startTime, endTime)) return { startTime, endTime, state: "blocked" };
    return { startTime, endTime, state: "free" };
  });
}

type ShareableBooking = {
  reference: string; date: string; startTime: string; endTime: string; adultCount: number; childCount: number; specialChildCount: number;
  client: { name: string; phone: string }; address: Parameters<typeof formatAddress>[0];
};

export function haircutSummary(booking: Pick<ShareableBooking, "adultCount" | "childCount" | "specialChildCount">): string {
  return [
    booking.childCount ? `${booking.childCount} طفل${booking.specialChildCount ? ` (${booking.specialChildCount} احتياجات خاصة)` : ""}` : null,
    booking.adultCount ? `${booking.adultCount} بالغ` : null,
  ].filter(Boolean).join("، ");
}

/** A wa.me link to the barber with the visit details ready to send. */
export function whatsAppLink(barberPhone: string, booking: ShareableBooking): string {
  const map = mapLink(booking.address);
  const lines = [
    `حجز رقم ${booking.reference}`,
    `التاريخ: ${formatDate(booking.date)}`,
    `الوقت: ${formatWindow(booking.startTime, booking.endTime)}`,
    `العميل: ${booking.client.name}`,
    `الهاتف: ${booking.client.phone}`,
    `العنوان: ${formatAddress(booking.address)}`,
    booking.address.instructions ? `ملاحظات العنوان: ${booking.address.instructions}` : null,
    map ? `الموقع: ${map}` : null,
    `العدد: ${haircutSummary(booking)}`,
  ].filter(Boolean);
  return `https://wa.me/${barberPhone.replace(/\D/g, "")}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export const cancelReasons = [
  { value: "not_home", label: "العميل غير متواجد" },
  { value: "client_cancelled", label: "العميل ألغى الحجز" },
  { value: "no_answer", label: "لا يوجد رد على الهاتف" },
  { value: "location", label: "مشكلة في العنوان" },
  { value: "traffic", label: "تأخير بسبب الزحمة" },
  { value: "barber", label: "مشكلة من الحلاق" },
  { value: "other", label: "سبب آخر" },
] as const;

/** The reason saved with a cancellation, or null when none is chosen or «سبب آخر» has no written reason. */
export function cancelReasonText(reason: string, other: string): string | null {
  const option = cancelReasons.find(item => item.value === reason);
  if (!option) return null;
  if (option.value !== "other") return option.label;
  const written = other.trim();
  return written ? `${option.label}: ${written}` : null;
}

type DayBooking = Visit & { invoice: { paymentStatus: "paid" | "unpaid"; total: string } };

/** Open visits (not yet done), visits that were not cancelled or missed, and the exact total collected. */
export function daySummary(bookings: DayBooking[]): { open: number; active: number; collected: string } {
  return {
    open: bookings.filter(booking => open.has(booking.visitStatus)).length,
    active: bookings.filter(booking => blocking.has(booking.visitStatus)).length,
    collected: fromFils(bookings.filter(booking => booking.invoice.paymentStatus === "paid").reduce((sum, booking) => sum + toFils(booking.invoice.total), 0n)),
  };
}

/** The open visit happening at `time` (Kuwait HH:mm), otherwise the next open one later today. */
export function currentOrNext<T extends Visit>(bookings: T[], time: string): { kind: "current" | "next"; booking: T } | null {
  const pending = bookings.filter(booking => open.has(booking.visitStatus)).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const current = pending.find(booking => booking.startTime <= time && time < booking.endTime);
  if (current) return { kind: "current", booking: current };
  const next = pending.find(booking => booking.startTime > time);
  return next ? { kind: "next", booking: next } : null;
}

/** A calendar date (YYYY-MM-DD) moved by whole days, without any time-zone shift. */
export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
