"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AddressForm } from "@/lib/forms";
import { AreaPicker } from "@/components/area-picker";

type Errors = Partial<Record<keyof AddressForm, { message?: string | undefined } | undefined>>;

/** Kuwaiti service-address fields. Works inside any form through the given `register`. */
export function AddressFields({ register, errors, areaValue, originalArea = "" }: { register: (name: keyof AddressForm) => UseFormRegisterReturn; errors: Errors; areaValue: string; originalArea?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <AreaPicker registration={register("area")} value={areaValue} originalArea={originalArea} error={errors.area?.message} />
      <Field label="القطعة" error={errors.block?.message} className="sm:col-span-3"><Input {...register("block")} /></Field>
      <Field label="الشارع" error={errors.street?.message} className="sm:col-span-6"><Input {...register("street")} /></Field>
      <Field label="رقم المنزل" error={errors.houseNumber?.message} className="sm:col-span-3" hint="أو اكتب اسم المبنى."><Input {...register("houseNumber")} /></Field>
      <Field label="اسم المبنى" error={errors.buildingName?.message} className="sm:col-span-3" optional><Input {...register("buildingName")} /></Field>
      <Field label="الدور" error={errors.floor?.message} className="sm:col-span-3" optional><Input {...register("floor")} /></Field>
      <Field label="الشقة" error={errors.apartment?.message} className="sm:col-span-3" optional><Input {...register("apartment")} /></Field>
      <Field label="الجادة" error={errors.avenue?.message} className="sm:col-span-3" optional><Input {...register("avenue")} /></Field>
      <Field label="البوابة (G)" error={errors.gate?.message} className="sm:col-span-3" optional><Input {...register("gate")} /></Field>
      <Field label="الرقم الأزرق" error={errors.blueNumber?.message} className="sm:col-span-3" optional><Input {...register("blueNumber")} /></Field>
      <Field label="تعليمات للحلاق" error={errors.instructions?.message} className="sm:col-span-6" optional><Textarea rows={2} {...register("instructions")} placeholder="مثل: الباب الجانبي، الجرس لا يعمل" /></Field>
      <Field label="رابط خرائط Google" error={errors.mapsUrl?.message} className="sm:col-span-6" optional><Input {...register("mapsUrl")} dir="ltr" inputMode="url" className="text-start" placeholder="https://maps.app.goo.gl/…" /></Field>
      <Field label="خط العرض" error={errors.latitude?.message} className="sm:col-span-3" optional hint="من موقع واتساب."><Input {...register("latitude")} dir="ltr" inputMode="decimal" className="text-start" placeholder="29.3759" /></Field>
      <Field label="خط الطول" error={errors.longitude?.message} className="sm:col-span-3" optional><Input {...register("longitude")} dir="ltr" inputMode="decimal" className="text-start" placeholder="47.9774" /></Field>
    </div>
  );
}
