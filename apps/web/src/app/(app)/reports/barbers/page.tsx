"use client";

import Link from "next/link";
import { Scissors } from "lucide-react";
import { Detail, EmptyState, ErrorState, LoadingRows } from "@/components/page";
import { PerformanceDetails, reservationsHref, useReportFilters } from "@/components/reports";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEmployeeReport } from "@/lib/api/hooks";
import { formatDuration } from "@/lib/kuwait-time";
import { utilisation } from "@/lib/reports";
import { cn } from "@/lib/utils";

export default function BarberReportPage() {
  const { filters, isAdmin } = useReportFilters();
  const report = useEmployeeReport(filters);
  if (report.isPending) return <Card><LoadingRows /></Card>;
  if (report.isError) return <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card>;
  const { data } = report;
  if (data.employees.length === 0) return <Card><EmptyState icon={Scissors} title="لا يوجد حلاقون مطابقون" description="غيّر الفرع أو الحلاق في المرشحات." /></Card>;
  const hasAvailability = filters.dateBasis === "visit_date" && filters.from !== "" && filters.to !== "";

  return (
    <div className={cn("flex flex-col gap-6", report.isPlaceholderData && "opacity-60")}>
      {hasAvailability ? null : (
        <p className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          لعرض الساعات المتاحة ونسبة الإشغال اختر «تاريخ الزيارة» مع تاريخ البداية وتاريخ النهاية.
        </p>
      )}
      {data.employees.map(employee => {
        const share = utilisation(employee.work.reservedMinutes, employee.availableMinutes);
        return (
          <Card key={employee.employeeId}>
            <CardHeader>
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2">{employee.displayName}{employee.enabled ? null : <Badge variant="muted">موقوف</Badge>}</CardTitle>
                <CardDescription>الفرع الحالي: {employee.branchName}</CardDescription>
              </div>
              <CardAction data-print-hidden>
                <Button variant="outline" size="sm" asChild>
                  <Link href={reservationsHref(filters, isAdmin ? { employeeId: employee.employeeId } : {})}>عرض الحجوزات</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <PerformanceDetails value={employee}>
                <Detail label="الساعات المتاحة">{employee.availableMinutes === null ? "—" : formatDuration(employee.availableMinutes)}</Detail>
                <Detail label="نسبة الإشغال">{share === null ? "—" : <span data-numeric>{share}%</span>}</Detail>
              </PerformanceDetails>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
