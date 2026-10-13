import { eligibilityQuerySchema } from "@just4kids/contracts";
import type { EligibilityQuery, WorkInterval, WeeklySchedule } from "@just4kids/contracts";

export type VisitWindow = EligibilityQuery & { status: "booked" | "arrived" | "completed" | "cancelled" | "no_show" };
const blockingStatuses = new Set<VisitWindow["status"]>(["booked", "arrived", "completed"]);

export function isWindowAvailable(query: EligibilityQuery, days: WeeklySchedule["days"], exception: WorkInterval[] | undefined, visits: VisitWindow[], blocks: (WorkInterval & { date: string })[] = []): boolean {
  const requested = eligibilityQuerySchema.parse(query);
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
