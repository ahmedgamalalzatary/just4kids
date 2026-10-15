"use client";

import { History } from "lucide-react";
import type { BookingTrackingResponse } from "@just4kids/contracts";
import { EmptyState, Ltr } from "@/components/page";
import { printableTable } from "@/components/reports";
import { VisitStatusBadge } from "@/components/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trackingGroups } from "@/lib/booking-timeline";
import { formatDate, formatDateTime, formatWindow } from "@/lib/kuwait-time";

type Event = ReturnType<typeof trackingGroups>[number]["events"][number];
function EventDetails({ event }: { event: Event }) {
  return <div className="flex flex-col gap-1 whitespace-pre-wrap wrap-anywhere">{event.details.map(detail => <p key={detail}>{detail}</p>)}{event.reason ? <p>Reason: {event.reason}</p> : null}{!event.reason && !event.details.length ? <span className="text-muted-foreground">No notes</span> : null}</div>;
}

export function TrackingBookings({ data }: { data: BookingTrackingResponse }) {
  const groups = trackingGroups(data);
  if (!groups.length) return <Card><EmptyState icon={History} title="No matching reservations" description="Change the period or filters to view other reservations." /></Card>;
  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ booking, events }) => (
        <Card key={booking.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle><Ltr>{booking.reference}</Ltr> — {booking.client.phone}</CardTitle>
              <VisitStatusBadge status={booking.visitStatus} />
            </div>
            <CardDescription className="flex flex-wrap gap-x-4 gap-y-1">
              <span>Barber: {booking.employee.displayName}</span><span>{formatDate(booking.date)}, {formatWindow(booking.startTime, booking.endTime)}</span>
              <span data-numeric>{booking.adultCount} adults, {booking.childCount} children ({booking.specialChildCount} special needs)</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!events.length ? <p className="text-sm text-muted-foreground">No events recorded for this reservation</p> : (
              <>
                <ol className="flex flex-col gap-3 md:hidden print:hidden" aria-label={`Reservation events ${booking.reference}`}>
                  {events.map(event => <li key={event.key} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm wrap-anywhere"><p className="font-medium">{event.title}</p><p className="text-xs text-muted-foreground">{formatDateTime(event.at)} — {event.actor} ({event.role})</p><EventDetails event={event} /></li>)}
                </ol>
                <div className="hidden md:block print:block">
                  <Table className={`${printableTable} table-fixed [&_td]:align-top [&_td]:whitespace-normal [&_td]:wrap-anywhere`}>
                    <TableHeader><TableRow><TableHead>Time (Kuwait)</TableHead><TableHead>Action</TableHead><TableHead>Performed by</TableHead><TableHead>Notes / reason</TableHead></TableRow></TableHeader>
                    <TableBody>{events.map(event => <TableRow key={event.key} className="print:break-inside-avoid"><TableCell>{formatDateTime(event.at)}</TableCell><TableCell className="font-medium">{event.title}</TableCell><TableCell>{event.actor}<p className="text-xs text-muted-foreground">{event.role}</p></TableCell><TableCell><EventDetails event={event} /></TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
