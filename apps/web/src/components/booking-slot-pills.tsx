"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, Unlock, X } from "lucide-react";
import { Field, FormAlert } from "@/components/field";
import { ErrorState, LoadingRows, Ltr } from "@/components/page";
import { VisitStatusBadge, visitStatusLabels } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { keys, useCreateTimeBlock, useDayBookings, useDeleteTimeBlock, useSchedule } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Booking, Employee } from "@/lib/api/types";
import { buildSlots, haircutSummary, timeWords, type Slot } from "@/lib/day";
import { formatDuration, formatTime, formatWindow } from "@/lib/kuwait-time";
import { cn } from "@/lib/utils";

const slotStyles: Record<Slot<Booking>["state"], string> = {
  free: "border-border bg-card hover:border-primary hover:bg-accent",
  booked: "border-status-no-show/30 bg-status-no-show-soft text-status-no-show line-through decoration-1",
  past: "border-transparent bg-muted text-muted-foreground opacity-60",
  blocked: "border-dashed border-border text-muted-foreground opacity-60",
  locked: "border-status-locked/30 bg-status-locked-soft text-status-locked",
};
const lockReason = (slot: Slot<Booking>) => slot.reason === "manual" ? slot.block?.reason || "قفل يدوي" : slot.reason === "day-off" ? "إجازة / استثناء" : "استراحة";

