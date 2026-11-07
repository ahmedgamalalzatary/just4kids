"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import type { BookingEdit } from "@just4kids/contracts";
import { Field, FormAlert } from "@/components/field";
import { AddressFields } from "@/components/address-fields";
import { LoadingRows, Ltr } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useClient, useEditBooking, useEmployees } from "@/lib/api/hooks";
import type { Booking } from "@/lib/api/types";
import { formatAddress } from "@/lib/address";
import { specialChildrenProblem, windowProblem } from "@/lib/booking";
import { isCorrection } from "@/lib/visit-rules";
import { kuwaitNow } from "@/lib/kuwait-time";
import { addressFormSchema } from "@/lib/forms";

const KEEP_ADDRESS = "keep";
const addressValues = (address: Booking["address"]) => ({
  area: address.area, block: address.block, street: address.street, houseNumber: address.houseNumber ?? "", buildingName: address.buildingName ?? "",
  avenue: address.avenue ?? "", gate: address.gate ?? "", blueNumber: address.blueNumber ?? "", floor: address.floor ?? "", apartment: address.apartment ?? "", mapsUrl: address.mapsUrl ?? "",
});

function Stepper({ label, value, onChange, max = 99 }: { label: string; value: number; onChange: (value: number) => void; max?: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Decrease ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus /></Button>
        <output className="w-7 text-center font-semibold" data-numeric>{value}</output>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus /></Button>
      </div>
    </div>
  );
}

function EditForm({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const client = useClient(booking.clientId);
  const employees = useEmployees();
  const edit = useEditBooking();
  const correction = isCorrection(booking);
  const [addressId, setAddressId] = useState(KEEP_ADDRESS);
  const [editingAddress, setEditingAddress] = useState(false);
  const addressForm = useForm<z.input<typeof addressFormSchema>, unknown, z.output<typeof addressFormSchema>>({ resolver: zodResolver(addressFormSchema), defaultValues: addressValues(booking.address) });
  const areaValue = useWatch({ control: addressForm.control, name: "area" });
  const [employeeId, setEmployeeId] = useState(booking.employeeId);
  const [date, setDate] = useState(booking.date);
  const [startTime, setStartTime] = useState(booking.startTime);
  const [endTime, setEndTime] = useState(booking.endTime);
  const [adultCount, setAdultCount] = useState(booking.adultCount);
  const [childCount, setChildCount] = useState(booking.childCount);
  const [specialChildCount, setSpecialChildCount] = useState(booking.specialChildCount);
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  if (client.isPending || employees.isPending) return <LoadingRows rows={4} />;
  if (client.isError || employees.isError) return <FormAlert error={client.error ?? employees.error} />;

  const timingChanged = date !== booking.date || startTime !== booking.startTime || endTime !== booking.endTime;
  const countsChanged = adultCount !== booking.adultCount || childCount !== booking.childCount || specialChildCount !== booking.specialChildCount;
  const setChildren = (value: number) => { setChildCount(value); setSpecialChildCount(current => Math.min(current, value)); };
  const barberChanged = employeeId !== booking.employeeId;
  const addressChanged = addressId !== KEEP_ADDRESS || (editingAddress && addressForm.formState.isDirty);
  const notesChanged = notes !== (booking.notes ?? "");
  const changed = timingChanged || countsChanged || barberChanged || addressChanged || notesChanged;

  const submit = async () => {
    if (editingAddress && !await addressForm.trigger()) return;
    if (!changed) { setProblem("No changes yet"); return; }
    if (timingChanged) { const issue = windowProblem({ date, startTime, endTime }, new Date(), !correction); if (issue) { setProblem(issue); return; } }
    if (correction && !reason.trim()) { setProblem("Enter the correction reason"); return; }
    if (adultCount + childCount === 0) { setProblem("At least one haircut"); return; }
    const specialProblem = specialChildrenProblem(childCount, specialChildCount);
    if (specialProblem) { setProblem(specialProblem); return; }
    setProblem(null);
    const input: BookingEdit & { id: string } = {
      id: booking.id,
      expectedVersion: booking.visitVersion,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(addressChanged ? editingAddress ? { address: addressFormSchema.parse(addressForm.getValues()) } : { addressId } : {}),
      ...(barberChanged ? { employeeId } : {}),
      ...(timingChanged ? { date, startTime, endTime } : {}),
      ...(countsChanged ? { adultCount, childCount, specialChildCount } : {}),
      ...(notesChanged ? { notes: notes.trim() } : {}),
    };
    edit.mutate(input, { onSuccess: () => { toast.success("Reservation updated"); onDone(); } });
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {editingAddress ? <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Reservation address</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingAddress(false); addressForm.reset(addressValues(booking.address)); }}>Cancel address changes</Button>
          </div>
          <p className="text-sm text-muted-foreground">Changes apply to this reservation. Saved client addresses stay the same.</p>
          <AddressFields register={name => addressForm.register(name)} errors={addressForm.formState.errors} areaValue={areaValue} originalArea={(client.data.addresses.find(address => address.id === addressId) ?? booking.address).area} />
        </div> : <div className="flex flex-col gap-2"><Field label="Address">
          <Select value={addressId} onValueChange={setAddressId}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP_ADDRESS}>Keep the current reservation address</SelectItem>
              {client.data.addresses.map(address => <SelectItem key={address.id} value={address.id}>{formatAddress(address)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
          <Button type="button" variant="outline" size="sm" className="mt-2 w-fit" onClick={() => {
            addressForm.reset(addressValues(client.data.addresses.find(address => address.id === addressId) ?? booking.address));
            setEditingAddress(true);
          }}>Edit reservation address</Button>
        </div>}
        <Field label="Barber" hint="Availability is checked when saving.">
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {employees.data.filter(employee => employee.enabled || employee.id === booking.employeeId).map(employee => (
                <SelectItem key={employee.id} value={employee.id}>{employee.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date"><Input type="date" dir="ltr" min={correction ? undefined : kuwaitNow().date} value={date} onChange={event => setDate(event.target.value)} /></Field>
          <Field label="From"><Input type="time" dir="ltr" step={correction ? undefined : 1800} value={startTime} onChange={event => setStartTime(event.target.value)} /></Field>
          <Field label="To"><Input type="time" dir="ltr" step={correction ? undefined : 1800} value={endTime} onChange={event => setEndTime(event.target.value)} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stepper label="Adults" value={adultCount} onChange={setAdultCount} />
          <Stepper label="Children" value={childCount} onChange={setChildren} />
          <Stepper label="with special needs" value={specialChildCount} onChange={setSpecialChildCount} max={childCount} />
        </div>
        <Field label="Notes" optional><Textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} placeholder="Example: call before arrival" /></Field>
        <Field label={correction ? "Correction reason" : "Edit reason"} optional={!correction}><Textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field>
        {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
        <FormAlert error={edit.error} />
      </div>
      <DialogFooter><Button onClick={submit} disabled={edit.isPending}>Save edit</Button></DialogFooter>
    </>
  );
}

export function BookingEditDialog({ booking, open, onOpenChange }: { booking: Booking; open: boolean; onOpenChange: (open: boolean) => void }) {
  const correction = isCorrection(booking);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{correction ? "Correct reservation" : "Edit reservation"} <Ltr>{booking.reference}</Ltr></DialogTitle>
          <DialogDescription>{correction ? "Correcting a started or finished visit requires a reason. Each correction is recorded." : "The reservation reference stays the same. Every edit is recorded."}</DialogDescription>
        </DialogHeader>
        {open ? <EditForm booking={booking} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
