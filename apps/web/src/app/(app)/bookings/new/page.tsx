"use client";

import Link from "next/link";
import { Suspense, useDeferredValue, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronRight, Loader2, MapPin, Minus, Plus, Search, UserPlus, UserRound, X } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { AddressDialog, CreateClientDialog } from "@/components/client-dialogs";
import { Field, FormAlert } from "@/components/field";
import { ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { useBranches, useClient, useClients, useCreateBooking, useEligibleBarbers } from "@/lib/api/hooks";
import { formatAddress } from "@/lib/address";
import { windowProblem } from "@/lib/booking";
import { formatDate, formatDuration, formatWindow, kuwaitNow, windowMinutes } from "@/lib/kuwait-time";
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

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`إنقاص ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus /></Button>
        <output className="w-8 text-center text-lg font-semibold" data-numeric aria-live="polite">{value}</output>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`زيادة ${label}`} disabled={value >= 99} onClick={() => onChange(value + 1)}><Plus /></Button>
      </div>
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
          <Input type="search" autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالاسم أو رقم الهاتف" className="ps-9" />
        </label>
        <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}><UserPlus aria-hidden />عميل جديد</Button>
      </div>
      {clients.isPending ? <LoadingRows rows={3} /> : clients.isError ? <ErrorState error={clients.error} onRetry={() => clients.refetch()} /> : clients.data.clients.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{query ? "لا يوجد عميل مطابق. أضفه كعميل جديد." : "لا يوجد عملاء بعد. أضف العميل الأول."}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {clients.data.clients.slice(0, 8).map(client => (
            <li key={client.id}>
              <button type="button" onClick={() => onPick(client.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start transition-colors hover:bg-muted/60">
                <span className="truncate font-medium">{client.name}</span>
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
  const [clientId, setClientId] = useState<string | null>(params.get("client"));
  const [addressId, setAddressId] = useState<string | null>(null);
  const [addressOpen, setAddressOpen] = useState(false);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [adultCount, setAdultCount] = useState(0);
  const [childCount, setChildCount] = useState(1);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const client = useClient(clientId);
  const branches = useBranches();
  const create = useCreateBooking();

  const timing = { date, startTime, endTime };
  const timingProblem = windowProblem(timing);
  const eligibility = useEligibleBarbers(timingProblem ? null : timing);
  const barbers = eligibility.data?.barbers ?? [];
  const barber = barbers.find(candidate => candidate.id === employeeId) ?? null;
  const branch = barber ? branches.data?.find(candidate => candidate.id === barber.branch.id) : undefined;
  const address = client.data?.addresses.find(candidate => candidate.id === addressId)
    ?? (client.data?.addresses.length === 1 ? client.data.addresses[0] : undefined);
  const haircuts = adultCount + childCount;
  const total = branch ? invoiceTotal({ adultCount, childCount, adultUnitPrice: branch.adultPrice, childUnitPrice: branch.childPrice }) : null;
  const ready = Boolean(client.data && address && !timingProblem && haircuts > 0 && barber);

  const pickClient = (id: string | null) => { setClientId(id); setAddressId(null); };
  const submit = () => {
    if (!ready || !client.data || !address || !barber) return;
    create.mutate({ clientId: client.data.id, addressId: address.id, employeeId: barber.id, date, startTime, endTime, adultCount, childCount }, {
      onSuccess: booking => { toast.success(`تم الحجز برقم ${booking.reference}`); router.push(`/bookings/${booking.id}`); },
      onError: error => { if (error instanceof ApiError && error.code === "BARBER_UNAVAILABLE") { setEmployeeId(null); void eligibility.refetch(); } },
    });
  };

  return (
    <>
      <PageHeader
        back={<Link href="/bookings" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronRight className="size-4" aria-hidden />الحجوزات</Link>}
        title="حجز جديد"
        description="حلاق واحد لكل الحجز، في عنوان واحد ونافذة زمنية واحدة تشمل الذهاب والحلاقة والعودة."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-4">
          <Step number={1} title="العميل" done={Boolean(client.data)}>
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

          <Step number={2} title="عنوان الزيارة" done={Boolean(address)}>
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

          <Step number={3} title="الموعد وعدد الحلاقات" done={!timingProblem && haircuts > 0}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="التاريخ"><Input type="date" dir="ltr" min={kuwaitNow().date} value={date} onChange={event => { setDate(event.target.value); setEmployeeId(null); }} /></Field>
              <Field label="من"><Input type="time" dir="ltr" value={startTime} onChange={event => { setStartTime(event.target.value); setEmployeeId(null); }} /></Field>
              <Field label="إلى"><Input type="time" dir="ltr" value={endTime} onChange={event => { setEndTime(event.target.value); setEmployeeId(null); }} /></Field>
            </div>
            <p className={cn("mt-2 text-xs", timingProblem && date && startTime && endTime ? "text-destructive" : "text-muted-foreground")} role="status">
              {date && startTime && endTime ? timingProblem ?? `${formatDate(date)}، المدة ${formatDuration(windowMinutes(startTime, endTime))}` : "من 20 دقيقة إلى 4 ساعات بتوقيت الكويت، بغض النظر عن عدد الحلاقات."}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Counter label="بالغون" value={adultCount} onChange={setAdultCount} />
              <Counter label="أطفال" value={childCount} onChange={setChildCount} />
            </div>
            {haircuts === 0 ? <p className="mt-2 text-xs text-destructive">حلاقة واحدة على الأقل.</p> : null}
          </Step>

          <Step number={4} title="الحلاق" done={Boolean(barber)}>
            {timingProblem ? <p className="text-sm text-muted-foreground">حدد موعداً صالحاً لعرض الحلاقين المتاحين فيه.</p>
              : eligibility.isPending ? <LoadingRows rows={2} /> : eligibility.isError ? <ErrorState error={eligibility.error} onRetry={() => eligibility.refetch()} />
              : barbers.length === 0 ? <p className="text-sm text-muted-foreground">لا يوجد حلاق متاح طوال هذه الفترة. جرّب وقتاً أو يوماً آخر.</p> : (
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="الحلاق">
                  {barbers.map(option => {
                    const selected = option.id === employeeId;
                    return (
                      <button key={option.id} type="button" role="radio" aria-checked={selected} onClick={() => setEmployeeId(option.id)}
                        className={cn("flex flex-col items-start rounded-md border px-3 py-3 text-start transition-colors", selected ? "border-primary bg-accent" : "border-border hover:bg-muted/50")}>
                        <span className="font-medium">{option.displayName}</span>
                        <span className="text-xs text-muted-foreground">{option.branch.name}، {option.branch.location}</span>
                      </button>
                    );
                  })}
                </div>
              )}
          </Step>
        </div>

        <aside className="lg:sticky lg:top-10">
          <Card>
            <h2 className="border-b border-border px-5 py-4 text-base font-semibold">ملخص الحجز</h2>
            <dl className="flex flex-col gap-3 px-5 py-4 text-sm">
              <div><dt className="text-xs text-muted-foreground">العميل</dt><dd>{client.data?.name ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">الموعد</dt><dd>{!timingProblem ? <>{formatDate(date)}<br /><span data-numeric>{formatWindow(startTime, endTime)}</span></> : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">الحلاق</dt><dd>{barber ? `${barber.displayName}، ${barber.branch.name}` : "—"}</dd></div>
            </dl>
            <div className="border-t border-border px-5 py-4 text-sm">
              {branch && total ? (
                <dl className="flex flex-col gap-1.5">
                  {adultCount > 0 ? <div className="flex justify-between gap-2"><dt>{adultCount} × بالغ</dt><dd><Ltr>{formatKwd(invoiceTotal({ adultCount, childCount: 0, adultUnitPrice: branch.adultPrice, childUnitPrice: "0" }))}</Ltr></dd></div> : null}
                  {childCount > 0 ? <div className="flex justify-between gap-2"><dt>{childCount} × طفل</dt><dd><Ltr>{formatKwd(invoiceTotal({ adultCount: 0, childCount, adultUnitPrice: "0", childUnitPrice: branch.childPrice }))}</Ltr></dd></div> : null}
                  <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2 text-base font-semibold"><dt>الإجمالي</dt><dd><Ltr>{formatKwd(total)}</Ltr></dd></div>
                </dl>
              ) : <p className="text-muted-foreground">يظهر السعر بعد اختيار الحلاق، حسب أسعار فرعه.</p>}
            </div>
            <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
              <FormAlert error={create.error} />
              <Button size="lg" onClick={submit} disabled={!ready || create.isPending}>
                {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                تأكيد الحجز وإصدار الفاتورة
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
