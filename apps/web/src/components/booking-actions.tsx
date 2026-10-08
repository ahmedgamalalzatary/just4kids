"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Banknote, Loader2 } from "lucide-react";
import type { VisitStatus } from "@just4kids/contracts";
import { Field, FormAlert } from "@/components/field";
import { Ltr } from "@/components/page";
import { visitStatusLabels } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRecordPayment, useUndoPayment, useVisitCorrection, useVisitTransition } from "@/lib/api/hooks";
import type { Booking, Payment } from "@/lib/api/types";
import { formatTime } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { visitActions, type VisitAction } from "@/lib/visit-rules";

const actionCopy: Record<VisitAction["status"], { label: string; done: string; confirm: string; waiting: (booking: Booking) => string }> = {
  arrived: { label: "وصلت إلى العنوان", done: "تم تسجيل الوصول", confirm: "تأكيد الوصول إلى عنوان العميل.", waiting: booking => `متاح من ${formatTime(booking.startTime)}` },
  completed: { label: "اكتملت الزيارة", done: "تم تسجيل اكتمال الزيارة", confirm: "تأكيد انتهاء الحلاقة لكل الحاضرين. لا يغيّر هذا حالة الدفع.", waiting: booking => `متاح من ${formatTime(booking.startTime)}` },
  no_show: { label: "العميل لم يحضر", done: "تم تسجيل عدم الحضور", confirm: "تبقى الفاتورة صادرة، ولا يمكن للحلاق تغيير هذه الحالة بعد ذلك.", waiting: booking => `متاح بعد ${formatTime(booking.endTime)}` },
  cancelled: { label: "إلغاء الزيارة", done: "تم إلغاء الزيارة", confirm: "تُلغى الفاتورة وتبقى ظاهرة في السجل. أي نقد مسجل لا يُسترد تلقائياً.", waiting: () => "" },
};

