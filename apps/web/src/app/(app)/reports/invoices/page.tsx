"use client";

import Link from "next/link";
import { useState } from "react";
import { Banknote } from "lucide-react";
import { Detail, EmptyState, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { Pagination } from "@/components/pagination";
import { CashMoney, Money, useReportFilters } from "@/components/reports";
import { PaymentBadge, SourceLabel, VisitStatusBadge } from "@/components/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useInvoiceReport } from "@/lib/api/hooks";
import type { InvoiceReport } from "@/lib/api/types";
import { formatDate, formatDateTime, formatWindow } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { paymentMethodLabels } from "@/lib/payments";
import type { ReportFilters } from "@/lib/reports";
import { cn } from "@/lib/utils";

function lineItems(invoice: InvoiceReport["invoices"][number]) {
  return [invoice.amountCash !== "0.000" ? `نقدي ${invoice.amountCash}` : null, invoice.amountLink !== "0.000" ? `رابط ${invoice.amountLink}` : null]
    .filter(Boolean).join("، ");
}



function InvoiceRow({ invoice, showBarber }: { invoice: InvoiceReport["invoices"][number]; showBarber: boolean }) {
  return (
    <li>
      <Link href={`/bookings/${invoice.bookingId}`} className="grid gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-muted/50 sm:grid-cols-[11rem_1fr_auto] sm:items-center">
        <div className="flex items-start justify-between gap-3 sm:block">
          <div>
            <p className="text-sm font-semibold">{formatDate(invoice.date)}</p>
            <p className="text-sm" data-numeric>{formatWindow(invoice.startTime, invoice.endTime)}</p>
          </div>
          <Ltr className="shrink-0 text-xs text-muted-foreground">{invoice.reference}</Ltr>
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{invoice.client.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {invoice.address.area}، {lineItems(invoice)}{showBarber ? `، مع ${invoice.employee.displayName}${invoice.employee.branchName ? ` (${invoice.employee.branchName})` : ""}` : ""}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <SourceLabel source={invoice.source} />
            <span className="text-xs text-muted-foreground">صدرت {formatDateTime(invoice.issuedAt)}</span>
            {invoice.editCount ? <span className="text-xs text-muted-foreground" data-numeric>{invoice.editCount} تعديل</span> : null}
            {invoice.correctionCount ? <span className="text-xs text-muted-foreground" data-numeric>{invoice.correctionCount} تصحيح حالة</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <VisitStatusBadge status={invoice.visitStatus} />
          <PaymentBadge paymentStatus={invoice.paymentStatus} invoiceStatus={invoice.status} />
          {invoice.cash ? (
            <span className="text-xs text-muted-foreground">
              {paymentMethodLabels[invoice.cash.method]} <Ltr>{formatKwd(invoice.cash.amount)}</Ltr>
              <span className="ms-1" data-numeric>بتاريخ {formatDateTime(invoice.cash.recordedAt)}</span>
            </span>
          ) : null}
          <Ltr className="ms-auto text-sm font-medium sm:ms-0 sm:min-w-[6.5rem] sm:text-end">{formatKwd(invoice.total)}</Ltr>
        </div>
      </Link>
    </li>
  );
}

function InvoicesReport({ filters, isAdmin }: { filters: ReportFilters; isAdmin: boolean }) {
  const [offset, setOffset] = useState(0);
  const report = useInvoiceReport(filters, offset);
  if (report.isPending) return <Card><LoadingRows /></Card>;
  if (report.isError) return <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card>;
  const { data } = report;
  return (
    <div className={cn("flex flex-col gap-6", report.isPlaceholderData && "opacity-60")}>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>ملخص الفواتير والنقد</CardTitle>
            <CardDescription>قيم الفواتير منفصلة عن المبلغ المستلم، مع توزيعه على طريقة الدفع.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail label="الفواتير الصادرة"><Money value={data.summary.invoices.issued} unit="فاتورة" /></Detail>
          <Detail label="فواتير غير مدفوعة"><Money value={data.summary.invoices.outstanding} unit="فاتورة" /></Detail>
          <Detail label="الفواتير الملغاة"><Money value={data.summary.invoices.cancelled} unit="فاتورة" /></Detail>
          <Detail label="المبلغ المستلم"><CashMoney value={data.summary.cash} /></Detail>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>تفاصيل الفواتير</CardTitle>
            <CardDescription>{filters.dateBasis === "created_date" ? "الأحدث إنشاءً أولاً." : "الأحدث موعداً أولاً."} فاتورة واحدة لكل حجز حتى بعد التعديل. افتح الحجز لعرض السجل الكامل.</CardDescription>
          </div>
        </CardHeader>
        {data.invoices.length === 0 ? <EmptyState icon={Banknote} title="لا توجد فواتير مطابقة" description="غيّر الفترة أو المرشحات لعرض فواتير أخرى." /> : (
          <>
            <ul className="divide-y divide-border">{data.invoices.map(invoice => <InvoiceRow key={invoice.id} invoice={invoice} showBarber={isAdmin} />)}</ul>
            <div data-print-hidden><Pagination total={data.total} limit={data.limit} offset={data.offset} onChange={setOffset} /></div>
          </>
        )}
      </Card>
    </div>
  );
}

export default function InvoicesReportPage() {
  const { filters, isAdmin, search } = useReportFilters();
  // New filters start again from the first page.
  return <InvoicesReport key={search} filters={filters} isAdmin={isAdmin} />;
}
