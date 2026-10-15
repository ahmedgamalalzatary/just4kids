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
import { buildEndOptions, buildSlots, haircutSummary, timeWords, type Slot } from "@/lib/day";
import { formatTime, formatWindow } from "@/lib/kuwait-time";
import { cn } from "@/lib/utils";

const slotStyles: Record<Slot<Booking>["state"], string> = {
  free: "border-border bg-card hover:border-primary hover:bg-accent",
  booked: "border-status-no-show/30 bg-status-no-show-soft text-status-no-show line-through decoration-1",
  past: "border-transparent bg-muted text-muted-foreground opacity-60",
  locked: "border-status-locked/30 bg-status-locked-soft text-status-locked",
};
const lockReason = (slot: Slot<Booking>) => slot.reason === "manual" ? slot.block?.reason || "Manual lock" : slot.reason === "day-off" ? "Day off / exception" : "Break";

/** Tapping a free pill picks the start; the end time is then chosen from the valid window. Lock management stays half-hour based. */
export function SlotPills({ barber, date, selected, selectedEnd, onSelect, onAvailabilityChange }: {
  barber: Employee; date: string; selected: string | null; selectedEnd: string | null;
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
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [pendingEnd, setPendingEnd] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const isAdmin = session.data?.account.role === "admin";
  const managing = isAdmin && manage;
  const busy = create.isPending || remove.isPending;
  if (schedule.isPending || day.isPending) return <LoadingRows rows={2} />;
  if (schedule.isError) return <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />;
  if (day.isError) return <ErrorState error={day.error} onRetry={() => day.refetch()} />;
  const slots = buildSlots({ date, schedule: schedule.data, bookings: day.data.bookings });
  const action = slots.find(slot => slot.startTime === actionTime);
  const details = day.data.bookings.find(booking => booking.id === shown);
  const activeStart = pendingStart ?? selected;
  const endOptions = activeStart ? buildEndOptions({ date, schedule: schedule.data, bookings: day.data.bookings, startTime: activeStart }) : [];
  // A freshly tapped start invalidates the previously chosen end; only keep it when revisiting the same start.
  const chosenEnd = pendingStart ? pendingEnd : selectedEnd;
  const pickEnd = (endTime: string) => {
    if (!activeStart) return;
    setPendingEnd(endTime);
    onSelect({ startTime: activeStart, endTime });
  };
  const pickStart = (startTime: string) => {
    if (startTime !== selected) onAvailabilityChange();
    setPendingStart(startTime);
    setPendingEnd(null);
  };
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
          onClick={() => { setManage(!manage); setShown(null); setPendingStart(null); setPendingEnd(null); resetAction(); onAvailabilityChange(); }}>
          <Lock aria-hidden />Lock / unlock times
        </Button>
        {managing ? <p className="text-sm text-muted-foreground">Select a half-hour to lock, or a locked slot to unlock.</p> : null}
      </div> : null}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={managing ? "Lock time" : "Start time"}>
        {slots.map(slot => {
          const isSelected = managing ? slot.startTime === actionTime : (slot.startTime === selected || slot.startTime === pendingStart) && slot.state === "free";
          const label = slot.state === "booked" ? `${formatTime(slot.startTime)}, booked`
            : slot.state === "free" ? formatTime(slot.startTime)
            : slot.state === "locked" ? `${formatTime(slot.startTime)}, closed: ${lockReason(slot)}`
            : `${formatTime(slot.startTime)}, unavailable`;
          const tooltip = slot.state === "booked" && slot.booking
            ? `${timeWords(slot.startTime)} · ${slot.booking.client.phone} · ${slot.booking.address.area} · ${haircutSummary(slot.booking)} · ${visitStatusLabels[slot.booking.visitStatus]}`
            : slot.state === "locked" ? `${timeWords(slot.startTime)} ? Closed: ${lockReason(slot)}` : timeWords(slot.startTime);
          return (
            <button key={slot.startTime} type="button" role="radio" aria-checked={isSelected} aria-label={label} title={tooltip}
              disabled={busy || slot.state === "past"}
              onClick={() => {
                resetAction();
                if (slot.state === "booked") setShown(slot.booking?.id ?? null);
                else { setShown(null); if (slot.state === "locked" || managing) setActionTime(slot.startTime); else pickStart(slot.startTime); }
              }}
              className={cn("min-w-[5.5rem] rounded-full border px-3 py-1.5 text-sm transition-colors", slotStyles[slot.state], isSelected && (managing ? "border-primary ring-2 ring-primary/30" : "border-primary bg-primary text-primary-foreground hover:bg-primary"))}
              data-numeric>
              {formatTime(slot.startTime)}
            </button>
          );
        })}
      </div>
      {activeStart && !managing ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-sm" role="status">Visit starts at <span data-numeric>{formatTime(activeStart)}</span>. Choose the end time.</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="End time">
            {endOptions.map(endTime => (
              <button key={endTime} type="button" role="radio" aria-checked={endTime === chosenEnd} aria-label={`End at ${formatTime(endTime)}`}
                onClick={() => pickEnd(endTime)} data-numeric
                className={cn("min-w-[5.5rem] rounded-full border px-3 py-1.5 text-sm transition-colors",
                  endTime === chosenEnd ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary hover:bg-accent")}>
                {formatTime(endTime)}
              </button>
            ))}
          </div>
          {endOptions.length === 0 ? <p className="text-xs text-destructive">No end time fits after this start. Choose another start.</p> : null}
        </div>
      ) : null}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-border bg-card" aria-hidden />Available</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-status-no-show-soft ring-1 ring-status-no-show/40" aria-hidden />Booked (view details)</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-status-locked-soft ring-1 ring-status-locked/40" aria-hidden />Closed (manual lock, break or day off)</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted" aria-hidden />Past or already started</span>
      </p>
      {action ? <div className="flex flex-col gap-3 border-t border-border pt-3">
        <p className="text-sm" role="status">{action.state === "locked" ? `Closed: ${lockReason(action)}` : <>Lock time: <span data-numeric>{formatWindow(action.startTime, action.endTime)}</span></>}</p>
        {isAdmin && managing && action.state === "free" ? <>
          <Field label="Lock reason" optional><Input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={busy} /></Field>
          <Button type="button" variant="outline" className="w-fit" disabled={busy} onClick={() => create.mutate({ id: barber.id, date, startTime: action.startTime, reason: reason.trim() }, { onSuccess: saved, onError: refreshAfterConflict })}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}Lock half-hour
          </Button>
        </> : null}
        {isAdmin && action.state === "locked" && action.block ? <Button type="button" variant="outline" className="w-fit" disabled={busy}
          onClick={() => remove.mutate({ id: barber.id, blockId: action.block!.id }, { onSuccess: saved, onError: refreshAfterConflict })}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Unlock aria-hidden />}Unlock half-hour
        </Button> : null}
      </div> : null}
      <FormAlert error={create.error ?? remove.error} />
      {details ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-status-no-show/30 bg-status-no-show-soft/50 px-3 py-2.5 text-sm" role="status">
          <div className="min-w-0">
            <p className="font-medium"><span data-numeric>{formatWindow(details.startTime, details.endTime)}</span> · <Ltr className="text-sm">{details.client.phone}</Ltr></p>
            <p>{details.address.area}, {haircutSummary(details)}</p>
            <VisitStatusBadge status={details.visitStatus} className="mt-1" />
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm"><Link href={`/bookings/${details.id}`}>Open reservation</Link></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setShown(null)}><X /></Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
