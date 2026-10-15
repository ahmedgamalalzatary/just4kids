"use client";

import { Coins } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { SalonScope, useReportFilters } from "@/components/reports";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSalonReport } from "@/lib/api/hooks";
import { formatDate } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { cn } from "@/lib/utils";

function SalonReportScreen() {
  const { filters, isAdmin } = useReportFilters();
  const report = useSalonReport({ from: filters.from, to: filters.to, branchId: filters.branchId }, isAdmin);
  if (report.isPending) return <Card><LoadingRows /></Card>;
  if (report.isError) return <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card>;
  const { entries, totals } = report.data;
  return (
    <div className={cn("flex flex-col gap-6", report.isPlaceholderData && "opacity-60")}>
      <SalonScope />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Salon work</CardTitle>
            <CardDescription>Daily entries and totals for the selected period.</CardDescription>
          </div>
        </CardHeader>
        {entries.length === 0 ? <EmptyState icon={Coins} title="No salon work in this period." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-5">Date</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Children</TableHead>
                <TableHead>Cash</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>KNET</TableHead>
                <TableHead className="pe-5">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="ps-5">{formatDate(entry.date)}</TableCell>
                  <TableCell>{entry.branchName}</TableCell>
                  <TableCell data-numeric>{entry.childCount}</TableCell>
                  <TableCell data-numeric>{formatKwd(entry.cash)}</TableCell>
                  <TableCell data-numeric>{formatKwd(entry.link)}</TableCell>
                  <TableCell data-numeric>{formatKwd(entry.knet)}</TableCell>
                  <TableCell data-numeric className="pe-5 font-medium">{formatKwd(entry.total)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell className="ps-5" colSpan={2}>Total</TableCell>
                <TableCell data-numeric>{totals.childCount}</TableCell>
                <TableCell data-numeric>{formatKwd(totals.cash)}</TableCell>
                <TableCell data-numeric>{formatKwd(totals.link)}</TableCell>
                <TableCell data-numeric>{formatKwd(totals.knet)}</TableCell>
                <TableCell data-numeric className="pe-5"><Ltr>{formatKwd(totals.total)}</Ltr></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default function SalonReportPage() {
  return <AdminOnly><SalonReportScreen /></AdminOnly>;
}
