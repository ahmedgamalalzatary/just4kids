"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Branch } from "@/lib/api/types";

export function BranchSelect({ branches, value, onChange, id, ...aria }: {
  branches: Branch[]; value: string; onChange: (value: string) => void; id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" {...aria}><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
      <SelectContent>
        {branches.map(branch => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
