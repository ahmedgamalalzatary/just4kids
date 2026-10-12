"use client";

import Link from "next/link";
import { Suspense, useDeferredValue, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronRight, Loader2, MapPin, Minus, Plus, Search, UserPlus, UserRound, X } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { EmployeeAvatar } from "@/components/avatar";
import { AddressDialog, CreateClientDialog } from "@/components/client-dialogs";
import { Field, FormAlert } from "@/components/field";
import { ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { VisitStatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { useBranches, useClient, useClients, useCreateBooking, useDayBookings, useEmployees, useSchedule } from "@/lib/api/hooks";
import type { Booking, Employee } from "@/lib/api/types";
import { formatAddress } from "@/lib/address";
import { specialChildrenProblem } from "@/lib/booking";
import { buildSlots, durationOptions, haircutSummary, type Slot } from "@/lib/day";
import { formatDate, formatDuration, formatTime, formatWindow, kuwaitNow } from "@/lib/kuwait-time";
import { formatKwd, invoiceTotal } from "@/lib/money";
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
          <span className="text-xs text-muted-foreground">{employee.branch.name}</span>
        </button>
      ))}
    </div>
  );
}

const slotStyles: Record<Slot<Booking>["state"], string> = {
  free: "border-border bg-card hover:border-primary hover:bg-accent",
  booked: "border-status-no-show/30 bg-status-no-show-soft text-status-no-show line-through decoration-1",
  past: "border-transparent bg-muted text-muted-foreground opacity-60",
  blocked: "border-dashed border-border text-muted-foreground opacity-60",
};

