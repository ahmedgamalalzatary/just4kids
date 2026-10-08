"use client";

import { useState, type ReactNode } from "react";
import { History } from "lucide-react";
import { UndoPaymentDialog } from "@/components/booking-actions";
import { EmptyState, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { visitStatusLabels } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBookingHistory, useBookingPayments, useBookingRevisions, useEmployees } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Booking, BookingRevision, PaymentEvent, VisitEvent } from "@/lib/api/types";
import { formatAddress } from "@/lib/address";
import { formatDate, formatDateTime, formatWindow } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";

/** Resolves account IDs to readable names with the data this viewer is allowed to see. */
function useActorName() {
  const session = useSession();
  const account = session.data?.account;
  const employees = useEmployees(account?.role === "admin");
  return (accountId: string | null) => {
    if (!accountId) return "النظام";
    if (accountId === account?.id) return account.role === "admin" ? "المدير" : "أنت";
    const employee = employees.data?.find(candidate => candidate.id === accountId);
    if (employee) return employee.displayName;
    return account?.role === "admin" ? "المدير" : "حساب آخر";
  };
}

function Timeline({ children }: { children: ReactNode }) {
  return <ol className="relative flex flex-col gap-5 border-s border-border ps-5">{children}</ol>;
}

function TimelineItem({ title, meta, children }: { title: ReactNode; meta: string; children?: ReactNode }) {
  return (
    <li className="relative">
      <span aria-hidden className="absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full border-2 border-card bg-primary" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{meta}</p>
      {children ? <div className="mt-1.5 text-sm">{children}</div> : null}
    </li>
  );
}

function VisitHistory({ id }: { id: string }) {
  const history = useBookingHistory(id);
  const actorName = useActorName();
  if (history.isPending) return <LoadingRows rows={3} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  const name = (event: VisitEvent) => event.actorType === "client" ? "العميل" : event.actorType === "system" ? "النظام" : actorName(event.actorAccountId);
  return (
    <Timeline>
      {[...history.data].reverse().map(event => (
        <TimelineItem key={event.id}
          title={event.fromStatus === null ? `أُنشئ الحجز: ${visitStatusLabels[event.toStatus]}` : `${event.correction ? "تصحيح: " : ""}${visitStatusLabels[event.fromStatus]} ← ${visitStatusLabels[event.toStatus]}`}
          meta={`${name(event)}، ${formatDateTime(event.occurredAt)}`}>
          {event.reason ? <p className="text-muted-foreground">{event.reason}</p> : null}
          {event.previousInvoiceStatus && event.previousInvoiceStatus !== event.invoiceStatus ? <p className="text-xs">الفاتورة: {event.invoiceStatus === "cancelled" ? "أُلغيت" : "أُعيد إصدارها"}</p> : null}
        </TimelineItem>
      ))}
    </Timeline>
  );
}

function revisionChanges(revision: BookingRevision): string[] {
  const { before, after } = revision;
  const changes: string[] = [];
  if (before.date !== after.date || before.startTime !== after.startTime || before.endTime !== after.endTime) {
    changes.push(`الموعد: من ${formatDate(before.date)} ${formatWindow(before.startTime, before.endTime)} إلى ${formatDate(after.date)} ${formatWindow(after.startTime, after.endTime)}`);
  }
  if (before.employee.id !== after.employee.id) changes.push(`الحلاق: من ${before.employee.displayName} (${before.employee.branchName}) إلى ${after.employee.displayName} (${after.employee.branchName})`);
  if (formatAddress(before.address) !== formatAddress(after.address) || before.address.instructions !== after.address.instructions) changes.push(`العنوان: ${formatAddress(after.address)}`);
  if (before.adultCount !== after.adultCount || before.childCount !== after.childCount) changes.push(`العدد: من ${before.adultCount} بالغ و${before.childCount} طفل إلى ${after.adultCount} بالغ و${after.childCount} طفل`);
  if (before.invoice.total !== after.invoice.total) changes.push(`الإجمالي: من ${formatKwd(before.invoice.total)} إلى ${formatKwd(after.invoice.total)}`);
  return changes;
}

