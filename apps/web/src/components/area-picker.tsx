"use client";

import { useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Field, FormAlert } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAreas } from "@/lib/api/hooks";

export function AreaPicker({ registration, value, originalArea, error }: { registration: UseFormRegisterReturn; value: string; originalArea: string; error?: string | undefined }) {
  const areas = useAreas("active");
  const [search, setSearch] = useState("");
  const list = areas.data ?? [];
  const legacy = originalArea && !list.some(area => area.name === originalArea);
  const matches = list.filter(area => area.name === value || area.name.includes(search.trim()));
  return (
    <div className="flex flex-col gap-3 sm:col-span-3">
      <Field label="Search areas"><Input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Enter part of the area name" /></Field>
      <Field label="Area" error={error} hint={legacy ? "Keep the saved area or select an available one." : "Choose an available area."}>
        <select {...registration} value={value} disabled={areas.isPending || areas.isError} className="h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:opacity-50 aria-invalid:border-destructive md:text-sm">
          <option value="">{areas.isPending ? "Loading areas..." : "Select area"}</option>
          {legacy ? <option value={originalArea}>{originalArea} (current address)</option> : null}
          {matches.map(area => <option key={area.id} value={area.name}>{area.name}</option>)}
        </select>
      </Field>
      {areas.isError ? <><FormAlert error={areas.error} /><Button type="button" variant="outline" size="sm" onClick={() => areas.refetch()}>Reload areas</Button></> : null}
      {!areas.isPending && !areas.isError && list.length === 0 ? <p className="text-sm text-muted-foreground">No available areas. Add or activate one on the Areas page.</p> : !areas.isPending && !areas.isError && matches.length === 0 ? <p className="text-sm text-muted-foreground">No matching area.</p> : null}
    </div>
  );
}
