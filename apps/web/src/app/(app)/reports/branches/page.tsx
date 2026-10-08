"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/page";
import { Money, PerformanceDetails, printableTable, Quantity, reservationsHref, reservedHoursLabel, useReportFilters } from "@/components/reports";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranchReport } from "@/lib/api/hooks";
import { formatDuration } from "@/lib/kuwait-time";
import { cn } from "@/lib/utils";

export default function BranchReportPage() {
  const { filters, isAdmin } = useReportFilters();
  const report = useBranchReport(filters);
  if (report.isPending) return <Card><LoadingRows /></Card>;
  if (report.isError) return <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card>;
  const { data } = report;
  if (data.branches.length === 0) {
    return <Card><EmptyState icon={Store} title="لا توجد فروع مطابقة" description={isAdmin ? "أضف فرعاً أو غيّر المرشحات." : "تظهر هنا الفروع التي سُجلت فيها زياراتك المطابقة."} /></Card>;
  }

  return (
    <div className={cn("flex flex-col gap-6", report.isPlaceholderData && "opacity-60")}>
      {data.branches.map(branch => (
        <Card key={branch.branchId}>
          <CardHeader>
            <div>
              <CardTitle>{branch.branchName}</CardTitle>
              <CardDescription>حسب الفرع المسجل على كل حجز، حتى بعد نقل الحلاق.</CardDescription>
            </div>
            <CardAction data-print-hidden>
              <Button variant="outline" size="sm" asChild>
                <Link href={reservationsHref(filters, isAdmin ? { branchId: branch.branchId } : {})}>عرض الحجوزات</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent><PerformanceDetails value={branch} /></CardContent>
          {branch.employees.length === 0 ? <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">لا يوجد عمل مسجل للحلاقين في هذا الفرع.</p> : (
            <div className="border-t border-border">
              <Table className={printableTable}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="ps-5">الحلاق</TableHead>
                    <TableHead>الحجوزات</TableHead>
                    <TableHead>الزيارات المكتملة</TableHead>
                    <TableHead>الحلاقات المكتملة</TableHead>
                    <TableHead>{reservedHoursLabel}</TableHead>
                    <TableHead>الفواتير الصادرة</TableHead>
                    <TableHead>النقد المستلم</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branch.employees.map(employee => (
                    <TableRow key={employee.employeeId}>
                      <TableCell className="ps-5 font-medium">
                        {isAdmin ? <Link className="underline-offset-4 hover:underline" href={reservationsHref(filters, { branchId: branch.branchId, employeeId: employee.employeeId })}>{employee.displayName}</Link> : employee.displayName}
                      </TableCell>
                      <TableCell data-numeric>{employee.work.bookings}</TableCell>
                      <TableCell data-numeric>{employee.work.completedVisits}</TableCell>
                      <TableCell><Quantity value={employee.work.completed} /></TableCell>
                      <TableCell>{formatDuration(employee.work.reservedMinutes)}</TableCell>
                      <TableCell><Money value={employee.invoices.issued} unit="فاتورة" /></TableCell>
                      <TableCell><Money value={employee.cash} unit="إيصال" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
