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
type TimeBlock = Interval & { id: string; date: string; reason: string | null };
type ScheduleLike = { days: { dayOfWeek: number; intervals: Interval[] }[]; exceptions: { date: string; intervals: Interval[] }[]; blocks?: TimeBlock[] };
type Visit = Interval & { visitStatus: VisitStatus };

export type SlotState = "free" | "booked" | "past" | "blocked" | "locked";
export type SlotReason = "break" | "day-off" | "manual";
export type Slot<T extends Visit> = { startTime: string; endTime: string; state: SlotState; booking?: T; reason?: SlotReason; block?: TimeBlock };

// Pills span the whole day the client is used to (the old app's 09:00 list up to midnight) so a closed or idle half
// hour is shown blue instead of hidden. The span still reaches any shift that starts earlier than 09:00.
const DAY_START = "09:00";
const DAY_END = "24:00";

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
 * 30-minute pills across the barber's whole day. A pill is booked when a visit holds its half hour, past when it has
 * already started, locked (blue) when the half hour is outside the day's working intervals — a break between shifts
 * or a whole day off — and blocked when the chosen visit length would run into a visit or past closing time.
 * The server stays authoritative and rechecks availability on save.
 */
export function buildSlots<T extends Visit>({ date, schedule, bookings, duration, now = new Date() }: { date: string; schedule: ScheduleLike; bookings: T[]; duration: number; now?: Date }): Slot<T>[] {
  const intervals = workingIntervals(schedule, date);
  const scheduledStarts = [...schedule.days, ...schedule.exceptions].flatMap(entry => entry.intervals.map(interval => minuteOfDay(interval.startTime)));
  const firstMinute = Math.floor(Math.min(minuteOfDay(DAY_START), ...scheduledStarts) / SLOT_MINUTES) * SLOT_MINUTES;
  const lastMinute = minuteOfDay(DAY_END);
  const starts: number[] = [];
  for (let minute = firstMinute; minute + SLOT_MINUTES <= lastMinute; minute += SLOT_MINUTES) starts.push(minute);
  const holding = bookings.filter(booking => blocking.has(booking.visitStatus));
  const blocks = (schedule.blocks ?? []).filter(block => block.date === date);
  const blockedBy = (startTime: string, endTime: string) => blocks.find(block => startTime < block.endTime && endTime > block.startTime);
  const overlapping = (startTime: string, endTime: string) => holding.find(booking => startTime < booking.endTime && endTime > booking.startTime);
  return starts.map(minute => {
    const startTime = timeOf(minute);
    const halfEndTime = timeOf(minute + SLOT_MINUTES);
    const endTime = minute + duration < lastMinute ? timeOf(minute + duration) : DAY_END;
    const booking = overlapping(startTime, halfEndTime);
    if (booking) return { startTime, endTime, state: "booked", booking };
    if (kuwaitInstant(date, startTime) <= now) return { startTime, endTime, state: "past" };
    const block = blockedBy(startTime, halfEndTime);
    if (block) return { startTime, endTime, state: "locked", reason: "manual", block };
    if (intervals.length === 0 || !covered(intervals, startTime, halfEndTime)) return { startTime, endTime, state: "locked", reason: intervals.length === 0 ? "day-off" : "break" };
    if (endTime === DAY_END || !covered(intervals, startTime, endTime) || overlapping(startTime, endTime) || blockedBy(startTime, endTime)) return { startTime, endTime, state: "blocked" };
    return { startTime, endTime, state: "free" };
  });
}

const hourWords: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve" };

function dayPart(hours: number): string {
  if (hours >= 5 && hours < 12) return "in the morning";
  if (hours >= 12 && hours < 16) return "at noon";
  if (hours >= 16 && hours < 19) return "in the afternoon";
  if (hours >= 19 && hours < 22) return "in the evening";
  return "at night";
}

/** A local HH:mm time in English words, e.g. "half past four in the afternoon". */
export function timeWords(time: string): string {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  const hourWord = hourWords[hours % 12 === 0 ? 12 : hours % 12]!;
  const clock = minutes === 0 ? hourWord : minutes === 30 ? `half past ${hourWord}` : `${minutes} minute${minutes === 1 ? "" : "s"} past ${hourWord}`;
  return `${clock} ${dayPart(hours)}`;
}

type ShareableBooking = {
  reference: string; date: string; startTime: string; endTime: string; adultCount: number; childCount: number; specialChildCount: number; notes: string | null;
  client: { phone: string }; address: Parameters<typeof formatAddress>[0];
};

export function haircutSummary(booking: Pick<ShareableBooking, "adultCount" | "childCount" | "specialChildCount">): string {
  return [
    booking.childCount ? `${booking.childCount} ${booking.childCount === 1 ? "child" : "children"}${booking.specialChildCount ? ` (${booking.specialChildCount} with special needs)` : ""}` : null,
    booking.adultCount ? `${booking.adultCount} adult${booking.adultCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(", ");
}

/** A wa.me link to the barber with the visit details ready to send. */
export function whatsAppLink(barberPhone: string, booking: ShareableBooking): string {
  const map = mapLink(booking.address);
  const lines = [
    `Reservation ${booking.reference}`,
    `Date: ${formatDate(booking.date)}`,
    `Time: ${formatWindow(booking.startTime, booking.endTime)}`,
    `Phone: ${booking.client.phone}`,
    `Address: ${formatAddress(booking.address)}`,
    map ? `Location: ${map}` : null,
    `Count: ${haircutSummary(booking)}`,
    booking.notes ? `Notes: ${booking.notes}` : null,
  ].filter(Boolean);
  return `https://wa.me/${barberPhone.replace(/\D/g, "")}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export const cancelReasons = [
  { value: "not_home", label: "Client not at home" },
  { value: "client_cancelled", label: "Client cancelled" },
  { value: "no_answer", label: "No answer on phone" },
  { value: "location", label: "Address problem" },
  { value: "traffic", label: "Traffic delay" },
  { value: "barber", label: "Barber problem" },
  { value: "other", label: "Other reason" },
] as const;

/** The reason saved with a cancellation, or null when none is chosen or «Other reason» has no written reason. */
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
