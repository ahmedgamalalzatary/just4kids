"use client";

import { type ReactNode } from "react";
import { History } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBookingHistory, useBookingRevisions, useEmployees } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Booking, VisitEvent } from "@/lib/api/types";
import { buildTimeline, messageKindLabels, revisionChanges, visitEventTitle } from "@/lib/booking-timeline";
import { formatDateTime } from "@/lib/kuwait-time";

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

export function BookingHistory({ booking }: { booking: Booking }) {
  return (
    <Tabs defaultValue="visit" dir="ltr" className="gap-4">
      <TabsList>
        <TabsTrigger value="visit">Visit history</TabsTrigger>
        <TabsTrigger value="revisions">Edits</TabsTrigger>
      </TabsList>
      <TabsContent value="visit"><VisitHistory id={booking.id} /></TabsContent>
      <TabsContent value="revisions"><Revisions id={booking.id} /></TabsContent>
    </Tabs>
  );
}
