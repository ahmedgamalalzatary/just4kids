"use client";

import Link from "next/link";
import { Suspense, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronRight, Loader2, MessageCircle, Minus, Plus, X } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { EmployeeAvatar } from "@/components/avatar";
import { PhoneBookingClient, type BookingClientSelection } from "@/components/phone-booking-client";
import { Field, FormAlert } from "@/components/field";
import { ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { SlotPills } from "@/components/booking-slot-pills";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { keys, useCreateBooking, useCreateBookingWithClient, useEmployees, useSendToBarber } from "@/lib/api/hooks";
import type { Booking } from "@/lib/api/types";
import { specialChildrenProblem } from "@/lib/booking";
import { durationOptions, whatsAppLink } from "@/lib/day";
import { formatDate, formatDuration, formatWindow, kuwaitNow } from "@/lib/kuwait-time";
import { formatKwd, invoiceTotal, typedPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

function Step({ number, title, done, children }: { number: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <Card>
      <h2 className="flex items-center gap-3 border-b border-border px-5 py-4 text-base font-semibold">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-sm", done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")} aria-hidden>
          {done ? <Check className="size-4" /> : number}
        </span>
        {title}
      </h2>
      <div className="px-5 py-4">{children}</div>
    </Card>
  );
}

function Counter({ label, value, onChange, max = 99 }: { label: string; value: number; onChange: (value: number) => void; max?: number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`إنقاص ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus /></Button>
        <output className="w-8 text-center text-lg font-semibold" data-numeric aria-live="polite">{value}</output>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`زيادة ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus /></Button>
      </div>
    </div>
  );
}

function BarberPicker({ onPick }: { onPick: (id: string) => void }) {
  const employees = useEmployees();
  if (employees.isPending) return <LoadingRows rows={2} />;
  if (employees.isError) return <ErrorState error={employees.error} onRetry={() => employees.refetch()} />;
  const enabled = employees.data.filter(employee => employee.enabled);
  if (enabled.length === 0) return <p className="text-sm text-muted-foreground">لا يوجد حلاق مفعّل. <Link href="/employees" className="text-primary underline">الحلاقون</Link></p>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="الحلاق">
      {enabled.map(employee => (
        <button key={employee.id} type="button" role="radio" aria-checked={false} onClick={() => onPick(employee.id)}
          className="flex flex-col items-center gap-2 rounded-lg border border-border px-3 py-4 text-center transition-colors hover:border-primary hover:bg-accent">
          <EmployeeAvatar employeeId={employee.id} name={employee.displayName} version={employee.photoUpdatedAt} className="size-16 text-xl" />
          <span className="font-medium">{employee.displayName}</span>
        </button>
      ))}
    </div>
  );
}

function NewBookingScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [barberId, setBarberId] = useState<string | null>(params.get("barber"));
  const [date, setDate] = useState(() => params.get("date") || kuwaitNow().date);
  const [duration, setDuration] = useState<number>(30);
  const [slot, setSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [clientSelection, setClientSelection] = useState<BookingClientSelection>(null);
  const [adultCount, setAdultCount] = useState(0);
  const [childCount, setChildCount] = useState(1);
  const [specialChildCount, setSpecialChildCount] = useState(0);
  const [notes, setNotes] = useState("");
  const [amountCash, setAmountCash] = useState("");
  const [amountLink, setAmountLink] = useState("");
  const [created, setCreated] = useState<Booking | null>(null);

  const employees = useEmployees();
  const create = useCreateBooking();
  const createNew = useCreateBookingWithClient();
  const send = useSendToBarber();

  const barber = employees.data?.find(employee => employee.id === barberId) ?? null;
  const haircuts = adultCount + childCount;
  const specialProblem = specialChildrenProblem(childCount, specialChildCount);
  // The administrator types the visit price; there is no branch-derived price.
  const price = typedPrice({ amountCash, amountLink });
  const total = price ? invoiceTotal(price) : null;
  const ready = Boolean(barber?.enabled && slot && clientSelection && haircuts > 0 && !specialProblem && price);

  const pickBarber = (id: string | null) => { setBarberId(id); setSlot(null); };
  const setChildren = (value: number) => { setChildCount(value); setSpecialChildCount(current => Math.min(current, value)); };
  const submit = () => {
    if (!ready || !barber || !slot || !clientSelection || !price) return;
    const details = { employeeId: barber.id, date, startTime: slot.startTime, endTime: slot.endTime, adultCount, childCount, specialChildCount, ...price, ...(notes.trim() ? { notes: notes.trim() } : {}) };
    const options = {
      onSuccess: (booking: Booking) => { toast.success(`تم الحجز برقم ${booking.reference}`); setCreated(booking); },
      onError: (error: Error) => {
        if (error instanceof ApiError && error.code === "BARBER_UNAVAILABLE") { setSlot(null); void queryClient.invalidateQueries({ queryKey: ["bookings", "list"] }); void queryClient.invalidateQueries({ queryKey: ["schedules", barber.id] }); }
        if (error instanceof ApiError && ["PHONE_ALREADY_USED", "CLIENT_DISABLED"].includes(error.code)) void queryClient.invalidateQueries({ queryKey: keys.clients });
        if (error instanceof ApiError && error.code === "AREA_UNAVAILABLE") void queryClient.invalidateQueries({ queryKey: keys.areas });
      },
    };
    if (clientSelection.kind === "new") {
      create.reset();
      createNew.mutate({ ...details, client: clientSelection.client }, options);
    } else {
      createNew.reset();
      create.mutate({ ...details, clientId: clientSelection.client.id, addressId: clientSelection.address.id }, options);
    }
  };
  // G15: after saving, offer to send the details to the barber on WhatsApp or return to today's list.
  const sendCreated = () => {
    if (!created || !barber) return;
    send.mutate({ id: created.id });
    window.open(whatsAppLink(barber.phone, created), "_blank", "noopener,noreferrer");
    router.push(`/bookings/${created.id}`);
  };
  const backToToday = () => router.push("/bookings");

  return (
    <>
      <PageHeader
        back={<Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronRight className="size-4" aria-hidden />لوحة التحكم</Link>}
        title={barber ? `حجز جديد مع ${barber.displayName}` : "حجز جديد"}
        description="اختر الحلاق ثم وقت البداية، ثم رقم هاتف العميل وعنوان الزيارة وعدد الحلاقات."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-4">
          <Step number={1} title="الحلاق" done={Boolean(barber?.enabled)}>
            {barberId === null ? <BarberPicker onPick={pickBarber} /> : employees.isPending ? <LoadingRows rows={1} /> : employees.isError ? (
              <ErrorState error={employees.error} onRetry={() => employees.refetch()} />
            ) : !barber ? (
              <div className="flex flex-col gap-3"><p className="text-sm text-destructive">الحلاق غير موجود.</p><BarberPicker onPick={pickBarber} /></div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <EmployeeAvatar employeeId={barber.id} name={barber.displayName} version={barber.photoUpdatedAt} className="size-14 text-lg" />
                  <div>
                    <p className="text-lg font-semibold">{barber.displayName}</p>
                    {!barber.enabled ? <p className="text-sm text-destructive">هذا الحلاق موقوف، اختر حلاقاً آخر.</p> : null}
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => pickBarber(null)}><X aria-hidden />تغيير</Button>
              </div>
            )}
          </Step>

          <Step number={2} title="التاريخ والوقت" done={Boolean(slot)}>
            {!barber?.enabled ? <p className="text-sm text-muted-foreground">اختر الحلاق أولاً.</p> : (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="التاريخ"><Input type="date" dir="ltr" min={kuwaitNow().date} value={date} onChange={event => { if (event.target.value) { setDate(event.target.value); setSlot(null); } }} /></Field>
                  <Field label="مدة الزيارة">
                    <Select value={String(duration)} onValueChange={value => { setDuration(Number(value)); setSlot(null); }}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{durationOptions.map(option => <SelectItem key={option} value={String(option)}>{formatDuration(option)}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
                <SlotPills key={`${barber.id}:${date}:${duration}`} barber={barber} date={date} duration={duration} selected={slot?.startTime ?? null} onSelect={setSlot} onAvailabilityChange={() => setSlot(null)} />
                <p className="text-sm" role="status">
                  {slot ? <>الموعد: {formatDate(date)}، <span className="font-medium" data-numeric>{formatWindow(slot.startTime, slot.endTime)}</span></> : <span className="text-muted-foreground">لم يتم اختيار وقت بعد.</span>}
                </p>
              </div>
            )}
          </Step>

          <Step number={3} title="العميل وعنوان الزيارة" done={Boolean(clientSelection)}>
            <PhoneBookingClient initialClientId={params.get("client")} onSelection={setClientSelection} />
          </Step>

          <Step number={4} title="عدد الحلاقات" done={haircuts > 0 && !specialProblem}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Counter label="أطفال" value={childCount} onChange={setChildren} />
              <Counter label="احتياجات خاصة" value={specialChildCount} onChange={setSpecialChildCount} max={childCount} />
              <Counter label="بالغون" value={adultCount} onChange={setAdultCount} />
            </div>
            {haircuts === 0 ? <p className="mt-2 text-xs text-destructive">حلاقة واحدة على الأقل.</p> : null}
            {specialProblem ? <p className="mt-2 text-xs text-destructive">{specialProblem}</p> : null}
            <Field label="ملاحظات" optional className="mt-4"><Textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} placeholder="مثال: اتصل قبل الوصول" /></Field>
          </Step>
        </div>

        <aside className="lg:sticky lg:top-10">
          <Card>
            <h2 className="border-b border-border px-5 py-4 text-base font-semibold">ملخص الحجز</h2>
            <dl className="flex flex-col gap-3 px-5 py-4 text-sm">
              <div><dt className="text-xs text-muted-foreground">الحلاق</dt><dd>{barber ? barber.displayName : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">الموعد</dt><dd>{slot ? <>{formatDate(date)}<br /><span data-numeric>{formatWindow(slot.startTime, slot.endTime)}</span></> : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">العميل</dt><dd>{clientSelection ? clientSelection.client.name?.trim() || clientSelection.client.phone : "—"}</dd></div>
            </dl>
            <div className="border-t border-border px-5 py-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">نقدي (د.ك)</span>
                  <Input dir="ltr" inputMode="decimal" placeholder="0.000" className="text-start" value={amountCash} onChange={event => setAmountCash(event.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">رابط (د.ك)</span>
                  <Input dir="ltr" inputMode="decimal" placeholder="0.000" className="text-start" value={amountLink} onChange={event => setAmountLink(event.target.value)} />
                </label>
              </div>
              {(amountCash.trim() !== "" || amountLink.trim() !== "") && !price ? <p className="mt-2 text-xs text-destructive">اكتب المبلغ بالدينار، حتى 3 خانات عشرية.</p> : null}
              <div className="mt-3 flex justify-between gap-2 border-t border-border pt-2 text-base font-semibold"><dt>الإجمالي</dt><dd><Ltr>{total ? formatKwd(total) : "—"}</Ltr></dd></div>
            </div>
            <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
              <FormAlert error={create.error ?? createNew.error} />
              <Button size="lg" variant="sun" onClick={submit} disabled={!ready || create.isPending || createNew.isPending || created !== null}>
                {create.isPending || createNew.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                حفظ الحجز وإصدار الفاتورة
              </Button>
            </div>
          </Card>
        </aside>
      </div>
      <Dialog open={created !== null} onOpenChange={open => { if (!open) router.push(created ? `/bookings/${created.id}` : "/bookings"); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تم حفظ الحجز</DialogTitle>
            <DialogDescription>أرسل تفاصيل الحجز <Ltr className="text-xs">{created?.reference}</Ltr> إلى الحلاق على واتساب؟</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button variant="sun" onClick={sendCreated} disabled={send.isPending}><MessageCircle aria-hidden />إرسال الحجز واتساب للحلاق</Button>
            <Button variant="outline" onClick={backToToday}>لا ترسل، رجوع لحجوزات اليوم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function NewBookingPage() {
  return <AdminOnly><Suspense><NewBookingScreen /></Suspense></AdminOnly>;
}
