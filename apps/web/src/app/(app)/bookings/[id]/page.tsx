"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, MapPin, Pencil, Phone, RotateCcw } from "lucide-react";
import { EmployeeAvatar } from "@/components/avatar";
import { CorrectionDialog, VisitActions } from "@/components/booking-actions";
import { WhatsAppButton } from "@/components/day-bookings";
import { BookingEditDialog } from "@/components/booking-edit-dialog";
import { BookingHistory } from "@/components/booking-history";
import { Detail, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { VisitStatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import { useBooking, useEmployees } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import { formatAddress, mapLink } from "@/lib/address";
import { formatDate, formatDateTime, formatDuration, formatWindow, windowMinutes } from "@/lib/kuwait-time";
import { isCorrection } from "@/lib/visit-rules";

function BookingScreen({ id }: { id: string }) {
  const booking = useBooking(id);
  const isAdmin = useSession().data?.account.role === "admin";
  const employees = useEmployees(isAdmin);
  const [editOpen, setEditOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);

  const back = <Link href="/bookings" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" aria-hidden />Reservations</Link>;
  if (booking.isPending) return <>{back}<LoadingRows /></>;
  if (booking.isError) {
    const missing = booking.error instanceof ApiError && (booking.error.status === 404 || booking.error.status === 403);
    return <>{back}<ErrorState error={missing ? new ApiError(404, "NOT_FOUND", "Reservation not found or not assigned to you") : booking.error} {...(missing ? {} : { onRetry: () => booking.refetch() })} /></>;
  }

  const data = booking.data;
  const link = mapLink(data.address);
  const correction = isCorrection(data);
  const barberPhone = employees.data?.find(employee => employee.id === data.employee.id)?.phone;

  return (
    <>
      {back}
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{data.client.phone}</h1>
          <VisitStatusBadge status={data.visitStatus} />
        </div>
        <p className="text-muted-foreground">
          {formatDate(data.date)}, <span data-numeric>{formatWindow(data.startTime, data.endTime)}</span> ({formatDuration(windowMinutes(data.startTime, data.endTime))})
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <VisitActions booking={data} />
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <WhatsAppButton booking={data} barberPhone={barberPhone} size="sm" />
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil aria-hidden />{correction ? "Correct reservation" : "Edit reservation"}</Button>
            <Button variant="ghost" size="sm" onClick={() => setCorrectionOpen(true)}><RotateCcw aria-hidden />Correct status</Button>
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader><CardTitle>Visit details</CardTitle><Ltr className="text-sm text-muted-foreground">{data.reference}</Ltr></CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Client" className="sm:col-span-2">
                <a href={`tel:${data.client.phone}`} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"><Phone className="size-3.5" aria-hidden /><Ltr>{data.client.phone}</Ltr></a>
              </Detail>
              <Detail label="Address" className="sm:col-span-2">
                {formatAddress(data.address)}

                {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"><MapPin className="size-3.5" aria-hidden />Open location on map</a> : null}
              </Detail>
              <Detail label="Barber">
                <span className="flex items-center gap-2">
                  <EmployeeAvatar employeeId={data.employee.id} name={data.employee.displayName} className="size-8" />
                  <span>{data.employee.displayName}</span>
                </span>
              </Detail>
              <Detail label="Haircuts">{[data.adultCount ? `${data.adultCount} adult` : null, data.childCount ? `${data.childCount} child` : null, data.specialChildCount ? `${data.specialChildCount} with special needs` : null].filter(Boolean).join(", ")}</Detail>
              {data.notes ? <Detail label="Notes" className="sm:col-span-2">{data.notes}</Detail> : null}
              <Detail label="Reservation date">{formatDateTime(data.createdAt)}</Detail>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>History</CardTitle></CardHeader>
          <CardContent><BookingHistory booking={data} /></CardContent>
        </Card>
      </div>

      {isAdmin ? (
        <>
          <BookingEditDialog booking={data} open={editOpen} onOpenChange={setEditOpen} />
          <CorrectionDialog booking={data} open={correctionOpen} onOpenChange={setCorrectionOpen} />
        </>
      ) : null}
    </>
  );
}

export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  return <BookingScreen id={id} />;
}
