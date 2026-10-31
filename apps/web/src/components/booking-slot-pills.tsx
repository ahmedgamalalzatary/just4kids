"use client";

import { Fragment, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, Unlock } from "lucide-react";
import { Field, FormAlert } from "@/components/field";
import { ErrorState, LoadingRows, Ltr } from "@/components/page";
import { VisitStatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { keys, useCreateTimeBlock, useDayBookings, useDeleteTimeBlock, useSchedule } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Booking, Employee } from "@/lib/api/types";
import { buildEndOptions, buildLockEndOptions, buildSlots, haircutSummary, timeWords, type Slot } from "@/lib/day";
import { formatTime, formatWindow } from "@/lib/kuwait-time";
import { cn } from "@/lib/utils";

const slotStyles: Record<Slot<Booking>["state"], string> = {
  free: "border-border bg-card hover:border-primary hover:bg-accent",
  booked: "border-status-no-show/30 bg-status-no-show-soft text-status-no-show line-through decoration-1",
  past: "border-transparent bg-muted text-muted-foreground opacity-60",
  locked: "border-status-locked/30 bg-status-locked-soft text-status-locked",
};
const lockReason = (slot: Slot<Booking>) => slot.reason === "manual" ? slot.block?.reason || "Manual lock" : slot.reason === "day-off" ? "Day off / exception" : "Break";

/** Tapping a free pill picks the start; the end time is then chosen from the valid window. Lock management picks both ends of a closed window. */
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
  const [lockEndChoice, setLockEndChoice] = useState<string | null>(null);
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
  // A visit starts on the hour, so a free half hour is only offered for locks.
  const shownSlots = managing ? slots : slots.filter(slot => slot.startTime.endsWith(":00") || slot.state === "booked" || slot.state === "locked");
  const action = slots.find(slot => slot.startTime === actionTime);
  const activeStart = pendingStart ?? selected;
  const endOptions = activeStart ? buildEndOptions({ date, schedule: schedule.data, bookings: day.data.bookings, startTime: activeStart }) : [];
  const lockEndOptions = managing && action?.state === "free" ? buildLockEndOptions({ date, schedule: schedule.data, bookings: day.data.bookings, startTime: action.startTime }) : [];
  const lockEnd = lockEndChoice ?? lockEndOptions[0] ?? null;
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
  const resetAction = () => { setActionTime(null); setLockEndChoice(null); setReason(""); create.reset(); remove.reset(); };
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
        {managing ? <p className="text-sm text-muted-foreground">Select the start of the closed window, then its end; or a closed slot to unlock.</p> : null}
      </div> : null}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={managing ? "Lock time" : "Start time"}>
        {shownSlots.map(slot => {
          const isSelected = managing ? slot.startTime === actionTime : (slot.startTime === selected || slot.startTime === pendingStart) && slot.state === "free";
          const label = slot.state === "booked" ? `${formatTime(slot.startTime)}, booked`
            : slot.state === "free" ? formatTime(slot.startTime)
            : slot.state === "locked" ? `${formatTime(slot.startTime)}, closed: ${lockReason(slot)}`
            : `${formatTime(slot.startTime)}, unavailable`;
          const tooltip = slot.state === "locked" ? `${timeWords(slot.startTime)} · Closed: ${lockReason(slot)}` : timeWords(slot.startTime);
          const booking = slot.state === "booked" ? slot.booking : undefined;
          const pill = (
            <button type="button" role="radio" aria-checked={isSelected} aria-label={label} title={booking ? undefined : tooltip}
              disabled={busy || slot.state === "past"}
              onClick={() => {
                resetAction();
                if (slot.state !== "booked") { setShown(null); if (slot.state === "locked" || managing) setActionTime(slot.startTime); else pickStart(slot.startTime); }
              }}
              className={cn("min-w-[5.5rem] rounded-full border px-3 py-1.5 text-sm transition-colors", slotStyles[slot.state], isSelected && (managing ? "border-primary ring-2 ring-primary/30" : "border-primary bg-primary text-primary-foreground hover:bg-primary"))}
              data-numeric>
              {formatTime(slot.startTime)}
            </button>
          );
          if (!booking) return <Fragment key={slot.startTime}>{pill}</Fragment>;
          return (
            <Popover key={slot.startTime} open={shown === slot.startTime} onOpenChange={open => setShown(open ? slot.startTime : null)}>
              <PopoverTrigger asChild onPointerEnter={event => { if (event.pointerType === "mouse") setShown(slot.startTime); }}>{pill}</PopoverTrigger>
              <PopoverContent side="top" sideOffset={6} className="w-64 rounded-lg border-transparent bg-foreground p-3 text-xs text-background shadow-lg">
                <div className="flex flex-col gap-1">
                  <p className="font-medium"><span data-numeric>{formatWindow(booking.startTime, booking.endTime)}</span></p>
                  <Ltr className="text-xs">{booking.client.phone}</Ltr>
                  <p>{booking.address.area}</p>
                  <p>{haircutSummary(booking)}</p>
                  <VisitStatusBadge status={booking.visitStatus} className="mt-0.5 w-fit" />
                  {booking.notes ? <p className="border-t border-background/20 pt-1">{booking.notes}</p> : null}
                </div>
                <PopoverArrow className="bg-foreground fill-foreground" />
              </PopoverContent>
            </Popover>
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
        {action.state === "locked" ? <>
          <p className="text-sm" role="status">Closed: {lockReason(action)}</p>
          {isAdmin && action.block ? <Button type="button" variant="outline" className="w-fit" disabled={busy}
            onClick={() => remove.mutate({ id: barber.id, blockId: action.block!.id }, { onSuccess: saved, onError: refreshAfterConflict })}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Unlock aria-hidden />}Unlock {formatWindow(action.block.startTime, action.block.endTime)}
          </Button> : null}
        </> : isAdmin && managing ? <>
          <p className="text-sm" role="status">Closing from <span data-numeric>{formatTime(action.startTime)}</span> to <span data-numeric>{lockEnd ? formatTime(lockEnd) : "—"}</span>.</p>
          {lockEndOptions.length ? <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Lock end time">
            {lockEndOptions.map(endTime => (
              <button key={endTime} type="button" role="radio" aria-checked={endTime === lockEnd} aria-label={`Lock until ${formatTime(endTime)}`}
                onClick={() => setLockEndChoice(endTime)} data-numeric
                className={cn("min-w-[5.5rem] rounded-full border px-3 py-1.5 text-sm transition-colors",
                  endTime === lockEnd ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary hover:bg-accent")}>
                {formatTime(endTime)}
              </button>
            ))}
          </div> : <p className="text-xs text-destructive">No window fits after this start. Choose another start.</p>}
          <Field label="Lock reason" optional><Input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={busy} /></Field>
          {lockEnd ? <Button type="button" variant="outline" className="w-fit" disabled={busy}
            onClick={() => create.mutate({ id: barber.id, date, startTime: action.startTime, endTime: lockEnd, reason: reason.trim() }, { onSuccess: saved, onError: refreshAfterConflict })}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}Lock {formatTime(action.startTime)} to {formatTime(lockEnd)}
          </Button> : null}
        </> : null}
      </div> : null}
      <FormAlert error={create.error ?? remove.error} />
    </div>
  );
}
