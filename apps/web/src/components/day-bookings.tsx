"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPin, MessageCircle, Pencil, Phone, X } from "lucide-react";
import { EmployeeAvatar } from "@/components/avatar";
import { CancelVisitDialog, RecordPaymentButton, VisitActions } from "@/components/booking-actions";
import { BookingEditDialog } from "@/components/booking-edit-dialog";
import { Ltr } from "@/components/page";
import { PaymentBadge, VisitStatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Booking } from "@/lib/api/types";
import { formatAddress, mapLink } from "@/lib/address";
import { useSession } from "@/lib/api/session";
import { haircutSummary, whatsAppLink } from "@/lib/day";
import { formatWindow } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { canEditBooking, canRecordPayment } from "@/lib/visit-rules";
import { cn } from "@/lib/utils";

const cancellable = (booking: Booking) => booking.visitStatus === "booked" || booking.visitStatus === "arrived";

export function TimeChip({ booking, className }: { booking: Pick<Booking, "startTime" | "endTime">; className?: string }) {
  return <span className={cn("inline-flex w-fit items-center whitespace-nowrap rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground ring-1 ring-ring/25", className)} data-numeric>{formatWindow(booking.startTime, booking.endTime)}</span>;
}

/** Opens WhatsApp to the barber with the visit details ready to send. */
export function WhatsAppButton({ booking, barberPhone, size = "sm" }: { booking: Booking; barberPhone: string | undefined; size?: "sm" | "default" }) {
  if (!barberPhone) return null;
  return (
    <Button asChild size={size} className="bg-status-completed text-white hover:bg-status-completed/90 dark:text-background">
      <a href={whatsAppLink(barberPhone, booking)} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden />واتساب</a>
    </Button>
  );
}

/** One row of the administrator's day list («توجيه الحجز»): barber, time, client, counts, and the quick actions. */
export function DayBookingRow({ booking, barberPhone, photoVersion }: { booking: Booking; barberPhone: string | undefined; photoVersion?: string | null | undefined }) {
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const muted = booking.visitStatus === "cancelled" || booking.visitStatus === "no_show";
  return (
    <li className={cn("grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[11rem_10rem_1fr_auto] lg:items-center", muted && "opacity-70")}>
      <div className="flex items-center justify-between gap-3 lg:contents">
        <div className="flex min-w-0 items-center gap-2.5">
          <EmployeeAvatar employeeId={booking.employee.id} name={booking.employee.displayName} version={photoVersion} className="size-10" />
          <div className="min-w-0">
            <p className="truncate font-medium">{booking.employee.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{booking.employee.branchName}</p>
          </div>
        </div>
        <TimeChip booking={booking} />
      </div>
      <Link href={`/bookings/${booking.id}`} className="min-w-0 rounded-md hover:underline">
        <p className="flex flex-wrap items-center gap-x-2 font-medium">{booking.client.name} <Ltr className="text-sm font-normal text-muted-foreground">{booking.client.phone}</Ltr></p>
        <p className="truncate text-sm text-muted-foreground">{booking.address.area}، {haircutSummary(booking)} · <Ltr>{formatKwd(booking.invoice.total)}</Ltr></p>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <VisitStatusBadge status={booking.visitStatus} />
          <PaymentBadge paymentStatus={booking.invoice.paymentStatus} invoiceStatus={booking.invoice.status} />
          <Ltr className="text-xs text-muted-foreground">{booking.reference}</Ltr>
        </span>
      </Link>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {!muted ? <WhatsAppButton booking={booking} barberPhone={barberPhone} /> : null}
        {canEditBooking(booking) ? <Button size="sm" variant="sun" onClick={() => setEditOpen(true)}><Pencil aria-hidden />تعديل</Button> : null}
        {cancellable(booking) ? <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}><X aria-hidden />إلغاء</Button> : null}
      </div>
      <BookingEditDialog booking={booking} open={editOpen} onOpenChange={setEditOpen} />
      <CancelVisitDialog booking={booking} open={cancelOpen} onOpenChange={setCancelOpen} />
    </li>
  );
}

/** A barber's visit card: who, where, call and map, then the next visit steps and payment. */
export function VisitCard({ booking }: { booking: Booking }) {
  const isAdmin = useSession().data?.account.role === "admin";
  const map = mapLink(booking.address);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TimeChip booking={booking} />
        <span className="flex flex-wrap items-center gap-1.5">
          <VisitStatusBadge status={booking.visitStatus} />
          <PaymentBadge paymentStatus={booking.invoice.paymentStatus} invoiceStatus={booking.invoice.status} />
        </span>
      </div>
      <div>
        <p className="text-lg font-semibold">{booking.client.name}</p>
        <p className="text-sm">{formatAddress(booking.address)}</p>
        {booking.address.instructions ? <p className="mt-0.5 text-sm text-muted-foreground">{booking.address.instructions}</p> : null}
        <p className="mt-1 text-sm text-muted-foreground">{haircutSummary(booking)} · <Ltr>{formatKwd(booking.invoice.total)}</Ltr></p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><a href={`tel:${booking.client.phone}`}><Phone aria-hidden />اتصال <Ltr>{booking.client.phone}</Ltr></a></Button>
        {map ? <Button asChild variant="outline"><a href={map} target="_blank" rel="noopener noreferrer"><MapPin aria-hidden />الموقع</a></Button> : null}
        <Button asChild variant="ghost"><Link href={`/bookings/${booking.id}`}>التفاصيل</Link></Button>
      </div>
      {cancellable(booking) || canRecordPayment(booking, isAdmin) ? (
        <div className="flex flex-wrap items-start gap-2 border-t border-border pt-3">
          <VisitActions booking={booking} />
          {canRecordPayment(booking, isAdmin) ? <RecordPaymentButton booking={booking} /> : null}
        </div>
      ) : null}
    </Card>
  );
}
