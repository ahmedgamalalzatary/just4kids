import type { VisitStatus } from "@just4kids/contracts";
import { cn } from "@/lib/utils";

export const visitStatusLabels: Record<VisitStatus, string> = {
  booked: "محجوز",
  arrived: "وصل الحلاق",
  completed: "مكتمل",
  cancelled: "ملغي",
  no_show: "لم يحضر العميل",
};

const visitStatusStyles: Record<VisitStatus, string> = {
  booked: "bg-status-booked-soft text-status-booked",
  arrived: "bg-status-arrived-soft text-status-arrived",
  completed: "bg-status-completed-soft text-status-completed",
  cancelled: "bg-status-cancelled-soft text-status-cancelled",
  no_show: "bg-status-no-show-soft text-status-no-show",
};

const chip = "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium";

export function VisitStatusBadge({ status, className }: { status: VisitStatus; className?: string }) {
  return (
    <span className={cn(chip, visitStatusStyles[status], className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {visitStatusLabels[status]}
    </span>
  );
}

/** Payment is shown as its own measure; a cancelled invoice is labelled separately. */
export function PaymentBadge({ paymentStatus, invoiceStatus, className }: { paymentStatus: "paid" | "unpaid"; invoiceStatus?: "issued" | "cancelled"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn(chip, paymentStatus === "paid" ? "bg-status-completed-soft text-status-completed" : "border border-border text-muted-foreground")}>
        {paymentStatus === "paid" ? "مدفوع نقداً" : "غير مدفوع"}
      </span>
      {invoiceStatus === "cancelled" ? <span className={cn(chip, "bg-status-cancelled-soft text-status-cancelled line-through decoration-1")}>فاتورة ملغاة</span> : null}
    </span>
  );
}

export function SourceLabel({ source }: { source: "manual" | "ai" }) {
  return <span className="text-xs text-muted-foreground">{source === "ai" ? "عبر واتساب" : "حجز يدوي"}</span>;
}
