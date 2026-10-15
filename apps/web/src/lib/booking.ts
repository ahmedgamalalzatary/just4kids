import { kuwaitInstant, minuteOfDay } from "./kuwait-time";

/** English description of why a booking window is not acceptable, or null. Mirrors the API's rules. */
export function windowProblem(window: { date: string; startTime: string; endTime: string }, now: Date = new Date(), requireFuture = true): string | null {
  if (!window.date) return "Select date";
  if (!window.startTime || !window.endTime) return "Select start and end times";
  const minutes = minuteOfDay(window.endTime) - minuteOfDay(window.startTime);
  if (minutes <= 0) return "The appointment must end after it starts on the same day";
  if (minutes < 20) return "Appointments must be at least 20 minutes";
  if (minutes > 240) return "Appointments cannot exceed 4 hours";
  if (requireFuture && kuwaitInstant(window.date, window.startTime) <= now) return "The appointment must start after the current Kuwait time";
  return null;
}

/** English description of why a special-needs child count is invalid, or null. Special children are a subset of children. */
export function specialChildrenProblem(childCount: number, specialChildCount: number): string | null {
  if (specialChildCount < 0 || specialChildCount > childCount) return "Special-needs children cannot exceed the child count";
  return null;
}
