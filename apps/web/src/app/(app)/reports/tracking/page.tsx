"use client";

import { AdminOnly } from "@/components/app-shell";
import { TrackingBookings } from "@/components/booking-tracking-report";
import { ErrorState, LoadingRows } from "@/components/page";
import { useReportFilters } from "@/components/reports";
import { Card } from "@/components/ui/card";
import { useBookingTrackingReport } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

function TrackingScreen() {
  const { filters, isAdmin } = useReportFilters();
  const report = useBookingTrackingReport(filters, isAdmin);
  if (report.isPending) return <Card><LoadingRows /></Card>;
  if (report.isError) return <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card>;
  return <div className={cn(report.isPlaceholderData && "opacity-60")}><p className="mb-4 text-xs text-muted-foreground">الحجوزات من الأحدث إلى الأقدم، وحركات كل حجز من الأقدم إلى الأحدث. إرسال واتساب يسجل إجراء الإرسال، ولا يؤكد وصول الرسالة.</p><TrackingBookings data={report.data} /></div>;
}

export default function BookingTrackingPage() {
  return <AdminOnly><TrackingScreen /></AdminOnly>;
}
