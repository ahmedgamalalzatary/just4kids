import { kuwaitInstant, minuteOfDay } from "./kuwait-time";
import { fromFils, invoiceTotal, toFils } from "./money";

/** Arabic description of why a booking window is not acceptable, or null. Mirrors the API's rules. */
export function windowProblem(window: { date: string; startTime: string; endTime: string }, now: Date = new Date()): string | null {
  if (!window.date) return "اختر التاريخ";
  if (!window.startTime || !window.endTime) return "اختر وقت البداية والنهاية";
  const minutes = minuteOfDay(window.endTime) - minuteOfDay(window.startTime);
  if (minutes <= 0) return "يجب أن ينتهي الموعد بعد بدايته في اليوم نفسه";
  if (minutes < 20) return "أقل مدة للموعد 20 دقيقة";
  if (minutes > 240) return "أطول مدة للموعد 4 ساعات";
  if (kuwaitInstant(window.date, window.startTime) <= now) return "يجب أن يبدأ الموعد بعد الوقت الحالي بتوقيت الكويت";
  return null;
}

type PricedBooking = { branchId: string; invoice: { adultUnitPrice: string; childUnitPrice: string } };
type BranchPrices = { id: string; adultPrice: string; childPrice: string };

/**
 * Preview of an edited reservation's price under the confirmed rules: the recorded branch keeps its agreed
 * unit prices; a different branch uses its current prices. The server computes the final invoice.
 */
export function editedPricing(booking: PricedBooking, next: { adultCount: number; childCount: number; branchId: string }, branches: BranchPrices[]) {
  let adultUnitPrice = booking.invoice.adultUnitPrice;
  let childUnitPrice = booking.invoice.childUnitPrice;
  if (next.branchId !== booking.branchId) {
    const branch = branches.find(candidate => candidate.id === next.branchId);
    if (!branch) return null;
    adultUnitPrice = branch.adultPrice;
    childUnitPrice = branch.childPrice;
  }
  return { adultUnitPrice, childUnitPrice, total: invoiceTotal({ adultCount: next.adultCount, childCount: next.childCount, adultUnitPrice, childUnitPrice }) };
}

/** The exact cash movement required when a paid total changes. */
export function reconciliationFor(previousTotal: string, nextTotal: string): { action: "extra_cash" | "refund"; amount: string } | null {
  const difference = toFils(nextTotal) - toFils(previousTotal);
  if (difference === 0n) return null;
  return { action: difference > 0n ? "extra_cash" : "refund", amount: fromFils(difference > 0n ? difference : -difference) };
}
