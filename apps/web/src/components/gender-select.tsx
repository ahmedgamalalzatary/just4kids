"use client";

import type { ComponentProps } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const genderLabels = { male: "Male", female: "Female" } as const;

/**
 * Male/female picker for a barber; empty shows "Select gender" until the administrator chooses.
 * Other props (the label's id and error links from Field) go to the visible trigger.
 */
export function GenderSelect({ value, onChange, ...trigger }: { value: string; onChange: (value: string) => void } & Omit<ComponentProps<typeof SelectTrigger>, "value" | "onChange">) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger {...trigger} className="w-full"><SelectValue placeholder="Select gender" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="male">{genderLabels.male}</SelectItem>
        <SelectItem value="female">{genderLabels.female}</SelectItem>
      </SelectContent>
    </Select>
  );
}