/** Normal visit steps for the assigned barber or the administrator, each confirmed before sending. */
export function VisitActions({ booking }: { booking: Booking }) {
  const transition = useVisitTransition();
  const [pending, setPending] = useState<VisitAction["status"] | null>(null);
  const [reason, setReason] = useState("");
  const actions = visitActions(booking);
  if (actions.length === 0) return null;

  const close = () => { setPending(null); setReason(""); transition.reset(); };
  const confirm = () => {
    if (!pending) return;
    transition.mutate({ id: booking.id, status: pending, expectedVersion: booking.visitVersion, ...(reason.trim() ? { reason: reason.trim() } : {}) }, {
      onSuccess: () => { toast.success(actionCopy[pending].done); close(); },
    });
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map(action => (
          <div key={action.status} className="flex flex-col gap-1">
            <Button variant={action.status === "cancelled" ? "outline" : action.status === "no_show" ? "secondary" : "default"} size="lg"
              disabled={!action.allowed} onClick={() => setPending(action.status)}
              className={action.status === "cancelled" ? "text-destructive hover:text-destructive" : undefined}>
              {actionCopy[action.status].label}
            </Button>
            {!action.allowed ? <span className="text-xs text-muted-foreground">{actionCopy[action.status].waiting(booking)}</span> : null}
          </div>
        ))}
      </div>
      <Dialog open={pending !== null} onOpenChange={open => { if (!open) close(); }}>
        <DialogContent>
          {pending ? (
            <>
              <DialogHeader>
                <DialogTitle>{actionCopy[pending].label}؟</DialogTitle>
                <DialogDescription>{actionCopy[pending].confirm}</DialogDescription>
              </DialogHeader>
              <Field label="ملاحظة" optional><Textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field>
              <FormAlert error={transition.error} />
              <DialogFooter>
                <Button variant={pending === "cancelled" ? "destructive" : "default"} onClick={confirm} disabled={transition.isPending}>
                  {transition.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {actionCopy[pending].label}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Records the full current invoice amount in cash. The amount is set by the server, never typed. */
export function RecordPaymentButton({ booking }: { booking: Booking }) {
  const record = useRecordPayment();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" variant="secondary" onClick={() => setOpen(true)}><Banknote aria-hidden />استلمت المبلغ نقداً</Button>
      <Dialog open={open} onOpenChange={value => { if (!value) record.reset(); setOpen(value); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسجيل دفع نقدي كامل</DialogTitle>
            <DialogDescription>يُسجَّل المبلغ الكامل للفاتورة. لا يوجد دفع جزئي.</DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-muted px-4 py-3 text-center text-2xl font-semibold"><Ltr>{formatKwd(booking.invoice.total)}</Ltr></p>
          <FormAlert error={record.error} />
          <DialogFooter>
            <Button onClick={() => record.mutate({ id: booking.id, expectedVersion: booking.visitVersion }, { onSuccess: () => { toast.success("تم تسجيل الدفع النقدي"); setOpen(false); } })} disabled={record.isPending}>
              {record.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              تأكيد الاستلام
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const allStatuses: VisitStatus[] = ["booked", "arrived", "completed", "cancelled", "no_show"];

/** Administrator-only correction of any visit state, with a required reason. */
export function CorrectionDialog({ booking, open, onOpenChange }: { booking: Booking; open: boolean; onOpenChange: (open: boolean) => void }) {
  const correct = useVisitCorrection();
  const [status, setStatus] = useState<VisitStatus | "">("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const close = (value: boolean) => { if (!value) { correct.reset(); setStatus(""); setReason(""); setProblem(null); } onOpenChange(value); };
  const submit = () => {
    if (!status) { setProblem("اختر الحالة الصحيحة"); return; }
    if (!reason.trim()) { setProblem("اكتب سبب التصحيح"); return; }
    setProblem(null);
    correct.mutate({ id: booking.id, status, reason: reason.trim(), expectedVersion: booking.visitVersion }, { onSuccess: () => { toast.success("تم تصحيح حالة الزيارة"); close(false); } });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تصحيح حالة الزيارة</DialogTitle>
          <DialogDescription>
            الحالة الحالية: {visitStatusLabels[booking.visitStatus]}. إعادة الزيارة إلى حالة تحجز وقت الحلاق تتطلب أن يكون متاحاً.
            إعادة فتح زيارة ملغاة تعيد فاتورتها كما كانت، ولا يتغير سجل النقد.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="الحالة الصحيحة">
            <Select value={status} onValueChange={value => setStatus(value as VisitStatus)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
              <SelectContent>{allStatuses.filter(option => option !== booking.visitStatus).map(option => <SelectItem key={option} value={option}>{visitStatusLabels[option]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="السبب"><Textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field>
          {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
          <FormAlert error={correct.error} />
        </div>
        <DialogFooter><Button onClick={submit} disabled={correct.isPending}>حفظ التصحيح</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Administrator-only undo of a mistaken cash entry. It voids the receipt; it is not a refund. */
export function UndoPaymentDialog({ booking, payment, open, onOpenChange }: { booking: Booking; payment: Payment; open: boolean; onOpenChange: (open: boolean) => void }) {
  const undo = useUndoPayment();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const close = (value: boolean) => { if (!value) { undo.reset(); setReason(""); setProblem(null); } onOpenChange(value); };
  const submit = () => {
    if (!reason.trim()) { setProblem("اكتب سبب الإلغاء"); return; }
    undo.mutate({ id: booking.id, paymentId: payment.id, reason: reason.trim(), expectedVersion: booking.visitVersion }, { onSuccess: () => { toast.success("تم إلغاء قيد الدفع"); close(false); } });
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إلغاء قيد دفع خاطئ</DialogTitle>
          <DialogDescription>يُلغى القيد ويحتفظ السجل به، وتعود الفاتورة غير مدفوعة. هذا تصحيح لخطأ تسجيل، وليس إرجاعاً للنقد.</DialogDescription>
        </DialogHeader>
        <p className="text-sm">القيد الحالي: <Ltr className="font-medium">{formatKwd(payment.amount)}</Ltr></p>
        <Field label="السبب"><Textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field>
        {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
        <FormAlert error={undo.error} />
        <DialogFooter><Button variant="destructive" onClick={submit} disabled={undo.isPending}>إلغاء القيد</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