/** Booking selection stays one tap; the administrator can switch to half-hour lock management. */
export function SlotPills({ barber, date, duration, selected, onSelect, onAvailabilityChange }: {
  barber: Employee; date: string; duration: number; selected: string | null;
  onSelect: (slot: { startTime: string; endTime: string }) => void;
  onAvailabilityChange: () => void;
}) {
  const schedule = useSchedule(barber.id);
  const day = useDayBookings(date, barber.id);
  const session = useSession();
  const queryClient = useQueryClient();
  const create = useCreateTimeBlock();
  const remove = useDeleteTimeBlock();
  const [manage, setManage] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [actionTime, setActionTime] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const isAdmin = session.data?.account.role === "admin";
  const managing = isAdmin && manage;
  const busy = create.isPending || remove.isPending;
  if (schedule.isPending || day.isPending) return <LoadingRows rows={2} />;
  if (schedule.isError) return <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />;
  if (day.isError) return <ErrorState error={day.error} onRetry={() => day.refetch()} />;
  // Locks always cover one half-hour, independent of the length of the booking being prepared.
  const slots = buildSlots({ date, schedule: schedule.data, bookings: day.data.bookings, duration: managing ? 30 : duration });
  const action = slots.find(slot => slot.startTime === actionTime);
  const details = day.data.bookings.find(booking => booking.id === shown);
  const resetAction = () => { setActionTime(null); setReason(""); create.reset(); remove.reset(); };
  const refreshAfterConflict = () => {
    onAvailabilityChange();
    void queryClient.invalidateQueries({ queryKey: keys.schedule(barber.id) });
    void queryClient.invalidateQueries({ queryKey: [...keys.bookings, "list"] });
    void queryClient.invalidateQueries({ queryKey: ["availability"] });
  };
  const saved = () => { resetAction(); onAvailabilityChange(); };
  return (
    <div className="flex flex-col gap-3">
      {isAdmin ? <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={managing ? "default" : "outline"} size="sm" aria-pressed={managing} disabled={busy}
          onClick={() => { setManage(!manage); setShown(null); resetAction(); onAvailabilityChange(); }}>
          <Lock aria-hidden />قفل / فتح الأوقات
        </Button>
        {managing ? <p className="text-sm text-muted-foreground">اختر نصف ساعة لقفلها، أو وقتاً مقفلاً لفتحه.</p> : null}
      </div> : null}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={managing ? "وقت القفل" : "وقت البداية"}>
        {slots.map(slot => {
          const isSelected = managing ? slot.startTime === actionTime : slot.startTime === selected && slot.state === "free";
          const label = slot.state === "booked" ? `${formatTime(slot.startTime)}، محجوز`
            : slot.state === "free" ? formatTime(slot.startTime)
            : slot.state === "locked" ? `${formatTime(slot.startTime)}، مغلق: ${lockReason(slot)}`
            : `${formatTime(slot.startTime)}، غير متاح`;
          const tooltip = slot.state === "booked" && slot.booking
            ? `${timeWords(slot.startTime)} · ${slot.booking.client.name} · ${slot.booking.address.area} · ${slot.booking.client.phone} · ${haircutSummary(slot.booking)} · ${visitStatusLabels[slot.booking.visitStatus]}`
            : slot.state === "locked" ? `${timeWords(slot.startTime)} · مغلق: ${lockReason(slot)}` : timeWords(slot.startTime);
          return (
            <button key={slot.startTime} type="button" role="radio" aria-checked={isSelected} aria-label={label} title={tooltip}
              disabled={busy || slot.state === "past" || slot.state === "blocked"}
              onClick={() => {
                resetAction();
                if (slot.state === "booked") setShown(slot.booking?.id ?? null);
                else { setShown(null); if (slot.state === "locked" || managing) setActionTime(slot.startTime); else onSelect(slot); }
              }}
              className={cn("min-w-[5.5rem] rounded-full border px-3 py-1.5 text-sm transition-colors", slotStyles[slot.state], isSelected && (managing ? "border-primary ring-2 ring-primary/30" : "border-primary bg-primary text-primary-foreground hover:bg-primary"))}
              data-numeric>
              {formatTime(slot.startTime)}
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-border bg-card" aria-hidden />متاح</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-status-no-show-soft ring-1 ring-status-no-show/40" aria-hidden />محجوز (اضغط للتفاصيل)</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-status-locked-soft ring-1 ring-status-locked/40" aria-hidden />مغلق (قفل يدوي، استراحة أو إجازة)</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted" aria-hidden />غير متاح لمدة {formatDuration(managing ? 30 : duration)}</span>
      </p>
      {action ? <div className="flex flex-col gap-3 border-t border-border pt-3">
        <p className="text-sm" role="status">{action.state === "locked" ? `مغلق: ${lockReason(action)}` : <>قفل الوقت: <span data-numeric>{formatWindow(action.startTime, action.endTime)}</span></>}</p>
        {isAdmin && managing && action.state === "free" ? <>
          <Field label="سبب القفل" optional><Input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={busy} /></Field>
          <Button type="button" variant="outline" className="w-fit" disabled={busy} onClick={() => create.mutate({ id: barber.id, date, startTime: action.startTime, reason: reason.trim() }, { onSuccess: saved, onError: refreshAfterConflict })}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}قفل نصف الساعة
          </Button>
        </> : null}
        {isAdmin && action.state === "locked" && action.block ? <Button type="button" variant="outline" className="w-fit" disabled={busy}
          onClick={() => remove.mutate({ id: barber.id, blockId: action.block!.id }, { onSuccess: saved, onError: refreshAfterConflict })}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Unlock aria-hidden />}فتح نصف الساعة
        </Button> : null}
      </div> : null}
      <FormAlert error={create.error ?? remove.error} />
      {details ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-status-no-show/30 bg-status-no-show-soft/50 px-3 py-2.5 text-sm" role="status">
          <div className="min-w-0">
            <p className="font-medium"><span data-numeric>{formatWindow(details.startTime, details.endTime)}</span> · {details.client.name} <Ltr className="text-sm">{details.client.phone}</Ltr></p>
            <p>{details.address.area}، {haircutSummary(details)}</p>
            <VisitStatusBadge status={details.visitStatus} className="mt-1" />
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm"><Link href={`/bookings/${details.id}`}>فتح الحجز</Link></Button>
            <Button variant="ghost" size="icon-sm" aria-label="إغلاق" onClick={() => setShown(null)}><X /></Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
