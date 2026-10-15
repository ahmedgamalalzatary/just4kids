"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapPin, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Field, FormAlert } from "@/components/field";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAreas, useCreateArea, useUpdateArea } from "@/lib/api/hooks";
import type { Area } from "@/lib/api/types";
import { requiredText } from "@/lib/forms";

const schema = z.object({ name: requiredText(120, "Enter the area name") });
export function AreasScreen() {
  const areas = useAreas(), create = useCreateArea(), update = useUpdateArea();
  const [editing, setEditing] = useState<Area | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: "" } });
  const busy = create.isPending || update.isPending;
  const reset = () => { setEditing(null); form.reset({ name: "" }); create.reset(); update.reset(); };
  const submit = form.handleSubmit(values => {
    const onSuccess = () => { toast.success(editing ? "Area name saved" : "Area added"); reset(); };
    if (editing) update.mutate({ id: editing.id, ...values }, { onSuccess });
    else create.mutate(values, { onSuccess });
  });
  const rows = (areas.data ?? []).filter(area => area.name.includes(search.trim()) && (status === "all" || area.enabled === (status === "active")));
  return (
    <>
      <PageHeader title="Areas" description="Address areas. Stopping an area prevents its use in new addresses; existing addresses and reservations keep their saved name." />
      <Card className="mb-5 p-5">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field label="Area name" error={form.formState.errors.name?.message} className="min-w-0 flex-1"><Input {...form.register("name")} maxLength={120} disabled={busy} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>{editing ? <Pencil aria-hidden /> : <Plus aria-hidden />}{editing ? "Save name" : "Add area"}</Button>
            {editing ? <Button type="button" variant="outline" onClick={reset} disabled={busy}>Cancel edit</Button> : null}
          </div>
        </form>
        <div className="mt-3"><FormAlert error={create.error ?? update.error} /></div>
      </Card>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label="Search areas"><Input type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field>
        <Field label="Area status"><select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"><option value="all">All areas</option><option value="active">Available</option><option value="stopped">Stopped</option></select></Field>
      </div>
      <Card>
        {areas.isPending ? <LoadingRows rows={3} /> : areas.isError ? <ErrorState error={areas.error} onRetry={() => areas.refetch()} /> : rows.length === 0 ? <EmptyState icon={MapPin} title={areas.data.length === 0 ? "No areas yet" : "No matching areas"} description={areas.data.length === 0 ? "Add the first area above to make it available in addresses." : "Change the search or area status."} /> : (
          <ul className="divide-y divide-border">
            {rows.map(area => <li key={area.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="break-words font-medium">{area.name}</p><p className="mt-1 text-sm text-muted-foreground">{area.enabled ? "Available" : "Stopped"}</p></div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => { setEditing(area); form.reset({ name: area.name }); create.reset(); update.reset(); }}><Pencil aria-hidden />Edit</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => update.mutate({ id: area.id, enabled: !area.enabled }, { onSuccess: () => toast.success(area.enabled ? "Area stopped" : "Area activated") })}>{area.enabled ? "Stop" : "Activate"}</Button>
              </div>
            </li>)}
          </ul>
        )}
      </Card>
    </>
  );
}
