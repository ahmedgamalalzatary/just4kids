"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Branch } from "@/lib/api/types";

// Radix Select forbids an empty item value, so a barber with no branch uses a sentinel that maps back to "".
const NONE = "__none__";

export function BranchSelect({ branches, value, onChange, id, ...aria }: {
  branches: Branch[]; value: string; onChange: (value: string) => void; id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string;
}) {
  return (
    <Select value={value === "" ? NONE : value} onValueChange={next => onChange(next === NONE ? "" : next)}>
      <SelectTrigger id={id} className="w-full" {...aria}><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>بدون فرع</SelectItem>
        {branches.map(branch => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
