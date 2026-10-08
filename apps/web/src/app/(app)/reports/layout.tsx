"use client";

import { Suspense, type ReactNode } from "react";
import { Printer } from "lucide-react";
import { LoadingRows, PageHeader } from "@/components/page";
import { ReportFilterBar, ReportScope, ReportTabs } from "@/components/reports";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/lib/api/session";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  const isAdmin = useSession().data?.account.role === "admin";
  return (
    <>
      <div data-print-hidden>
        <PageHeader
          title="التقارير"
          description={isAdmin ? "الحجوزات والحلاقات وأداء الحلاقين والفروع، مع المرشحات والتفاصيل." : "حجوزاتك وحلاقاتك وأداؤك، من زياراتك المسندة إليك فقط."}
          actions={<Button variant="outline" onClick={() => window.print()}><Printer aria-hidden />طباعة</Button>}
        />
      </div>
      {/* Filters live in the address, which is read on the client. */}
      <Suspense fallback={<Card><LoadingRows /></Card>}>
        <div className="flex flex-col gap-6">
          <ReportTabs />
          <ReportFilterBar />
          <ReportScope />
          {children}
        </div>
      </Suspense>
    </>
  );
}