function Revisions({ id }: { id: string }) {
  const revisions = useBookingRevisions(id);
  const actorName = useActorName();
  if (revisions.isPending) return <LoadingRows rows={3} />;
  if (revisions.isError) return <ErrorState error={revisions.error} onRetry={() => revisions.refetch()} />;
  if (revisions.data.length === 0) return <EmptyState icon={History} title="لم يُعدَّل الحجز" className="py-8" />;
  return (
    <Timeline>
      {[...revisions.data].reverse().map(revision => (
        <TimelineItem key={revision.id} title="تعديل الحجز" meta={`${actorName(revision.actorAccountId)}، ${formatDateTime(revision.occurredAt)}`}>
          <ul className="flex flex-col gap-1">{revisionChanges(revision).map(change => <li key={change}>{change}</li>)}</ul>
          {revision.reason ? <p className="mt-1 text-muted-foreground">السبب: {revision.reason}</p> : null}
        </TimelineItem>
      ))}
    </Timeline>
  );
}

const paymentKinds: Record<PaymentEvent["kind"], string> = {
  recorded: "تسجيل دفع نقدي كامل",
  voided: "إلغاء قيد دفع خاطئ",
  extra_cash: "استلام مبلغ إضافي بعد تعديل",
  refund: "إرجاع مبلغ للعميل بعد تعديل",
};

function Payments({ booking }: { booking: Booking }) {
  const payments = useBookingPayments(booking.id);
  const actorName = useActorName();
  const isAdmin = useSession().data?.account.role === "admin";
  const [undoOpen, setUndoOpen] = useState(false);
  if (payments.isPending) return <LoadingRows rows={3} />;
  if (payments.isError) return <ErrorState error={payments.error} onRetry={() => payments.refetch()} />;
  const active = payments.data.payment;
  return (
    <div className="flex flex-col gap-5">
      {active ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-status-completed-soft px-4 py-3 text-status-completed">
          <p className="text-sm">المبلغ المستلم حالياً: <Ltr className="font-semibold">{formatKwd(active.amount)}</Ltr></p>
          {isAdmin ? <Button variant="outline" size="sm" onClick={() => setUndoOpen(true)}>إلغاء قيد خاطئ</Button> : null}
        </div>
      ) : null}
      {payments.data.events.length === 0 ? <EmptyState icon={History} title="لم يُسجَّل أي نقد" className="py-8" /> : (
        <Timeline>
          {[...payments.data.events].reverse().map(event => (
            <TimelineItem key={event.id} title={<>{paymentKinds[event.kind]}: <Ltr>{formatKwd(event.amount)}</Ltr></>} meta={`${actorName(event.actorAccountId)}، ${formatDateTime(event.occurredAt)}`}>
              {event.reason ? <p className="text-muted-foreground">{event.reason}</p> : null}
            </TimelineItem>
          ))}
        </Timeline>
      )}
      {active && isAdmin ? <UndoPaymentDialog booking={booking} payment={active} open={undoOpen} onOpenChange={setUndoOpen} /> : null}
    </div>
  );
}

export function BookingHistory({ booking }: { booking: Booking }) {
  return (
    <Tabs defaultValue="visit" dir="rtl" className="gap-4">
      <TabsList>
        <TabsTrigger value="visit">سجل الزيارة</TabsTrigger>
        <TabsTrigger value="revisions">التعديلات</TabsTrigger>
        <TabsTrigger value="cash">النقد</TabsTrigger>
      </TabsList>
      <TabsContent value="visit"><VisitHistory id={booking.id} /></TabsContent>
      <TabsContent value="revisions"><Revisions id={booking.id} /></TabsContent>
      <TabsContent value="cash"><Payments booking={booking} /></TabsContent>
    </Tabs>
  );
}
