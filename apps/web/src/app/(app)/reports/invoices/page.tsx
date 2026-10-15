"use client";

import Link from "next/link";
import { useState } from "react";
import { Banknote } from "lucide-react";
import { Detail, EmptyState, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { Pagination } from "@/components/pagination";
import { CollectedCash, Money, useReportFilters } from "@/components/reports";
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
  return [invoice.amountCash !== "0.000" ? `Cash ${invoice.amountCash}` : null, invoice.amountLink !== "0.000" ? `Link ${invoice.amountLink}` : null]
    .filter(Boolean).join(", ");
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
          <Ltr className="min-w-0 break-all text-xs text-muted-foreground">{invoice.reference}</Ltr>
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{invoice.client.phone}</p>
          <p className="truncate text-sm text-muted-foreground">
            {invoice.address.area}, {lineItems(invoice)}{showBarber ? `, with ${invoice.employee.displayName}` : ""}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <SourceLabel source={invoice.source} />
            <span className="text-xs text-muted-foreground">Issued {formatDateTime(invoice.issuedAt)}</span>
            {invoice.editCount ? <span className="text-xs text-muted-foreground" data-numeric>{invoice.editCount} Edit</span> : null}
            {invoice.correctionCount ? <span className="text-xs text-muted-foreground" data-numeric>{invoice.correctionCount} Status correction</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <VisitStatusBadge status={invoice.visitStatus} />
          <PaymentBadge paymentStatus={invoice.paymentStatus} invoiceStatus={invoice.status} />
          {invoice.cash ? (
            <span className="text-xs text-muted-foreground">
              {paymentMethodLabels[invoice.cash.method]} <Ltr>{formatKwd(invoice.cash.amount)}</Ltr>
              <span className="ms-1" data-numeric>on {formatDateTime(invoice.cash.recordedAt)}</span>
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
            <CardTitle>Invoice and payment summary</CardTitle>
            <CardDescription>Invoice values are separate from collected payments, which are grouped by payment method.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail label="Issued invoices"><Money value={data.summary.invoices.issued} unit="invoice" /></Detail>
          <Detail label="Unpaid invoices"><Money value={data.summary.invoices.outstanding} unit="invoice" /></Detail>
          <Detail label="Cancelled invoices"><Money value={data.summary.invoices.cancelled} unit="invoice" /></Detail>
          <Detail label="Collected amount"><CollectedCash value={data.summary.cash} unit="entry" /></Detail>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Invoice details</CardTitle>
            <CardDescription>{filters.dateBasis === "created_date" ? "Newest created first." : "Latest appointment first."} One invoice per reservation, including after edits. Open the reservation for full history.</CardDescription>
          </div>
        </CardHeader>
        {data.invoices.length === 0 ? <EmptyState icon={Banknote} title="No matching invoices" description="Change the period or filters to view other invoices." /> : (
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
