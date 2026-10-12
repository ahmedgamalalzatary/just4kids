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
          <Summary label="إجمالي التحصيل (حلاقون + الصالون)" value={formatKwd(totals.collected.total)} />
          <Summary label="من الحلاقين" value={formatKwd(barbersCollected)} />
          <Summary label="من الصالون" value={formatKwd(salon.collected.total)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>التقرير الشامل لتحصيلات الحلاقين + الصالون</CardTitle>
            <CardDescription>تحصيل كل حلاق من الحجوزات المدفوعة، وصف الصالون من إدخالاته، مع نسبة كل واحد من الإجمالي.</CardDescription>
          </div>
        </CardHeader>
        {empty ? <EmptyState icon={ChartColumn} title="لا توجد تحصيلات في هذه الفترة." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-5">الحلاق / الصالون</TableHead>
                <TableHead>نقداً</TableHead>
                <TableHead>رابط</TableHead>
                <TableHead>كي نت</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead className="pe-5">نسبة من الكل</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {barbers.map(barber => (
                <TableRow key={barber.employeeId}>
                  <TableCell className="ps-5 font-medium">{barber.displayName}{barber.enabled ? null : <span className="ms-2 text-xs text-muted-foreground">موقوف</span>}</TableCell>
                  <CollectedCells row={barber} />
                </TableRow>
              ))}
              <TableRow className="bg-muted/40">
                <TableCell className="ps-5 font-medium">الصالون</TableCell>
                <CollectedCells row={salon} />
              </TableRow>
              <TableRow className="font-semibold">
                <TableCell className="ps-5">الإجمالي</TableCell>
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