/** The barber's day as 30-minute pills: free to pick, booked with the visit's details on tap, the rest unavailable. */
function SlotPills({ barber, date, duration, selected, onSelect }: { barber: Employee; date: string; duration: number; selected: string | null; onSelect: (slot: { startTime: string; endTime: string }) => void }) {
  const schedule = useSchedule(barber.id);
  const day = useDayBookings(date, barber.id);
  const [shown, setShown] = useState<Booking | null>(null);
  if (schedule.isPending || day.isPending) return <LoadingRows rows={2} />;
  if (schedule.isError) return <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />;
  if (day.isError) return <ErrorState error={day.error} onRetry={() => day.refetch()} />;
  const slots = buildSlots({ date, schedule: schedule.data, bookings: day.data.bookings, duration });
  if (slots.length === 0) {
    return <p className="text-sm text-muted-foreground">لا يعمل {barber.displayName} في هذا اليوم. غيّر التاريخ أو عدّل <Link href={`/employees/${barber.id}`} className="text-primary underline">ساعات عمله</Link>.</p>;
  }
  const details = shown && day.data.bookings.find(booking => booking.id === shown.id);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="وقت البداية">
        {slots.map(slot => {
          const isSelected = slot.startTime === selected && slot.state === "free";
          const label = slot.state === "booked" ? `${formatTime(slot.startTime)}، محجوز` : slot.state === "free" ? formatTime(slot.startTime) : `${formatTime(slot.startTime)}، غير متاح`;
          return (
            <button key={slot.startTime} type="button" role="radio" aria-checked={isSelected} aria-label={label}
              disabled={slot.state === "past" || slot.state === "blocked"}
              onClick={() => { if (slot.state === "booked") setShown(slot.booking ?? null); else { setShown(null); onSelect(slot); } }}
              className={cn("min-w-[5.5rem] rounded-full border px-3 py-1.5 text-sm transition-colors", slotStyles[slot.state], isSelected && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
              data-numeric>
              {formatTime(slot.startTime)}
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-border bg-card" aria-hidden />متاح</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-status-no-show-soft ring-1 ring-status-no-show/40" aria-hidden />محجوز (اضغط للتفاصيل)</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted" aria-hidden />غير متاح لمدة {formatDuration(duration)}</span>
      </p>
      {details ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-status-no-show/30 bg-status-no-show-soft/50 px-3 py-2.5 text-sm" role="status">
          <div className="min-w-0">
            <p className="font-medium"><span data-numeric>{formatWindow(details.startTime, details.endTime)}</span> · {details.client.name} <Ltr className="text-muted-foreground">{details.client.phone}</Ltr></p>
            <p className="text-muted-foreground">{details.address.area}، {haircutSummary(details)}</p>
            <VisitStatusBadge status={details.visitStatus} className="mt-1" />
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm"><Link href={`/bookings/${details.id}`}>فتح الحجز</Link></Button>
            <Button variant="ghost" size="icon-sm" aria-label="إغلاق" onClick={() => setShown(null)}><X /></Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClientPicker({ onPick }: { onPick: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const query = useDeferredValue(search.trim());
  const clients = useClients(query, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">بحث عن عميل</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث برقم الهاتف أو الاسم" className="ps-9" />
        </label>
        <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}><UserPlus aria-hidden />عميل جديد</Button>
      </div>
      {clients.isPending ? <LoadingRows rows={3} /> : clients.isError ? <ErrorState error={clients.error} onRetry={() => clients.refetch()} /> : clients.data.clients.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{query ? "لا يوجد عميل مطابق. أضفه كعميل جديد." : "لا يوجد عملاء بعد. أضف العميل الأول."}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {clients.data.clients.slice(0, 8).map(client => (
            <li key={client.id}>
              <button type="button" disabled={!client.enabled} onClick={() => onPick(client.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{client.name}</span>
                  {client.enabled ? null : <Badge variant="muted">موقوف</Badge>}
                </span>
                <Ltr className="text-sm text-muted-foreground">{client.phone}</Ltr>
              </button>
            </li>
          ))}
        </ul>
      )}
      <CreateClientDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={client => onPick(client.id)} />
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
  const [clientId, setClientId] = useState<string | null>(params.get("client"));
  const [addressId, setAddressId] = useState<string | null>(null);
  const [addressOpen, setAddressOpen] = useState(false);
  const [adultCount, setAdultCount] = useState(0);
  const [childCount, setChildCount] = useState(1);
  const [specialChildCount, setSpecialChildCount] = useState(0);
  const [notes, setNotes] = useState("");

  const employees = useEmployees();
  const client = useClient(clientId);
  const branches = useBranches();
  const create = useCreateBooking();

  const barber = employees.data?.find(employee => employee.id === barberId) ?? null;
  const branch = barber ? branches.data?.find(candidate => candidate.id === barber.branchId) : undefined;
  const address = client.data?.addresses.find(candidate => candidate.id === addressId)
    ?? (client.data?.addresses.length === 1 ? client.data.addresses[0] : undefined);
  const haircuts = adultCount + childCount;
  const specialProblem = specialChildrenProblem(childCount, specialChildCount);
  const total = branch ? invoiceTotal({ adultCount, childCount, adultUnitPrice: branch.adultPrice, childUnitPrice: branch.childPrice }) : null;
  const ready = Boolean(barber?.enabled && slot && client.data && address && haircuts > 0 && !specialProblem);

  const pickBarber = (id: string | null) => { setBarberId(id); setSlot(null); };
  const pickClient = (id: string | null) => { setClientId(id); setAddressId(null); };
  const setChildren = (value: number) => { setChildCount(value); setSpecialChildCount(current => Math.min(current, value)); };
  const submit = () => {
    if (!ready || !barber || !slot || !client.data || !address) return;
    create.mutate({ clientId: client.data.id, addressId: address.id, employeeId: barber.id, date, startTime: slot.startTime, endTime: slot.endTime, adultCount, childCount, specialChildCount, ...(notes.trim() ? { notes: notes.trim() } : {}) }, {
      onSuccess: booking => { toast.success(`تم الحجز برقم ${booking.reference}`); router.push(`/bookings/${booking.id}`); },
      onError: error => {
        // Someone else took the time (or the hours changed): reload the pills and ask for another time.
        if (error instanceof ApiError && error.code === "BARBER_UNAVAILABLE") { setSlot(null); void queryClient.invalidateQueries({ queryKey: ["bookings", "list"] }); void queryClient.invalidateQueries({ queryKey: ["schedules", barber.id] }); }
      },
    });
  };

  return (
    <>
      <PageHeader
        back={<Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronRight className="size-4" aria-hidden />لوحة التحكم</Link>}
        title={barber ? `حجز جديد مع ${barber.displayName}` : "حجز جديد"}
        description="اختر الحلاق ثم وقت البداية، ثم العميل وعنوان الزيارة وعدد الحلاقات."
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
                    <p className="text-sm text-muted-foreground">{barber.branch.name}، {barber.branch.location}</p>
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
                <SlotPills barber={barber} date={date} duration={duration} selected={slot?.startTime ?? null} onSelect={setSlot} />
                <p className="text-sm" role="status">
                  {slot ? <>الموعد: {formatDate(date)}، <span className="font-medium" data-numeric>{formatWindow(slot.startTime, slot.endTime)}</span></> : <span className="text-muted-foreground">لم يتم اختيار وقت بعد.</span>}
                </p>
              </div>
            )}
          </Step>

          <Step number={3} title="العميل" done={Boolean(client.data)}>
            {clientId === null ? <ClientPicker onPick={pickClient} /> : client.isPending ? <LoadingRows rows={1} /> : client.isError ? (
              <ErrorState error={client.error} onRetry={() => pickClient(null)} />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <UserRound className="size-5 text-muted-foreground" aria-hidden />
                  <div><p className="font-medium">{client.data.name}</p><Ltr className="text-sm text-muted-foreground">{client.data.phone}</Ltr></div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => pickClient(null)}><X aria-hidden />تغيير</Button>
              </div>
            )}
          </Step>

          <Step number={4} title="عنوان الزيارة" done={Boolean(address)}>
            {!client.data ? <p className="text-sm text-muted-foreground">اختر العميل أولاً.</p> : (
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="عنوان الزيارة">
                {client.data.addresses.map(option => {
                  const selected = option.id === address?.id;
                  return (
                    <button key={option.id} type="button" role="radio" aria-checked={selected} onClick={() => setAddressId(option.id)}
                      className={cn("flex items-start gap-3 rounded-md border px-3 py-3 text-start text-sm transition-colors", selected ? "border-primary bg-accent" : "border-border hover:bg-muted/50")}>
                      <MapPin className={cn("mt-0.5 size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} aria-hidden />
                      <span>{formatAddress(option)}{option.instructions ? <span className="mt-0.5 block text-xs text-muted-foreground">{option.instructions}</span> : null}</span>
                    </button>
                  );
                })}
                <Button type="button" variant="ghost" size="sm" className="w-fit text-primary" onClick={() => setAddressOpen(true)}><Plus aria-hidden />عنوان آخر</Button>
                <AddressDialog clientId={client.data.id} address={null} open={addressOpen} onOpenChange={setAddressOpen} onSaved={saved => setAddressId(saved.id)} />
              </div>
            )}
          </Step>

          <Step number={5} title="عدد الحلاقات" done={haircuts > 0 && !specialProblem}>
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
              <div><dt className="text-xs text-muted-foreground">الحلاق</dt><dd>{barber ? `${barber.displayName}، ${barber.branch.name}` : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">الموعد</dt><dd>{slot ? <>{formatDate(date)}<br /><span data-numeric>{formatWindow(slot.startTime, slot.endTime)}</span></> : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">العميل</dt><dd>{client.data?.name ?? "—"}</dd></div>
            </dl>
            <div className="border-t border-border px-5 py-4 text-sm">
              {branch && total ? (
                <dl className="flex flex-col gap-1.5">
                  {childCount > 0 ? <div className="flex justify-between gap-2"><dt>{childCount} × طفل</dt><dd><Ltr>{formatKwd(invoiceTotal({ adultCount: 0, childCount, adultUnitPrice: "0", childUnitPrice: branch.childPrice }))}</Ltr></dd></div> : null}
                  {adultCount > 0 ? <div className="flex justify-between gap-2"><dt>{adultCount} × بالغ</dt><dd><Ltr>{formatKwd(invoiceTotal({ adultCount, childCount: 0, adultUnitPrice: branch.adultPrice, childUnitPrice: "0" }))}</Ltr></dd></div> : null}
                  <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2 text-base font-semibold"><dt>الإجمالي</dt><dd><Ltr>{formatKwd(total)}</Ltr></dd></div>
                </dl>
              ) : <p className="text-muted-foreground">يظهر السعر بعد اختيار الحلاق، حسب أسعار فرعه.</p>}
            </div>
            <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
              <FormAlert error={create.error} />
              <Button size="lg" variant="sun" onClick={submit} disabled={!ready || create.isPending}>
                {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                حفظ الحجز وإصدار الفاتورة
              </Button>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

export default function NewBookingPage() {
  return <AdminOnly><Suspense><NewBookingScreen /></Suspense></AdminOnly>;
}
