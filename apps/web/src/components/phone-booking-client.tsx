"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { phoneSchema, type BookingWithClientCreate } from "@just4kids/contracts";
import { MapPin, Plus } from "lucide-react";
import { AddressFields } from "@/components/address-fields";
import { AddressDialog } from "@/components/client-dialogs";
import { Field } from "@/components/field";
import { ErrorState, Ltr } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAreas, useClient, usePhoneClient } from "@/lib/api/hooks";
import type { Address, ClientLookup } from "@/lib/api/types";
import { addressFormSchema, emptyAddress } from "@/lib/forms";
import { normalizePhone } from "@/lib/phone";
import { formatAddress } from "@/lib/address";
import { cn } from "@/lib/utils";

export type BookingClientSelection = { kind: "existing"; client: ClientLookup; address: Address } | { kind: "new"; client: BookingWithClientCreate["client"] } | null;
type SelectionHandler = (selection: BookingClientSelection) => void;
const newClientFormSchema = z.object({ address: addressFormSchema });

function NewClientFields({ phone, onSelection }: { phone: string; onSelection: SelectionHandler }) {
  const areas = useAreas("active");
  const form = useForm<z.input<typeof newClientFormSchema>, unknown, z.output<typeof newClientFormSchema>>({ resolver: zodResolver(newClientFormSchema), mode: "onChange", defaultValues: { address: emptyAddress } });
  const values = useWatch({ control: form.control });
  const selection = useMemo<BookingClientSelection>(() => {
    const parsed = newClientFormSchema.safeParse(values);
    if (!parsed.success || areas.isError || areas.isPending) return null;
    const area = areas.data.find(area => area.name === parsed.data.address.area);
    return area ? { kind: "new", client: { phone, address: { ...parsed.data.address, areaId: area.id } } } : null;
  }, [values, areas.data, areas.isError, areas.isPending, phone]);
  useEffect(() => { onSelection(selection); }, [selection, onSelection]);
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm text-muted-foreground">New client. The client and address will be saved with the reservation.</p>
      <AddressFields register={name => form.register(`address.${name}`)} errors={form.formState.errors.address ?? {}} areaValue={values.address?.area ?? ""} />
    </div>
  );
}

function ExistingClientFields({ client, onSelection }: { client: ClientLookup; onSelection: SelectionHandler }) {
  const [addressId, setAddressId] = useState<string | null>(null), [open, setOpen] = useState(false);
  const address = client.addresses.find(address => address.id === (addressId ?? client.lastUsedAddressId)) ?? client.addresses.at(-1);
  useEffect(() => { onSelection(client.enabled && address ? { kind: "existing", client, address } : null); }, [client, address, onSelection]);
  if (!client.enabled) return <p role="alert" className="text-sm text-destructive">This client is stopped. A new reservation cannot be created.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div><Ltr className="font-medium">{client.phone}</Ltr></div>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Visit address">
        {client.addresses.map(option => <button key={option.id} type="button" role="radio" aria-checked={option.id === address?.id} onClick={() => setAddressId(option.id)} className={cn("flex items-start gap-3 rounded-md border px-3 py-3 text-start text-sm transition-colors", option.id === address?.id ? "border-primary bg-accent" : "border-border hover:bg-muted/50")}><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{formatAddress(option)}</span></button>)}
      </div>
      <Button type="button" variant="ghost" size="sm" className="w-fit text-primary" onClick={() => setOpen(true)}><Plus aria-hidden />Another address</Button>
      <AddressDialog clientId={client.id} address={null} open={open} onOpenChange={setOpen} onSaved={saved => setAddressId(saved.id)} />
    </div>
  );
}

export function PhoneBookingClient({ initialClientId = null, onSelection }: { initialClientId?: string | null; onSelection: SelectionHandler }) {
  const initial = useClient(initialClientId);
  const [entered, setEntered] = useState<string | null>(null);
  const raw = entered ?? initial.data?.phone ?? "";
  const normalized = normalizePhone(raw);
  const phone = phoneSchema.safeParse(normalized).success ? normalized : null;
  const lookup = usePhoneClient(phone);
  useEffect(() => { if (!phone || lookup.isPending || lookup.isError) onSelection(null); }, [phone, lookup.isPending, lookup.isError, onSelection]);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Client phone number" hint="Enter 8 Kuwaiti digits or an international phone number; lookup is automatic."><Input type="tel" inputMode="tel" dir="ltr" value={raw} onChange={event => { onSelection(null); setEntered(event.target.value); }} className="text-start" /></Field>
      {entered === null && initialClientId && initial.isError ? <ErrorState error={initial.error} onRetry={() => initial.refetch()} /> : null}
      {!phone ? <p className="text-sm text-muted-foreground">Enter the full phone number to view client details.</p> : lookup.isPending ? <p role="status" className="text-sm text-muted-foreground">Looking up client...</p> : lookup.isError ? <ErrorState error={lookup.error} onRetry={() => lookup.refetch()} /> : lookup.data ? <ExistingClientFields key={lookup.data.id} client={lookup.data} onSelection={onSelection} /> : <NewClientFields key={phone} phone={phone} onSelection={onSelection} />}
    </div>
  );
}
