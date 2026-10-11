"use client";

import { Coins } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { useReportFilters } from "@/components/reports";
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
      <Card>
        <CardHeader>
          <div>
            <CardTitle>شغل الصالون</CardTitle>
            <CardDescription>حركة اليوميات حسب الفترة المختارة، مع الإجماليات.</CardDescription>
          </div>
        </CardHeader>
        {entries.length === 0 ? <EmptyState icon={Coins} title="لا توجد بيانات شغل للصالون في هذه الفترة." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-5">التاريخ</TableHead>
                <TableHead>الفرع</TableHead>
                <TableHead>الأطفال</TableHead>
                <TableHead>نقداً</TableHead>
                <TableHead>رابط</TableHead>
                <TableHead>كي نت</TableHead>
                <TableHead className="pe-5">الإجمالي</TableHead>
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
                <TableCell className="ps-5" colSpan={2}>الإجمالي</TableCell>
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
