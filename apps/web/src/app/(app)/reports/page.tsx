"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { VisitStatus } from "@just4kids/contracts";
import { Detail, EmptyState, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { Pagination } from "@/components/pagination";
import { useReportFilters } from "@/components/reports";
import { PaymentBadge, SourceLabel, VisitStatusBadge, visitStatusLabels } from "@/components/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useReservationReport } from "@/lib/api/hooks";
import type { ReservationReport } from "@/lib/api/types";
import { formatDate, formatDateTime, formatWindow } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import type { ReportFilters } from "@/lib/reports";
import { cn } from "@/lib/utils";

function haircuts(booking: { adultCount: number; childCount: number }) {
  return [booking.adultCount ? `${booking.adultCount} بالغ` : null, booking.childCount ? `${booking.childCount} طفل` : null].filter(Boolean).join("، ");
}

function Summary({ summary }: { summary: ReservationReport["summary"] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>الملخص</CardTitle>
          <CardDescription>يشمل كل الحجوزات المطابقة، وليس الصفحة المعروضة فقط.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Detail label="الحجوزات"><span className="text-lg font-semibold" data-numeric>{summary.bookings}</span></Detail>
          <Detail label="حجز يدوي"><span data-numeric>{summary.sources.manual}</span></Detail>
          <Detail label="عبر واتساب"><span data-numeric>{summary.sources.ai}</span></Detail>
          <Detail label="تعديلات المدير"><span data-numeric>{summary.edits}</span><span className="block text-xs text-muted-foreground" data-numeric>على {summary.editedBookings} حجز</span></Detail>
          <Detail label="تصحيحات الحالة"><span data-numeric>{summary.corrections}</span><span className="block text-xs text-muted-foreground" data-numeric>على {summary.correctedBookings} حجز</span></Detail>
        </dl>
        <ul className="flex flex-wrap gap-2" aria-label="الحجوزات حسب حالة الزيارة">
          {(Object.keys(visitStatusLabels) as VisitStatus[]).map(status => (
            <li key={status} className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
              <VisitStatusBadge status={status} />
              <span className="text-sm font-medium" data-numeric>{summary.statuses[status]}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
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
          <Ltr className="shrink-0 text-xs text-muted-foreground">{booking.reference}</Ltr>
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{booking.client.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {booking.address.area}، {haircuts(booking)}{showBarber ? `، مع ${booking.employee.displayName} (${booking.employee.branchName})` : ""}
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
      <Summary summary={data.summary} />
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
