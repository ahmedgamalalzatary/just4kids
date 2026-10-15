"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import type { AddressForm } from "@/lib/forms";
import { AreaPicker } from "@/components/area-picker";

type Errors = Partial<Record<keyof AddressForm, { message?: string | undefined } | undefined>>;

/** Kuwaiti service-address fields. Works inside any form through the given `register`. */
export function AddressFields({ register, errors, areaValue, originalArea = "" }: { register: (name: keyof AddressForm) => UseFormRegisterReturn; errors: Errors; areaValue: string; originalArea?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <AreaPicker registration={register("area")} value={areaValue} originalArea={originalArea} error={errors.area?.message} />
      <Field label="Block" error={errors.block?.message} className="sm:col-span-3"><Input {...register("block")} /></Field>
      <Field label="Street" error={errors.street?.message} className="sm:col-span-6"><Input {...register("street")} /></Field>
      <Field label="House number" error={errors.houseNumber?.message} className="sm:col-span-3" hint="Or enter the building name."><Input {...register("houseNumber")} /></Field>
      <Field label="Building name" error={errors.buildingName?.message} className="sm:col-span-3" optional><Input {...register("buildingName")} /></Field>
      <Field label="Floor" error={errors.floor?.message} className="sm:col-span-3" optional><Input {...register("floor")} /></Field>
      <Field label="Apartment" error={errors.apartment?.message} className="sm:col-span-3" optional><Input {...register("apartment")} /></Field>
      <Field label="Avenue" error={errors.avenue?.message} className="sm:col-span-3" optional><Input {...register("avenue")} /></Field>
      <Field label="Gate (G)" error={errors.gate?.message} className="sm:col-span-3" optional><Input {...register("gate")} /></Field>
      <Field label="Blue number" error={errors.blueNumber?.message} className="sm:col-span-3" optional><Input {...register("blueNumber")} /></Field>
      <Field label="Google Maps link" error={errors.mapsUrl?.message} className="sm:col-span-6" optional><Input {...register("mapsUrl")} dir="ltr" inputMode="url" className="text-start" placeholder="https://maps.app.goo.gl/…" /></Field>
    </div>
  );
}
