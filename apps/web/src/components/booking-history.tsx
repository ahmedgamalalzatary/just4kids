"use client";

import { useState, type ReactNode } from "react";
import { History } from "lucide-react";
import { UndoPaymentDialog } from "@/components/booking-actions";
import { EmptyState, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBookingHistory, useBookingPayments, useBookingRevisions, useEmployees } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Booking, VisitEvent } from "@/lib/api/types";
import { buildTimeline, messageKindLabels, paymentKinds, revisionChanges, visitEventTitle } from "@/lib/booking-timeline";
import { formatDateTime } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { paymentMethodLabels } from "@/lib/payments";

/** Resolves account IDs to readable names with the data this viewer is allowed to see. */
function useActorName() {
  const session = useSession();
  const account = session.data?.account;
  const employees = useEmployees(account?.role === "admin");
  return (accountId: string | null) => {
    if (!accountId) return "System";
    if (accountId === account?.id) return account.role === "admin" ? "Administrator" : "You";
    const employee = employees.data?.find(candidate => candidate.id === accountId);
    if (employee) return employee.displayName;
    return account?.role === "admin" ? "Administrator" : "Another account";
  };
}

function Timeline({ children }: { children: ReactNode }) {
  return <ol className="relative flex flex-col gap-5 border-s border-border ps-5">{children}</ol>;
}

function TimelineItem({ title, meta, children }: { title: ReactNode; meta: string; children?: ReactNode }) {
  return (
    <li className="relative">
      <span aria-hidden className="absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full border-2 border-card bg-primary" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{meta}</p>
      {children ? <div className="mt-1.5 text-sm">{children}</div> : null}
    </li>
  );
}

function VisitHistory({ id }: { id: string }) {
  const history = useBookingHistory(id);
  const actorName = useActorName();
  if (history.isPending) return <LoadingRows rows={3} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  const name = (event: VisitEvent) => event.actorType === "client" ? "Client" : event.actorType === "system" ? "System" : actorName(event.actorAccountId);
  const timeline = buildTimeline(history.data.events, history.data.messages);
  return (
    <Timeline>
      {timeline.slice().reverse().map(entry => entry.type === "message" ? (
        <TimelineItem key={entry.message.id} title={messageKindLabels[entry.message.kind]} meta={`${actorName(entry.message.actorAccountId)}, ${formatDateTime(entry.message.occurredAt)}`} />
      ) : (
        <TimelineItem key={entry.event.id}
          title={visitEventTitle(entry.event)}
          meta={`${name(entry.event)}, ${formatDateTime(entry.event.occurredAt)}`}>
          {entry.event.reason ? <p className="text-muted-foreground">{entry.event.reason}</p> : null}
          {entry.event.previousInvoiceStatus && entry.event.previousInvoiceStatus !== entry.event.invoiceStatus ? <p className="text-xs">Invoice: {entry.event.invoiceStatus === "cancelled" ? "Cancelled" : "Reissued"}</p> : null}
        </TimelineItem>
      ))}
    </Timeline>
  );
}

function Revisions({ id }: { id: string }) {
  const revisions = useBookingRevisions(id);
  const actorName = useActorName();
  if (revisions.isPending) return <LoadingRows rows={3} />;
  if (revisions.isError) return <ErrorState error={revisions.error} onRetry={() => revisions.refetch()} />;
  if (revisions.data.length === 0) return <EmptyState icon={History} title="Reservation has not been edited" className="py-8" />;
  return (
    <Timeline>
      {[...revisions.data].reverse().map(revision => (
        <TimelineItem key={revision.id} title="Edit reservation" meta={`${actorName(revision.actorAccountId)}, ${formatDateTime(revision.occurredAt)}`}>
          <ul className="flex flex-col gap-1">{revisionChanges(revision).map(change => <li key={change}>{change}</li>)}</ul>
          {revision.reason ? <p className="mt-1 text-muted-foreground">Reason: {revision.reason}</p> : null}
        </TimelineItem>
      ))}
    </Timeline>
  );
}

function Payments({ booking }: { booking: Booking }) {
  const payments = useBookingPayments(booking.id);
  const actorName = useActorName();
  const isAdmin = useSession().data?.account.role === "admin";
  const [undoOpen, setUndoOpen] = useState(false);
  if (payments.isPending) return <LoadingRows rows={3} />;
  if (payments.isError) return <ErrorState error={payments.error} onRetry={() => payments.refetch()} />;
  const active = payments.data.payment;
  return (
    <div className="flex flex-col gap-5">
      {active ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-status-completed-soft px-4 py-3 text-status-completed">
          <p className="text-sm">Currently collected: <Ltr className="font-semibold">{formatKwd(active.amount)}</Ltr> <span className="text-xs">({paymentMethodLabels[active.method]})</span></p>
          {isAdmin ? <Button variant="outline" size="sm" onClick={() => setUndoOpen(true)}>Void an incorrect payment</Button> : null}
        </div>
      ) : null}
      {payments.data.events.length === 0 ? <EmptyState icon={History} title="No payments recorded" className="py-8" /> : (
        <Timeline>
          {[...payments.data.events].reverse().map(event => (
            <TimelineItem key={event.id} title={<>{paymentKinds[event.kind]}: <Ltr>{formatKwd(event.amount)}</Ltr></>} meta={`${paymentMethodLabels[event.method]}, ${actorName(event.actorAccountId)}, ${formatDateTime(event.occurredAt)}`}>
              {event.reason ? <p className="text-muted-foreground">{event.reason}</p> : null}
            </TimelineItem>
          ))}
        </Timeline>
      )}
      {active && isAdmin ? <UndoPaymentDialog booking={booking} payment={active} open={undoOpen} onOpenChange={setUndoOpen} /> : null}
    </div>
  );
}

export function BookingHistory({ booking }: { booking: Booking }) {
  return (
    <Tabs defaultValue="visit" dir="ltr" className="gap-4">
      <TabsList>
        <TabsTrigger value="visit">Visit history</TabsTrigger>
        <TabsTrigger value="revisions">Edits</TabsTrigger>
        <TabsTrigger value="cash">Cash</TabsTrigger>
      </TabsList>
      <TabsContent value="visit"><VisitHistory id={booking.id} /></TabsContent>
      <TabsContent value="revisions"><Revisions id={booking.id} /></TabsContent>
      <TabsContent value="cash"><Payments booking={booking} /></TabsContent>
    </Tabs>
  );
}
