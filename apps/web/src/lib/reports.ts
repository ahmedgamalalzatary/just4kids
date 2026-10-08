import { z } from "zod";
import { reportDateBasisSchema, visitStatusSchema } from "@just4kids/contracts";
import type { ReportDateBasis, VisitStatus } from "@just4kids/contracts";

export type ReportFilters = {
  dateBasis: ReportDateBasis; from: string; to: string; branchId: string; employeeId: string; status: VisitStatus | ""; source: "manual" | "ai" | ""; q: string;
};

export const emptyReportFilters: ReportFilters = { dateBasis: "visit_date", from: "", to: "", branchId: "", employeeId: "", status: "", source: "", q: "" };

const date = z.iso.date();
const uuid = z.uuid();
const source = z.enum(["manual", "ai"]);
const pick = <T>(schema: z.ZodType<T>, value: string | null, fallback: T): T => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

/** Reads report filters from the address, dropping malformed values. Branch and barber filters are administrator-only. */
export function readReportFilters(params: Pick<URLSearchParams, "get">, isAdmin: boolean): ReportFilters {
  const q = (params.get("q") ?? "").trim();
  return {
    dateBasis: pick(reportDateBasisSchema, params.get("dateBasis"), "visit_date"),
    from: pick(date, params.get("from"), ""), to: pick(date, params.get("to"), ""),
    branchId: isAdmin ? pick(uuid, params.get("branchId"), "") : "",
    employeeId: isAdmin ? pick(uuid, params.get("employeeId"), "") : "",
    status: pick(visitStatusSchema, params.get("status"), ""),
    source: pick(source, params.get("source"), ""),
    q: q.length <= 120 ? q : "",
  };
}

/** The address query for non-default filters, or an empty string. */
export function reportSearch(filters: ReportFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && !(key === "dateBasis" && value === "visit_date")) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function rangeError(from: string, to: string): string | undefined {
  return from && to && from > to ? "تاريخ النهاية قبل تاريخ البداية" : undefined;
}

/** Reserved minutes as a rounded percentage of scheduled minutes; null when no schedule is known. */
export function utilisation(reservedMinutes: number, availableMinutes: number | null): number | null {
  return availableMinutes ? Math.round((reservedMinutes / availableMinutes) * 100) : null;
}
