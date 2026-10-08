"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import type { BookingEdit } from "@just4kids/contracts";
import { Field, FormAlert } from "@/components/field";
import { LoadingRows, Ltr } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBranches, useClient, useEditBooking, useEmployees } from "@/lib/api/hooks";
import type { Booking } from "@/lib/api/types";
import { formatAddress } from "@/lib/address";
import { editedPricing, reconciliationFor, windowProblem } from "@/lib/booking";
import { kuwaitNow } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";

const KEEP_ADDRESS = "keep";

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`إنقاص ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus /></Button>
        <output className="w-7 text-center font-semibold" data-numeric>{value}</output>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`زيادة ${label}`} disabled={value >= 99} onClick={() => onChange(value + 1)}><Plus /></Button>
      </div>
    </div>
  );
}

function EditForm({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const client = useClient(booking.clientId);
  const employees = useEmployees();
  const branches = useBranches();
  const edit = useEditBooking();
  const [addressId, setAddressId] = useState(KEEP_ADDRESS);
  const [employeeId, setEmployeeId] = useState(booking.employeeId);
  const [date, setDate] = useState(booking.date);
  const [startTime, setStartTime] = useState(booking.startTime);
  const [endTime, setEndTime] = useState(booking.endTime);
  const [adultCount, setAdultCount] = useState(booking.adultCount);
  const [childCount, setChildCount] = useState(booking.childCount);
  const [reason, setReason] = useState("");
  const [cashReason, setCashReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  if (client.isPending || employees.isPending || branches.isPending) return <LoadingRows rows={4} />;
  if (client.isError || employees.isError || branches.isError) return <FormAlert error={client.error ?? employees.error ?? branches.error} />;

  const selectedEmployee = employees.data.find(employee => employee.id === employeeId);
  const timingChanged = date !== booking.date || startTime !== booking.startTime || endTime !== booking.endTime;
  const countsChanged = adultCount !== booking.adultCount || childCount !== booking.childCount;
  const barberChanged = employeeId !== booking.employeeId;
  const addressChanged = addressId !== KEEP_ADDRESS;
  const changed = timingChanged || countsChanged || barberChanged || addressChanged;
  // A reassigned booking takes the new barber's current branch; otherwise it keeps its recorded branch.
  const branchId = barberChanged ? selectedEmployee?.branchId ?? booking.branchId : booking.branchId;
  const pricing = editedPricing(booking, { adultCount, childCount, branchId }, branches.data);
  const reconciliation = booking.invoice.paymentStatus === "paid" && pricing ? reconciliationFor(booking.invoice.total, pricing.total) : null;

  const submit = () => {
    if (!changed) { setProblem("لم تغيّر شيئاً بعد"); return; }
    if (timingChanged) { const issue = windowProblem({ date, startTime, endTime }); if (issue) { setProblem(issue); return; } }
    if (adultCount + childCount === 0) { setProblem("حلاقة واحدة على الأقل"); return; }
    if (reconciliation && !cashReason.trim()) { setProblem("اكتب سبب فرق النقد"); return; }
    setProblem(null);
    const input: BookingEdit & { id: string } = {
      id: booking.id,
      expectedVersion: booking.visitVersion,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(addressChanged ? { addressId } : {}),
      ...(barberChanged ? { employeeId } : {}),
      ...(timingChanged ? { date, startTime, endTime } : {}),
      ...(countsChanged ? { adultCount, childCount } : {}),
      ...(reconciliation ? { reconciliation: { ...reconciliation, reason: cashReason.trim() } } : {}),
    };
    edit.mutate(input, { onSuccess: () => { toast.success("تم تعديل الحجز"); onDone(); } });
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <Field label="العنوان">
          <Select value={addressId} onValueChange={setAddressId}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP_ADDRESS}>إبقاء عنوان الحجز الحالي</SelectItem>
              {client.data.addresses.map(address => <SelectItem key={address.id} value={address.id}>{formatAddress(address)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="الحلاق" hint="تحقق من التوفر يتم عند الحفظ.">
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {employees.data.filter(employee => employee.enabled || employee.id === booking.employeeId).map(employee => (
                <SelectItem key={employee.id} value={employee.id}>{employee.displayName}، {employee.branch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="التاريخ"><Input type="date" dir="ltr" min={kuwaitNow().date} value={date} onChange={event => setDate(event.target.value)} /></Field>
          <Field label="من"><Input type="time" dir="ltr" value={startTime} onChange={event => setStartTime(event.target.value)} /></Field>
          <Field label="إلى"><Input type="time" dir="ltr" value={endTime} onChange={event => setEndTime(event.target.value)} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stepper label="بالغون" value={adultCount} onChange={setAdultCount} />
          <Stepper label="أطفال" value={childCount} onChange={setChildCount} />
        </div>
        <div className="rounded-md bg-muted px-4 py-3 text-sm">
          {pricing ? (
            <p className="flex flex-wrap justify-between gap-2">
              <span>الإجمالي بعد التعديل</span>
              <span><Ltr className="font-semibold">{formatKwd(pricing.total)}</Ltr>{pricing.total !== booking.invoice.total ? <span className="ms-2 text-muted-foreground">(كان <Ltr>{formatKwd(booking.invoice.total)}</Ltr>)</span> : null}</span>
            </p>
          ) : <p>تعذر حساب السعر لفرع الحلاق المختار.</p>}
        </div>
        {reconciliation ? (
          <div className="flex flex-col gap-3 rounded-md border border-sun bg-sun/10 p-4">
            <p className="text-sm font-medium">
              {reconciliation.action === "extra_cash" ? "الحجز مدفوع: سجّل استلام مبلغ إضافي قدره " : "الحجز مدفوع: سجّل إرجاع مبلغ قدره "}
              <Ltr>{formatKwd(reconciliation.amount)}</Ltr> للعميل.
            </p>
            <Field label="سبب فرق النقد"><Textarea rows={2} value={cashReason} onChange={event => setCashReason(event.target.value)} maxLength={1000} /></Field>
          </div>
        ) : null}
        <Field label="سبب التعديل" optional><Textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field>
        {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
        <FormAlert error={edit.error} />
      </div>
      <DialogFooter><Button onClick={submit} disabled={edit.isPending || !pricing}>حفظ التعديل</Button></DialogFooter>
    </>
  );
}

export function BookingEditDialog({ booking, open, onOpenChange }: { booking: Booking; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>تعديل الحجز <Ltr>{booking.reference}</Ltr></DialogTitle>
          <DialogDescription>يحتفظ الحجز برقمه وفاتورته، ويُحفظ كل تعديل في السجل. لا يتغير السعر المتفق عليه إلا بتغيير العدد أو بالنقل إلى فرع آخر.</DialogDescription>
        </DialogHeader>
        {open ? <EditForm booking={booking} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
