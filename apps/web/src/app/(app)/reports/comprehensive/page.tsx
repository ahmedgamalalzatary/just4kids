"use client";

import { ChartColumn } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { SalonScope, useReportFilters } from "@/components/reports";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useComprehensiveReport } from "@/lib/api/hooks";
import type { ComprehensiveReport } from "@/lib/api/types";
import { formatKwd, fromFils, toFils } from "@/lib/money";
import { shareText } from "@/lib/salon";
import { cn } from "@/lib/utils";

type Row = ComprehensiveReport["barbers"][number];

function sumCollected(rows: { collected: { count: number; total: string } }[]) {
  return rows.reduce((total, row) => fromFils(toFils(total) + toFils(row.collected.total)), "0.000");
}

function CollectedCells({ row }: { row: Row | ComprehensiveReport["salon"] }) {
  return (
    <>
      <TableCell data-numeric>{formatKwd(row.cash.total)}</TableCell>
      <TableCell data-numeric>{formatKwd(row.link.total)}</TableCell>
      <TableCell data-numeric>{formatKwd(row.knet.total)}</TableCell>
      <TableCell data-numeric className="font-medium"><Ltr>{formatKwd(row.collected.total)}</Ltr></TableCell>
      <TableCell className="pe-5" data-numeric>{shareText(row.share)}</TableCell>
    </>
  );
}

function ComprehensiveScreen() {
  const { filters, isAdmin } = useReportFilters();
  const report = useComprehensiveReport({ from: filters.from, to: filters.to }, isAdmin);
  if (report.isPending) return <Card><LoadingRows /></Card>;
  if (report.isError) return <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card>;
  const { barbers, salon, totals } = report.data;
  const barbersCollected = sumCollected(barbers);
  const empty = barbers.length === 0 && totals.collected.count === 0;
  return (
    <div className={cn("flex flex-col gap-6", report.isPlaceholderData && "opacity-60")}>
      <SalonScope />
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Summary label="Total collections (barbers + salon)" value={formatKwd(totals.collected.total)} />
          <Summary label="From barbers" value={formatKwd(barbersCollected)} />
          <Summary label="From salon" value={formatKwd(salon.collected.total)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Combined barber and salon collections report</CardTitle>
            <CardDescription>Each barber&apos;s daily collections and the salon&apos;s entries, with their share of the total.</CardDescription>
          </div>
        </CardHeader>
        {empty ? <EmptyState icon={ChartColumn} title="No collections in this period." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-5">Barber / salon</TableHead>
                <TableHead>Cash</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>KNET</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="pe-5">Share of total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {barbers.map(barber => (
                <TableRow key={barber.employeeId}>
                  <TableCell className="ps-5 font-medium">{barber.displayName}{barber.enabled ? null : <span className="ms-2 text-xs text-muted-foreground">Stopped</span>}</TableCell>
                  <CollectedCells row={barber} />
                </TableRow>
              ))}
              <TableRow className="bg-muted/40">
                <TableCell className="ps-5 font-medium">Salon</TableCell>
                <CollectedCells row={salon} />
              </TableRow>
              <TableRow className="font-semibold">
                <TableCell className="ps-5">Total</TableCell>
                <TableCell data-numeric>{formatKwd(totals.cash.total)}</TableCell>
                <TableCell data-numeric>{formatKwd(totals.link.total)}</TableCell>
                <TableCell data-numeric>{formatKwd(totals.knet.total)}</TableCell>
                <TableCell data-numeric><Ltr>{formatKwd(totals.collected.total)}</Ltr></TableCell>
                <TableCell className="pe-5" data-numeric>100.0%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Ltr className="text-lg font-semibold">{value}</Ltr>
    </div>
  );
}

export default function ComprehensiveReportPage() {
  return <AdminOnly><ComprehensiveScreen /></AdminOnly>;
}
