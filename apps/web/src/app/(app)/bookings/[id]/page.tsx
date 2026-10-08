"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChevronRight, FileText, MapPin, Pencil, Phone, RotateCcw } from "lucide-react";
import { CorrectionDialog, RecordPaymentButton, VisitActions } from "@/components/booking-actions";
import { BookingEditDialog } from "@/components/booking-edit-dialog";
import { BookingHistory } from "@/components/booking-history";
import { Detail, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { PaymentBadge, SourceLabel, VisitStatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import { useBooking } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Booking } from "@/lib/api/types";
import { formatAddress, mapLink } from "@/lib/address";
import { formatDate, formatDateTime, formatDuration, formatWindow, windowMinutes } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { canEditBooking, canRecordPayment } from "@/lib/visit-rules";

function InvoiceSummary({ booking }: { booking: Booking }) {
  const invoice = booking.invoice;
  return (
    <Card>
      <CardHeader>
        <CardTitle>الفاتورة</CardTitle>
        <Button asChild variant="outline" size="sm"><Link href={`/bookings/${booking.id}/invoice`}><FileText aria-hidden />عرض وطباعة</Link></Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <PaymentBadge paymentStatus={invoice.paymentStatus} invoiceStatus={invoice.status} />
        <dl className="flex flex-col gap-1.5">
          {invoice.adultCount > 0 ? <div className="flex justify-between gap-2"><dt>{invoice.adultCount} × بالغ، <Ltr>{formatKwd(invoice.adultUnitPrice)}</Ltr></dt><dd><Ltr>{formatKwd(invoice.adultAmount)}</Ltr></dd></div> : null}
          {invoice.childCount > 0 ? <div className="flex justify-between gap-2"><dt>{invoice.childCount} × طفل، <Ltr>{formatKwd(invoice.childUnitPrice)}</Ltr></dt><dd><Ltr>{formatKwd(invoice.childAmount)}</Ltr></dd></div> : null}
          <div className="mt-1 flex justify-between gap-2 border-t border-border pt-2 text-base font-semibold">
            <dt>الإجمالي</dt>
            <dd className={invoice.status === "cancelled" ? "text-muted-foreground line-through" : undefined}><Ltr>{formatKwd(invoice.total)}</Ltr></dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function BookingScreen({ id }: { id: string }) {
  const booking = useBooking(id);
  const isAdmin = useSession().data?.account.role === "admin";
  const [editOpen, setEditOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);

  const back = <Link href="/bookings" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronRight className="size-4" aria-hidden />الحجوزات</Link>;
  if (booking.isPending) return <>{back}<LoadingRows /></>;
  if (booking.isError) {
    const missing = booking.error instanceof ApiError && (booking.error.status === 404 || booking.error.status === 403);
    return <>{back}<ErrorState error={missing ? new ApiError(404, "NOT_FOUND", "الحجز غير موجود أو غير مسند إليك") : booking.error} {...(missing ? {} : { onRetry: () => booking.refetch() })} /></>;
  }

  const data = booking.data;
  const link = mapLink(data.address);
  const payable = canRecordPayment(data);

  return (
    <>
      {back}
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{data.client.name}</h1>
          <VisitStatusBadge status={data.visitStatus} />
        </div>
        <p className="text-muted-foreground">
          {formatDate(data.date)}، <span data-numeric>{formatWindow(data.startTime, data.endTime)}</span> ({formatDuration(windowMinutes(data.startTime, data.endTime))})
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <VisitActions booking={data} />
          {payable ? <RecordPaymentButton booking={data} /> : null}
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            {canEditBooking(data) ? <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil aria-hidden />تعديل الحجز</Button> : null}
            <Button variant="ghost" size="sm" onClick={() => setCorrectionOpen(true)}><RotateCcw aria-hidden />تصحيح الحالة</Button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>تفاصيل الزيارة</CardTitle><Ltr className="text-sm text-muted-foreground">{data.reference}</Ltr></CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="العميل" className="sm:col-span-2">
                  {data.client.name}، <a href={`tel:${data.client.phone}`} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"><Phone className="size-3.5" aria-hidden /><Ltr>{data.client.phone}</Ltr></a>
                </Detail>
                <Detail label="العنوان" className="sm:col-span-2">
                  {formatAddress(data.address)}
                  {data.address.instructions ? <span className="mt-1 block text-muted-foreground">{data.address.instructions}</span> : null}
                  {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"><MapPin className="size-3.5" aria-hidden />فتح الموقع على الخريطة</a> : null}
                </Detail>
                <Detail label="الحلاق">{data.employee.displayName}<span className="block text-xs text-muted-foreground">{data.employee.branchName}</span></Detail>
                <Detail label="الحلاقات">{[data.adultCount ? `${data.adultCount} بالغ` : null, data.childCount ? `${data.childCount} طفل` : null].filter(Boolean).join("، ")}</Detail>
                <Detail label="المصدر"><SourceLabel source={data.source} /></Detail>
                <Detail label="تاريخ الحجز">{formatDateTime(data.createdAt)}</Detail>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>السجل</CardTitle></CardHeader>
            <CardContent><BookingHistory booking={data} /></CardContent>
          </Card>
        </div>
        <InvoiceSummary booking={data} />
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
