"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { PerformanceDetails, reservationsHref, useReportFilters } from "@/components/reports";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useClientReport } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

export default function ClientReportPage() {
  const { filters, isAdmin } = useReportFilters();
  const report = useClientReport(filters);
  if (report.isPending) return <Card><LoadingRows /></Card>;
  if (report.isError) return <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card>;
  const { data } = report;
  if (data.clients.length === 0) {
    return <Card><EmptyState icon={Users} title="لا يوجد عملاء مطابقون" description={isAdmin ? "غيّر الفترة أو المرشحات لعرض عملاء آخرين." : "تظهر هنا عملاء زياراتك المسندة إليك فقط."} /></Card>;
  }

  return (
    <div className={cn("flex flex-col gap-6", report.isPlaceholderData && "opacity-60")}>
      {data.clients.map(client => (
        <Card key={client.clientId}>
          <CardHeader>
            <div>
              <CardTitle>{client.name}</CardTitle>
              <CardDescription><Ltr>{client.phone}</Ltr></CardDescription>
            </div>
            {isAdmin ? (
              <CardAction data-print-hidden>
                <Button variant="outline" size="sm" asChild>
                  <Link href={reservationsHref(filters, { clientId: client.clientId })}>عرض حجوزات العميل</Link>
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            <PerformanceDetails value={client} />
            <p className="mt-4 text-xs text-muted-foreground">الزيارات المكتملة أكثر من واحدة تعني عميلاً متكرراً؛ قيم الفواتير الملغاة والنقد المستلم مقياسان منفصلان.</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
