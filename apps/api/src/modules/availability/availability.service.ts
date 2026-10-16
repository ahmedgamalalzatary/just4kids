import type { EligibilityQuery, WorkInterval } from "@just4kids/contracts";

export type VisitWindow = EligibilityQuery & { status: "booked" | "arrived" | "completed" | "cancelled" | "no_show" };
export type WorkingDay = { dayOfWeek: number; intervals: WorkInterval[] };
export type WindowQuery = { date: string; startTime: string; endTime: string };
const blockingStatuses = new Set<VisitWindow["status"]>(["booked", "arrived", "completed"]);

// Pure availability check: callers validate the window shape and, for bookings, the 20-minute–4-hour
// duration limit before calling this. Manual locks are not bound by the booking duration cap.
export function isWindowAvailable(query: WindowQuery, days: WorkingDay[], exception: WorkInterval[] | undefined, visits: VisitWindow[], blocks: (WorkInterval & { date: string })[] = []): boolean {
  const requested = query;
  const weekday = new Date(`${requested.date}T00:00:00.000Z`).getUTCDay();
  const intervals = exception ?? days.find(day => day.dayOfWeek === weekday)?.intervals ?? [];
  const sorted = [...intervals].sort((a, b) => a.startTime.localeCompare(b.startTime));
  let coveredUntil = requested.startTime;
  for (const interval of sorted) {
    if (interval.startTime > coveredUntil) break;
    if (interval.endTime > coveredUntil) coveredUntil = interval.endTime;
    if (coveredUntil >= requested.endTime) break;
  }
  if (coveredUntil < requested.endTime) return false;
  if (blocks.some(block => block.date === requested.date && requested.startTime < block.endTime && requested.endTime > block.startTime)) return false;
  return !visits.some(visit => visit.date === requested.date && blockingStatuses.has(visit.status)
    && requested.startTime < visit.endTime && requested.endTime > visit.startTime);
}
