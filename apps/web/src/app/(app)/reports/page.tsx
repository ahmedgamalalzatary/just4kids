"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { Pagination } from "@/components/pagination";
import { useReportFilters } from "@/components/reports";
import { PaymentBadge, SourceLabel, VisitStatusBadge } from "@/components/status";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useReservationReport } from "@/lib/api/hooks";
import type { ReservationReport } from "@/lib/api/types";
import { formatDate, formatDateTime, formatWindow } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import type { ReportFilters } from "@/lib/reports";
import { cn } from "@/lib/utils";

function haircuts(booking: { adultCount: number; childCount: number }) {
  return [booking.adultCount ? `${booking.adultCount} بالغ` : null, booking.childCount ? `${booking.childCount} طفل` : null].filter(Boolean).join("، ");
}

function BookingRow({ booking, showBarber }: { booking: ReservationReport["bookings"][number]; showBarber: boolean }) {
  return (
    <li>
      <Link href={`/bookings/${booking.id}`} className="grid gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-muted/50 sm:grid-cols-[11rem_1fr_auto] sm:items-center">
        <div className="flex items-start justify-between gap-3 sm:block">
          <div>
            <p className="text-sm font-semibold">{formatDate(booking.date)}</p>
            <p className="text-sm" data-numeric>{formatWindow(booking.startTime, booking.endTime)}</p>
          </div>
          <Ltr className="min-w-0 break-all text-xs text-muted-foreground">{booking.reference}</Ltr>
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{booking.client.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {booking.address.area}، {haircuts(booking)}{showBarber ? `، مع ${booking.employee.displayName}` : ""}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <SourceLabel source={booking.source} />
            <span className="text-xs text-muted-foreground">أُنشئ {formatDateTime(booking.createdAt)}</span>
            {booking.editCount ? <span className="text-xs text-muted-foreground" data-numeric>{booking.editCount} تعديل</span> : null}
            {booking.correctionCount ? <span className="text-xs text-muted-foreground" data-numeric>{booking.correctionCount} تصحيح حالة</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <VisitStatusBadge status={booking.visitStatus} />
          <PaymentBadge paymentStatus={booking.invoice.paymentStatus} invoiceStatus={booking.invoice.status} />
          <Ltr className="ms-auto text-sm font-medium sm:ms-0 sm:min-w-[6.5rem] sm:text-end">{formatKwd(booking.invoice.total)}</Ltr>
        </div>
      </Link>
    </li>
  );
}

function ReservationsReport({ filters, isAdmin }: { filters: ReportFilters; isAdmin: boolean }) {
  const [offset, setOffset] = useState(0);
  const report = useReservationReport(filters, offset);
  if (report.isPending) return <Card><LoadingRows /></Card>;
  if (report.isError) return <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card>;
  const { data } = report;
  return (
    <div className={cn("flex flex-col gap-6", report.isPlaceholderData && "opacity-60")}>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>تفاصيل الحجوزات</CardTitle>
            <CardDescription>{filters.dateBasis === "created_date" ? "الأحدث إنشاءً أولاً." : "الأحدث موعداً أولاً."} افتح الحجز لعرض الفاتورة والسجل.</CardDescription>
          </div>
        </CardHeader>
        {data.bookings.length === 0 ? <EmptyState icon={CalendarDays} title="لا توجد حجوزات مطابقة" description="غيّر الفترة أو المرشحات لعرض حجوزات أخرى." /> : (
          <>
            <ul className="divide-y divide-border">{data.bookings.map(booking => <BookingRow key={booking.id} booking={booking} showBarber={isAdmin} />)}</ul>
            <div data-print-hidden><Pagination total={data.total} limit={data.limit} offset={data.offset} onChange={setOffset} /></div>
          </>
        )}
      </Card>
    </div>
  );
}

export default function ReservationsReportPage() {
  const { filters, isAdmin, search } = useReportFilters();
  // New filters start again from the first page.
  return <ReservationsReport key={search} filters={filters} isAdmin={isAdmin} />;
}
