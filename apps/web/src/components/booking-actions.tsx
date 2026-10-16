"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { VisitStatus } from "@just4kids/contracts";
import { Field, FormAlert } from "@/components/field";
import { Ltr } from "@/components/page";
import { visitStatusLabels } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useVisitCorrection, useVisitTransition } from "@/lib/api/hooks";
import type { Booking } from "@/lib/api/types";
import { cancelReasonText, cancelReasons } from "@/lib/day";
import { formatTime, formatWindow } from "@/lib/kuwait-time";
import { cn } from "@/lib/utils";
import { visitActions, type VisitAction } from "@/lib/visit-rules";

const actionCopy: Record<VisitAction["status"], { label: string; done: string; confirm: string; waiting: (booking: Booking) => string }> = {
  arrived: { label: "I have arrived", done: "Arrival recorded", confirm: "Confirm arrival at the client's address.", waiting: booking => `Available from ${formatTime(booking.startTime)}` },
  completed: { label: "Visit completed", done: "Visit completion recorded", confirm: "Confirm all haircuts are complete.", waiting: booking => `Available from ${formatTime(booking.startTime)}` },
  no_show: { label: "Client did not attend", done: "No-show recorded", confirm: "The barber cannot change this status afterward.", waiting: booking => `Available after ${formatTime(booking.endTime)}` },
  cancelled: { label: "Cancel visit", done: "Visit cancelled", confirm: "The visit is kept in history.", waiting: () => "" },
};

/** Normal visit steps for the assigned barber or the administrator, each confirmed before sending. */
export function VisitActions({ booking }: { booking: Booking }) {
  const transition = useVisitTransition();
  const [pending, setPending] = useState<VisitAction["status"] | null>(null);
  const [reason, setReason] = useState("");
  const actions = visitActions(booking);
  if (actions.length === 0) return null;

  const close = () => { setPending(null); setReason(""); transition.reset(); };
  const confirm = () => {
    if (!pending) return;
    transition.mutate({ id: booking.id, status: pending, expectedVersion: booking.visitVersion, ...(reason.trim() ? { reason: reason.trim() } : {}) }, {
      onSuccess: () => { toast.success(actionCopy[pending].done); close(); },
    });
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map(action => (
          <div key={action.status} className="flex flex-col gap-1">
            <Button variant={action.status === "cancelled" ? "outline" : action.status === "no_show" ? "secondary" : "default"} size="lg"
              disabled={!action.allowed} onClick={() => setPending(action.status)}
              className={action.status === "cancelled" ? "text-destructive hover:text-destructive" : undefined}>
              {actionCopy[action.status].label}
            </Button>
            {!action.allowed ? <span className="text-xs text-muted-foreground">{actionCopy[action.status].waiting(booking)}</span> : null}
          </div>
        ))}
      </div>
      <CancelVisitDialog booking={booking} open={pending === "cancelled"} onOpenChange={open => { if (!open) close(); }} />
      <Dialog open={pending !== null && pending !== "cancelled"} onOpenChange={open => { if (!open) close(); }}>
        <DialogContent>
          {pending && pending !== "cancelled" ? (
            <>
              <DialogHeader>
                <DialogTitle>{actionCopy[pending].label}?</DialogTitle>
                <DialogDescription>{actionCopy[pending].confirm}</DialogDescription>
              </DialogHeader>
              <Field label="Note" optional><Textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field>
              <FormAlert error={transition.error} />
              <DialogFooter>
                <Button onClick={confirm} disabled={transition.isPending}>
                  {transition.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {actionCopy[pending].label}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Cancels a visit with one of the fixed reasons the team uses; «Other reason» needs a written reason. */
export function CancelVisitDialog({ booking, open, onOpenChange }: { booking: Booking; open: boolean; onOpenChange: (open: boolean) => void }) {
  const transition = useVisitTransition();
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const close = (value: boolean) => { if (!value) { transition.reset(); setReason(""); setOther(""); setProblem(null); } onOpenChange(value); };
  const submit = () => {
    const text = cancelReasonText(reason, other);
    if (!text) { setProblem(reason === "other" ? "Enter the cancellation reason" : "Select a cancellation reason"); return; }
    setProblem(null);
    transition.mutate({ id: booking.id, status: "cancelled", expectedVersion: booking.visitVersion, reason: text }, { onSuccess: () => { toast.success(actionCopy.cancelled.done); close(false); } });
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel reservation</DialogTitle>
          <DialogDescription>
            {booking.client.phone}, <span data-numeric>{formatWindow(booking.startTime, booking.endTime)}</span> · <Ltr className="text-xs">{booking.reference}</Ltr>
            <span className="mt-1 block">{actionCopy.cancelled.confirm}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Cancellation reason">
          {cancelReasons.map(option => (
            <button key={option.value} type="button" role="radio" aria-checked={reason === option.value} onClick={() => { setReason(option.value); setProblem(null); }}
              className={cn("rounded-md border px-3 py-2.5 text-start text-sm transition-colors", reason === option.value ? "border-destructive bg-destructive/10 font-medium" : "border-border hover:bg-muted/50", option.value === "other" && "sm:col-span-2")}>
              {option.label}
            </button>
          ))}
        </div>
        {reason === "other" ? <Field label="Enter a reason"><Textarea rows={2} autoFocus value={other} onChange={event => setOther(event.target.value)} maxLength={900} /></Field> : null}
        {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
        <FormAlert error={transition.error} />
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={transition.isPending}>
            {transition.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Confirm cancellation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const allStatuses: VisitStatus[] = ["booked", "arrived", "completed", "cancelled", "no_show"];

/** Administrator-only correction of any visit state, with a required reason. */
export function CorrectionDialog({ booking, open, onOpenChange }: { booking: Booking; open: boolean; onOpenChange: (open: boolean) => void }) {
  const correct = useVisitCorrection();
  const [status, setStatus] = useState<VisitStatus | "">("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const close = (value: boolean) => { if (!value) { correct.reset(); setStatus(""); setReason(""); setProblem(null); } onOpenChange(value); };
  const submit = () => {
    if (!status) { setProblem("Select the correct status"); return; }
    if (!reason.trim()) { setProblem("Enter the correction reason"); return; }
    setProblem(null);
    correct.mutate({ id: booking.id, status, reason: reason.trim(), expectedVersion: booking.visitVersion }, { onSuccess: () => { toast.success("Visit status corrected"); close(false); } });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct visit status</DialogTitle>
          <DialogDescription>
            Current status: {visitStatusLabels[booking.visitStatus]}. Reopening a visit that reserves the barber&apos;s time requires availability.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="Correct status">
            <Select value={status} onValueChange={value => setStatus(value as VisitStatus)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>{allStatuses.filter(option => option !== booking.visitStatus).map(option => <SelectItem key={option} value={option}>{visitStatusLabels[option]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Reason"><Textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field>
          {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
          <FormAlert error={correct.error} />
        </div>
        <DialogFooter><Button onClick={submit} disabled={correct.isPending}>Save correction</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
