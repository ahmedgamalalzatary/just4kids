"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { AddressFields } from "@/components/address-fields";
import { Field, FormAlert } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAddAddress, useCreateClient, useUpdateAddress, useUpdateClient } from "@/lib/api/hooks";
import type { Address, Client } from "@/lib/api/types";
import { addressFormSchema, clientFormSchema, emptyAddress } from "@/lib/forms";

const createSchema = clientFormSchema.extend({ address: addressFormSchema });

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function CreateClientDialog({ open, onOpenChange, onCreated }: DialogProps & { onCreated: (client: Client) => void }) {
  const create = useCreateClient();
  const form = useForm<z.input<typeof createSchema>, unknown, z.output<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", phone: "", address: emptyAddress },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(values => create.mutate(values, {
    onSuccess: client => { toast.success("تمت إضافة العميل"); onOpenChange(false); form.reset(); onCreated(client); },
  }));

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) create.reset(); onOpenChange(value); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>عميل جديد</DialogTitle>
          <DialogDescription>رقم الهاتف هو هوية العميل، ولكل رقم عميل واحد فقط.</DialogDescription>
        </DialogHeader>
        <form id="client-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم العميل" error={errors.name?.message}><Input {...form.register("name")} /></Field>
            <Field label="رقم الهاتف" error={errors.phone?.message} hint="بالصيغة الدولية، مثل ‎+96550000000"><Input {...form.register("phone")} type="tel" dir="ltr" inputMode="tel" className="text-start" placeholder="+965" /></Field>
          </div>
          <Separator />
          <p className="text-sm font-medium">عنوان الزيارة</p>
          <AddressFields register={name => form.register(`address.${name}`)} errors={errors.address ?? {}} />
        </form>
        <FormAlert error={create.error} />
        <DialogFooter><Button type="submit" form="client-form" disabled={create.isPending}>إضافة العميل</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditClientDialog({ client, open, onOpenChange }: DialogProps & { client: Client }) {
  const update = useUpdateClient();
  const form = useForm({ resolver: zodResolver(clientFormSchema), values: { name: client.name, phone: client.phone } });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(values => {
    const changes = { ...(values.name !== client.name ? { name: values.name } : {}), ...(values.phone !== client.phone ? { phone: values.phone } : {}) };
    if (Object.keys(changes).length === 0) { onOpenChange(false); return; }
    update.mutate({ id: client.id, ...changes }, { onSuccess: () => { toast.success("تم حفظ بيانات العميل"); onOpenChange(false); } });
  });

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) update.reset(); onOpenChange(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل بيانات العميل</DialogTitle>
          <DialogDescription>لا يتغير اسم العميل أو رقمه في الحجوزات والفواتير السابقة.</DialogDescription>
        </DialogHeader>
        <form id="edit-client-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="اسم العميل" error={errors.name?.message}><Input {...form.register("name")} /></Field>
          <Field label="رقم الهاتف" error={errors.phone?.message}><Input {...form.register("phone")} type="tel" dir="ltr" inputMode="tel" className="text-start" /></Field>
        </form>
        <FormAlert error={update.error} />
        <DialogFooter><Button type="submit" form="edit-client-form" disabled={update.isPending}>حفظ التغييرات</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toForm = (address: Address) => ({
  area: address.area, block: address.block, street: address.street, houseNumber: address.houseNumber ?? "", buildingName: address.buildingName ?? "",
  floor: address.floor ?? "", apartment: address.apartment ?? "", instructions: address.instructions ?? "", mapsUrl: address.mapsUrl ?? "",
  latitude: address.latitude ?? "", longitude: address.longitude ?? "",
});

/** Adds a new address, or edits `address` when given. */
export function AddressDialog({ clientId, address, open, onOpenChange, onSaved }: DialogProps & { clientId: string; address: Address | null; onSaved?: (address: Address) => void }) {
  const add = useAddAddress();
  const update = useUpdateAddress();
  const mutation = address ? update : add;
  const form = useForm<z.input<typeof addressFormSchema>, unknown, z.output<typeof addressFormSchema>>({
    resolver: zodResolver(addressFormSchema),
    values: address ? toForm(address) : emptyAddress,
  });
  const submit = form.handleSubmit(values => {
    const done = (saved: Address) => { toast.success(address ? "تم حفظ العنوان" : "تمت إضافة العنوان"); onOpenChange(false); onSaved?.(saved); };
    if (address) update.mutate({ clientId, addressId: address.id, ...values }, { onSuccess: done });
    else add.mutate({ clientId, ...values }, { onSuccess: done });
  });

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) { add.reset(); update.reset(); } onOpenChange(value); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{address ? "تعديل العنوان" : "عنوان جديد"}</DialogTitle>
          <DialogDescription>{address ? "التعديل يظهر في الحجوزات الجديدة فقط؛ الحجوزات السابقة تحتفظ بعنوانها كما كان." : "يمكن للعميل أن يكون له أكثر من عنوان."}</DialogDescription>
        </DialogHeader>
        <form id="address-form" onSubmit={submit} noValidate><AddressFields register={name => form.register(name)} errors={form.formState.errors} /></form>
        <FormAlert error={mutation.error} />
        <DialogFooter><Button type="submit" form="address-form" disabled={mutation.isPending}>{address ? "حفظ العنوان" : "إضافة العنوان"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
