import type { VisitStatus } from "@just4kids/contracts";
import { cn } from "@/lib/utils";

export const visitStatusLabels: Record<VisitStatus, string> = {
  booked: "Booked",
  arrived: "Barber arrived",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Client did not attend",
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

export function SourceLabel({ source }: { source: "manual" | "ai" }) {
  return <span className="text-xs text-muted-foreground">{source === "ai" ? "Via WhatsApp" : "Manual reservation"}</span>;
}
