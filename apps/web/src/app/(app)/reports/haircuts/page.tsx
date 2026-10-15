"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Scissors } from "lucide-react";
import { Detail, EmptyState, ErrorState, LoadingRows } from "@/components/page";
import { printableTable, Quantity, reservationsHref, useReportFilters } from "@/components/reports";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHaircutReport } from "@/lib/api/hooks";
import type { HaircutReport } from "@/lib/api/types";
import { formatDate } from "@/lib/kuwait-time";
import { cn } from "@/lib/utils";

type Measures = HaircutReport["totals"];

const measures: { key: Exclude<keyof Measures, "bookings">; label: string }[] = [
  { key: "reserved", label: "Reserved" },
  { key: "completed", label: "Completed" },
  { key: "open", label: "Open" },
  { key: "cancelled", label: "Cancelled" },
  { key: "noShow", label: "Client did not attend" },
];

function Breakdown<Row extends Measures>({ title, description, label, rows, rowKey, name }: {
  title: string; description?: string; label: string; rows: Row[]; rowKey: (row: Row) => string; name: (row: Row) => ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
      </CardHeader>
      {rows.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground">No matching haircuts.</p> : (
        <Table className={printableTable}>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-5">{label}</TableHead>
              <TableHead>Reservations</TableHead>
              {measures.map(measure => <TableHead key={measure.key}>{measure.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={rowKey(row)}>
                <TableCell className="ps-5 font-medium">{name(row)}</TableCell>
                <TableCell data-numeric>{row.bookings}</TableCell>
                {measures.map(measure => <TableCell key={measure.key}><Quantity value={row[measure.key]} /></TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

const linkClass = "underline-offset-4 hover:underline";

export default function HaircutReportPage() {
  const { filters, isAdmin } = useReportFilters();
  const report = useHaircutReport(filters);
  if (report.isPending) return <Card><LoadingRows /></Card>;
  if (report.isError) return <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card>;
  const { data } = report;
  if (data.totals.bookings === 0) return <Card><EmptyState icon={Scissors} title="No matching haircuts" description="Change the period or filters to view other haircuts." /></Card>;

  return (
    <div className={cn("flex flex-col gap-6", report.isPlaceholderData && "opacity-60")}>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Total</CardTitle>
            <CardDescription>Reserved includes all matching bookings. Completed counts completed visits regardless of payment. Open means booked or arrived.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Detail label="Reservations"><span className="text-lg font-semibold" data-numeric>{data.totals.bookings}</span></Detail>
            {measures.map(measure => <Detail key={measure.key} label={`Haircuts ${measure.label}`}><Quantity value={data.totals[measure.key]} /></Detail>)}
          </dl>
        </CardContent>
      </Card>
      <Breakdown title="By date" label="Date" rows={data.byDate} rowKey={row => row.date}
        name={row => <Link className={linkClass} href={reservationsHref(filters, { from: row.date, to: row.date })}>{formatDate(row.date)}</Link>} />
      <Breakdown title="By barber" label="Barber" rows={data.byEmployee} rowKey={row => row.employeeId}
        name={row => isAdmin ? <Link className={linkClass} href={reservationsHref(filters, { employeeId: row.employeeId })}>{row.displayName}</Link> : row.displayName} />
    </div>
  );
}
