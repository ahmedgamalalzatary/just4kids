"use client";

import Link from "next/link";
import { Suspense, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronLeft, Loader2, Minus, Plus, X } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { EmployeeAvatar } from "@/components/avatar";
import { PhoneBookingClient, type BookingClientSelection } from "@/components/phone-booking-client";
import { Field, FormAlert } from "@/components/field";
import { ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { SlotPills } from "@/components/booking-slot-pills";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { keys, useCreateBooking, useCreateBookingWithClient, useEmployees, useSendToBarber } from "@/lib/api/hooks";
import type { Booking } from "@/lib/api/types";
import { specialChildrenProblem } from "@/lib/booking";
import { whatsAppLink } from "@/lib/day";
import { formatDate, formatWindow, kuwaitNow } from "@/lib/kuwait-time";
import { formatKwd, invoiceTotal, typedPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { sendLoggedWhatsApp } from "@/lib/whatsapp";

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
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Decrease ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus /></Button>
        <output className="w-8 text-center text-lg font-semibold" data-numeric aria-live="polite">{value}</output>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus /></Button>
      </div>
    </div>
  );
}

function BarberPicker({ onPick }: { onPick: (id: string) => void }) {
  const employees = useEmployees();
  if (employees.isPending) return <LoadingRows rows={2} />;
  if (employees.isError) return <ErrorState error={employees.error} onRetry={() => employees.refetch()} />;
  const enabled = employees.data.filter(employee => employee.enabled);
  if (enabled.length === 0) return <p className="text-sm text-muted-foreground">No active barber. <Link href="/employees" className="text-primary underline">Barbers</Link></p>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Barber">
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
  const [slot, setSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [clientSelection, setClientSelection] = useState<BookingClientSelection>(null);
  const [adultCount, setAdultCount] = useState(0);
  const [childCount, setChildCount] = useState(1);
  const [specialChildCount, setSpecialChildCount] = useState(0);
  const [notes, setNotes] = useState("");
  const [amountCash, setAmountCash] = useState("");
  const [amountLink, setAmountLink] = useState("");

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

  const busy = create.isPending || createNew.isPending || send.isPending;
  const pickBarber = (id: string | null) => { setBarberId(id); setSlot(null); };
  const setChildren = (value: number) => { setChildCount(value); setSpecialChildCount(current => Math.min(current, value)); };
  const onSaveError = (error: Error) => {
    if (error instanceof ApiError && error.code === "BARBER_UNAVAILABLE") { setSlot(null); void queryClient.invalidateQueries({ queryKey: ["bookings", "list"] }); void queryClient.invalidateQueries({ queryKey: ["schedules", barber?.id] }); }
    if (error instanceof ApiError && ["PHONE_ALREADY_USED", "CLIENT_DISABLED"].includes(error.code)) void queryClient.invalidateQueries({ queryKey: keys.clients });
    if (error instanceof ApiError && error.code === "AREA_UNAVAILABLE") void queryClient.invalidateQueries({ queryKey: keys.areas });
  };
  const createBooking = () => new Promise<Booking>((resolve, reject) => {
    if (!ready || !barber || !slot || !clientSelection || !price) return reject(new Error("The reservation is not ready."));
    const details = { employeeId: barber.id, date, startTime: slot.startTime, endTime: slot.endTime, adultCount, childCount, specialChildCount, ...price, ...(notes.trim() ? { notes: notes.trim() } : {}) };
    const options = {
      onSuccess: (booking: Booking) => { toast.success(`Reservation saved: ${booking.reference}`); resolve(booking); },
      onError: (error: Error) => { onSaveError(error); reject(error); },
    };
    if (clientSelection.kind === "new") {
      create.reset();
      createNew.mutate({ ...details, client: clientSelection.client }, options);
    } else {
      createNew.reset();
      create.mutate({ ...details, clientId: clientSelection.client.id, addressId: clientSelection.address.id }, options);
    }
  });
  // Save-only and save-and-send share the same create; only the send-and-send path reserves a WhatsApp tab on the click.
  const saveOnly = async () => {
    try { await createBooking(); router.push("/bookings"); } catch { /* the form shows the error */ }
  };
  const saveAndSend = async () => {
    let created: Booking | null = null;
    try {
      await sendLoggedWhatsApp(() => whatsAppLink(barber!.phone, created!), async () => {
        created = await createBooking();
        await send.mutateAsync({ id: created.id });
      });
    } catch {
      if (created) { toast.error("Reservation saved, but the send to the barber was not recorded. Send it again from the reservation page."); router.push("/bookings"); }
      return;
    }
    router.push("/bookings");
  };

  return (
    <>
      <PageHeader
        back={<Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" aria-hidden />Dashboard</Link>}
        title={barber ? `New reservation with ${barber.displayName}` : "New reservation"}
        description="Choose the barber, start time, client phone, visit address and haircut counts."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-4">
          <Step number={1} title="Barber" done={Boolean(barber?.enabled)}>
            {barberId === null ? <BarberPicker onPick={pickBarber} /> : employees.isPending ? <LoadingRows rows={1} /> : employees.isError ? (
              <ErrorState error={employees.error} onRetry={() => employees.refetch()} />
            ) : !barber ? (
              <div className="flex flex-col gap-3"><p className="text-sm text-destructive">Barber not found.</p><BarberPicker onPick={pickBarber} /></div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <EmployeeAvatar employeeId={barber.id} name={barber.displayName} version={barber.photoUpdatedAt} className="size-14 text-lg" />
                  <div>
                    <p className="text-lg font-semibold">{barber.displayName}</p>
                    {!barber.enabled ? <p className="text-sm text-destructive">This barber is stopped. Choose another barber.</p> : null}
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => pickBarber(null)}><X aria-hidden />Change</Button>
              </div>
            )}
          </Step>

          <Step number={2} title="Date and time" done={Boolean(slot)}>
            {!barber?.enabled ? <p className="text-sm text-muted-foreground">Select a barber first.</p> : (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Date"><Input type="date" dir="ltr" min={kuwaitNow().date} value={date} onChange={event => { if (event.target.value) { setDate(event.target.value); setSlot(null); } }} /></Field>
                </div>
                <SlotPills key={`${barber.id}:${date}`} barber={barber} date={date} selected={slot?.startTime ?? null} selectedEnd={slot?.endTime ?? null} onSelect={setSlot} onAvailabilityChange={() => setSlot(null)} />
                <p className="text-sm" role="status">
                  {slot ? <>Appointment: {formatDate(date)}, <span className="font-medium" data-numeric>{formatWindow(slot.startTime, slot.endTime)}</span></> : <span className="text-muted-foreground">No time selected yet.</span>}
                </p>
              </div>
            )}
          </Step>

          <Step number={3} title="Client and visit address" done={Boolean(clientSelection)}>
            <PhoneBookingClient initialClientId={params.get("client")} onSelection={setClientSelection} />
          </Step>

          <Step number={4} title="Haircut count" done={haircuts > 0 && !specialProblem}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Counter label="Children" value={childCount} onChange={setChildren} />
              <Counter label="Special needs" value={specialChildCount} onChange={setSpecialChildCount} max={childCount} />
              <Counter label="Adults" value={adultCount} onChange={setAdultCount} />
            </div>
            {haircuts === 0 ? <p className="mt-2 text-xs text-destructive">At least one haircut.</p> : null}
            {specialProblem ? <p className="mt-2 text-xs text-destructive">{specialProblem}</p> : null}
            <Field label="Notes" optional className="mt-4"><Textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} placeholder="Example: call before arrival" /></Field>
          </Step>
        </div>

        <aside className="lg:sticky lg:top-10">
          <Card>
            <h2 className="border-b border-border px-5 py-4 text-base font-semibold">Reservation summary</h2>
            <dl className="flex flex-col gap-3 px-5 py-4 text-sm">
              <div><dt className="text-xs text-muted-foreground">Barber</dt><dd>{barber ? barber.displayName : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Appointment</dt><dd>{slot ? <>{formatDate(date)}<br /><span data-numeric>{formatWindow(slot.startTime, slot.endTime)}</span></> : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Client</dt><dd>{clientSelection ? clientSelection.client.phone : "—"}</dd></div>
            </dl>
            <div className="border-t border-border px-5 py-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Cash (KWD)</span>
                  <Input dir="ltr" inputMode="decimal" placeholder="0.000" className="text-start" value={amountCash} onChange={event => setAmountCash(event.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Link (KWD)</span>
                  <Input dir="ltr" inputMode="decimal" placeholder="0.000" className="text-start" value={amountLink} onChange={event => setAmountLink(event.target.value)} />
                </label>
              </div>
              {(amountCash.trim() !== "" || amountLink.trim() !== "") && !price ? <p className="mt-2 text-xs text-destructive">Enter the KWD amount with up to 3 decimal places.</p> : null}
              <div className="mt-3 flex justify-between gap-2 border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd><Ltr>{total ? formatKwd(total) : "—"}</Ltr></dd></div>
            </div>
            <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
              <FormAlert error={create.error ?? createNew.error} />
              <Button size="lg" variant="sun" onClick={saveOnly} disabled={!ready || busy}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Save reservation
              </Button>
              <Button size="lg" variant="outline" onClick={saveAndSend} disabled={!ready || busy}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Save &amp; send via WhatsApp
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
