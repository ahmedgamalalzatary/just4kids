import { kuwaitInstant, minuteOfDay } from "./kuwait-time";

/** Arabic description of why a booking window is not acceptable, or null. Mirrors the API's rules. */
export function windowProblem(window: { date: string; startTime: string; endTime: string }, now: Date = new Date(), requireFuture = true): string | null {
  if (!window.date) return "اختر التاريخ";
  if (!window.startTime || !window.endTime) return "اختر وقت البداية والنهاية";
  const minutes = minuteOfDay(window.endTime) - minuteOfDay(window.startTime);
  if (minutes <= 0) return "يجب أن ينتهي الموعد بعد بدايته في اليوم نفسه";
  if (minutes < 20) return "أقل مدة للموعد 20 دقيقة";
  if (minutes > 240) return "أطول مدة للموعد 4 ساعات";
  if (requireFuture && kuwaitInstant(window.date, window.startTime) <= now) return "يجب أن يبدأ الموعد بعد الوقت الحالي بتوقيت الكويت";
  return null;
}

/** Arabic description of why a special-needs child count is invalid, or null. Special children are a subset of children. */
export function specialChildrenProblem(childCount: number, specialChildCount: number): string | null {
  if (specialChildCount < 0 || specialChildCount > childCount) return "عدد الأطفال ذوي الاحتياجات الخاصة لا يزيد عن عدد الأطفال";
  return null;
}
