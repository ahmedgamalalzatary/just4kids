"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { AddressFields } from "@/components/address-fields";
import { Field, FormAlert } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAddAddress, useAreas, useCreateClient, useUpdateAddress, useUpdateClient } from "@/lib/api/hooks";
import type { Address, Client } from "@/lib/api/types";
import { addressFormSchema, clientFormSchema, emptyAddress } from "@/lib/forms";

const createSchema = clientFormSchema.extend({ address: addressFormSchema });

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function CreateClientDialog({ open, onOpenChange, onCreated }: DialogProps & { onCreated: (client: Client) => void }) {
  const create = useCreateClient();
  const areas = useAreas("active", open);
  const form = useForm<z.input<typeof createSchema>, unknown, z.output<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { phone: "", address: emptyAddress },
  });
  const errors = form.formState.errors;
  const areaValue = useWatch({ control: form.control, name: "address.area" });
  const submit = form.handleSubmit(values => {
    const area = areas.data?.find(area => area.name === values.address.area);
    if (!area) { form.setError("address.area", { message: "Select an available area from the list" }); return; }
    create.mutate({ ...values, address: { ...values.address, areaId: area.id } }, {
      onSuccess: client => { toast.success("Client added"); onOpenChange(false); form.reset(); onCreated(client); },
      onError: () => { void areas.refetch(); },
    });
  });

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) create.reset(); onOpenChange(value); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>The phone number identifies the client. Each number belongs to one client.</DialogDescription>
        </DialogHeader>
        <form id="client-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone number" error={errors.phone?.message} hint="International format, e.g. +96550000000"><Input {...form.register("phone")} type="tel" dir="ltr" inputMode="tel" className="text-start" placeholder="+965" /></Field>
          </div>
          <Separator />
          <p className="text-sm font-medium">Visit address</p>
          <AddressFields register={name => form.register(`address.${name}`)} errors={errors.address ?? {}} areaValue={areaValue} />
        </form>
        <FormAlert error={create.error} />
        <DialogFooter><Button type="submit" form="client-form" disabled={create.isPending}>Add client</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditClientDialog({ client, open, onOpenChange }: DialogProps & { client: Client }) {
  const update = useUpdateClient();
  const form = useForm({ resolver: zodResolver(clientFormSchema), values: { phone: client.phone } });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(values => {
    const changes = { ...(values.phone !== client.phone ? { phone: values.phone } : {}) };
    if (Object.keys(changes).length === 0) { onOpenChange(false); return; }
    update.mutate({ id: client.id, ...changes }, { onSuccess: () => { toast.success("Client details saved"); onOpenChange(false); } });
  });

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) update.reset(); onOpenChange(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit client details</DialogTitle>
          <DialogDescription>Previous reservations and invoices retain their saved client phone.</DialogDescription>
        </DialogHeader>
        <form id="edit-client-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="Phone number" error={errors.phone?.message}><Input {...form.register("phone")} type="tel" dir="ltr" inputMode="tel" className="text-start" /></Field>
        </form>
        <FormAlert error={update.error} />
        <DialogFooter><Button type="submit" form="edit-client-form" disabled={update.isPending}>Save changes</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toForm = (address: Address) => ({
  area: address.area, block: address.block, street: address.street, houseNumber: address.houseNumber ?? "", buildingName: address.buildingName ?? "",
  avenue: address.avenue ?? "", gate: address.gate ?? "", blueNumber: address.blueNumber ?? "",
  floor: address.floor ?? "", apartment: address.apartment ?? "", mapsUrl: address.mapsUrl ?? "",
});

/** Adds a new address, or edits `address` when given. */
export function AddressDialog({ clientId, address, open, onOpenChange, onSaved }: DialogProps & { clientId: string; address: Address | null; onSaved?: (address: Address) => void }) {
  const add = useAddAddress();
  const update = useUpdateAddress();
  const mutation = address ? update : add;
  const areas = useAreas("active", open);
  const form = useForm<z.input<typeof addressFormSchema>, unknown, z.output<typeof addressFormSchema>>({
    resolver: zodResolver(addressFormSchema),
    values: address ? toForm(address) : emptyAddress,
  });
  const areaValue = useWatch({ control: form.control, name: "area" });
  const submit = form.handleSubmit(values => {
    const area = areas.data?.find(area => area.name === values.area);
    if (!area && (!address || values.area !== address.area)) { form.setError("area", { message: "Select an available area from the list" }); return; }
    const input = { ...values, ...(area ? { areaId: area.id } : {}) };
    const done = (saved: Address) => { toast.success(address ? "Address saved" : "Address added"); onOpenChange(false); onSaved?.(saved); };
    const onError = () => { void areas.refetch(); };
    if (address) update.mutate({ clientId, addressId: address.id, ...input }, { onSuccess: done, onError });
    else add.mutate({ clientId, ...input }, { onSuccess: done, onError });
  });

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) { add.reset(); update.reset(); } onOpenChange(value); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{address ? "Edit address" : "New address"}</DialogTitle>
          <DialogDescription>{address ? "Changes apply to new reservations. Existing reservations retain their saved address." : "A client can have more than one address."}</DialogDescription>
        </DialogHeader>
        <form id="address-form" onSubmit={submit} noValidate><AddressFields register={name => form.register(name)} errors={form.formState.errors} areaValue={areaValue} originalArea={address?.area ?? ""} /></form>
        <FormAlert error={mutation.error} />
        <DialogFooter><Button type="submit" form="address-form" disabled={mutation.isPending}>{address ? "Save address" : "Add address"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
