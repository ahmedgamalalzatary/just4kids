// All schedule and booking times are Asia/Kuwait local values (UTC+3, no daylight saving).
export const KUWAIT_TIME_ZONE = "Asia/Kuwait";
const locale = "ar-KW-u-nu-latn";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: KUWAIT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function kuwaitNow(now: Date = new Date()): { date: string; time: string } {
  const parts = Object.fromEntries(partsFormatter.formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function kuwaitInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00.000+03:00`);
}

export function minuteOfDay(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function windowMinutes(startTime: string, endTime: string): number {
  return minuteOfDay(endTime) - minuteOfDay(startTime);
}

const dateFormatter = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const dateTimeFormatter = new Intl.DateTimeFormat(locale, { timeZone: KUWAIT_TIME_ZONE, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Formats a calendar date (YYYY-MM-DD) without shifting it through any time zone. */
export function formatDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

export function formatShortDate(date: string): string {
  return shortDateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

/** Formats a local HH:mm time as a 12-hour Arabic time with Western digits, e.g. "4:30 م". */
export function formatTime(time: string): string {
  const hours = Number(time.slice(0, 2));
  const minutes = time.slice(3, 5);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "ص" : "م"}`;
}

export function formatWindow(startTime: string, endTime: string): string {
  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}

/** Formats an ISO instant in Kuwait time. */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

// Arabic counted nouns: one and two have their own words, 3–10 (by the last two digits) take the plural, and the rest the singular.
function counted(count: number, one: string, two: string, plural: string): string {
  if (count === 1) return one;
  if (count === 2) return two;
  return count % 100 >= 3 && count % 100 <= 10 ? `${count} ${plural}` : `${count} ${one}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const minuteText = counted(rest, "دقيقة", "دقيقتان", "دقائق");
  if (hours === 0) return minuteText;
  const hourText = counted(hours, "ساعة", "ساعتان", "ساعات");
  return rest === 0 ? hourText : `${hourText} و${minuteText}`;
}

export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;
