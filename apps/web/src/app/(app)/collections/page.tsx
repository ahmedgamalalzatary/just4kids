"use client";

import { useState } from "react";
import { Coins, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Field, FormAlert } from "@/components/field";
import { EmptyState, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { OptionSelect } from "@/components/reports";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCollectionDayBookings, useCollectionHistory, useCollectionReport, useCreateCollection, useEmployees, useUpdateCollection } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { BarberCollection, BarberCollectionEvent, Booking } from "@/lib/api/types";
import { formatDate, formatDateTime, kuwaitNow } from "@/lib/kuwait-time";
import { amountOrZero, amountPattern, fromFils, formatKwd, toFils } from "@/lib/money";
import { cn } from "@/lib/utils";

const collectionTotal = (cash: string, link: string, knet: string) => fromFils(toFils(cash) + toFils(link) + toFils(knet));

/** Sums a day's completed visits for a new collection: normal children exclude the special subset, and money follows each invoice. */
function prefillFromVisits(bookings: Booking[]) {
  const completed = bookings.filter(booking => booking.visitStatus === "completed");
  return completed.reduce((totals, booking) => ({
    normalChildren: totals.normalChildren + booking.childCount - booking.specialChildCount,
    specialChildren: totals.specialChildren + booking.specialChildCount,
    cash: fromFils(toFils(totals.cash) + toFils(booking.invoice.amountCash)),
    link: fromFils(toFils(totals.link) + toFils(booking.invoice.amountLink)),
  }), { normalChildren: 0, specialChildren: 0, cash: "0.000", link: "0.000" });
}

const collectionFields = [
  { key: "date", label: "Date" },
  { key: "normalChildren", label: "Other children" },
  { key: "specialChildren", label: "Children with special needs" },
  { key: "cash", label: "Cash" },
  { key: "link", label: "Link" },
  { key: "knet", label: "KNET" },
  { key: "total", label: "Total" },
] as const;
type CollectionSnapshot = NonNullable<BarberCollectionEvent["before"]>;

/** The before → after lines for one stored collection edit. */
function collectionChanges(before: CollectionSnapshot, after: CollectionSnapshot) {
  return collectionFields.filter(field => before[field.key] !== after[field.key]).map(field => `${field.label}: ${before[field.key]} → ${after[field.key]}`);
}

/** The stored edit history of one daily collection, latest action first. */
function CollectionHistory({ id }: { id: string }) {
  const history = useCollectionHistory(id);
  if (history.isPending) return <LoadingRows rows={2} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  if (history.data.length === 0) return null;
  return (
    <section aria-label="Edit history" className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Edit history</h3>
      <ol className="flex flex-col gap-3">
        {[...history.data].reverse().map(event => (
          <li key={event.id} className="text-sm">
            <p className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</p>
            {event.before === null
              ? <p>Entry created</p>
              : <ul className="flex flex-col gap-0.5">{collectionChanges(event.before, event.after).map(change => <li key={change}>{change}</li>)}</ul>}
          </li>
        ))}
      </ol>
    </section>
  );
}

type Form = { employeeId: string; date: string; normalChildren: string; specialChildren: string; cash: string; link: string; knet: string };
const blank = (): Form => ({ employeeId: "", date: kuwaitNow().date, normalChildren: "", specialChildren: "", cash: "", link: "", knet: "" });

/** Creates or edits one barber's daily collection. The total is computed from the three methods. */
function EntryDialog({ entry, onOpenChange }: { entry: BarberCollection | null; onOpenChange: (open: boolean) => void }) {
  const employees = useEmployees(true);
  const create = useCreateCollection();
  const update = useUpdateCollection();
  const mutation = entry ? update : create;
  const [form, setForm] = useState<Form>(() => entry ? { employeeId: entry.employeeId, date: entry.date, normalChildren: String(entry.normalChildren), specialChildren: String(entry.specialChildren), cash: entry.cash, link: entry.link, knet: entry.knet } : blank());
  const [problem, setProblem] = useState<string | null>(null);
  const canPrefill = !entry && Boolean(form.employeeId) && Boolean(form.date);
  const visits = useCollectionDayBookings(form.date, form.employeeId, canPrefill);
  const prefillKey = `${form.employeeId}:${form.date}`;
  const [appliedPrefill, setAppliedPrefill] = useState<string | null>(null);
  const [editedFields, setEditedFields] = useState<(keyof Form)[]>([]);
  // Fill a new entry from the day's completed visits once a barber and date are chosen, without touching later edits.
  const prefill = !canPrefill || visits.isFetching || !visits.isSuccess ? null : prefillFromVisits(visits.data);
  if (prefill && appliedPrefill !== prefillKey) {
    setAppliedPrefill(prefillKey);
    setForm(current => ({ ...current,
      normalChildren: editedFields.includes("normalChildren") ? current.normalChildren : String(prefill.normalChildren),
      specialChildren: editedFields.includes("specialChildren") ? current.specialChildren : String(prefill.specialChildren),
      cash: editedFields.includes("cash") ? current.cash : prefill.cash,
      link: editedFields.includes("link") ? current.link : prefill.link,
    }));
  }
  const set = <Key extends keyof Form>(key: Key) => (value: string) => {
    if (!entry && (key === "employeeId" || key === "date") && form[key] !== value) {
      setAppliedPrefill(null);
      setEditedFields([]);
      setForm(current => ({ ...current, normalChildren: "", specialChildren: "", cash: "", link: "", knet: "", [key]: value }));
    } else {
      setEditedFields(current => current.includes(key) ? current : [...current, key]);
      setForm(current => ({ ...current, [key]: value }));
    }
  };
  const prefillBlocked = canPrefill && (appliedPrefill !== prefillKey || visits.isError);
  const close = (value: boolean) => { if (!value) { create.reset(); update.reset(); } onOpenChange(value); };
  const submit = () => {
    if (prefillBlocked) return;
    if (!entry && !form.employeeId) { setProblem("Select barber"); return; }
    if (!form.date) { setProblem("Select date"); return; }
    const normalChildren = form.normalChildren.trim() === "" ? 0 : Number(form.normalChildren), specialChildren = form.specialChildren.trim() === "" ? 0 : Number(form.specialChildren);
    if (!Number.isInteger(normalChildren) || normalChildren < 0 || !Number.isInteger(specialChildren) || specialChildren < 0) { setProblem("Enter valid child counts"); return; }
    const cash = amountOrZero(form.cash), link = amountOrZero(form.link), knet = amountOrZero(form.knet);
    if (![cash, link, knet].every(amount => amountPattern.test(amount))) { setProblem("Enter amounts with three decimal places, e.g. 5.000"); return; }
    setProblem(null);
    const done = { onSuccess: () => { toast.success(entry ? "Entry saved" : "Entry added"); close(false); } };
    if (!entry) { create.mutate({ employeeId: form.employeeId, date: form.date, normalChildren, specialChildren, cash, link, knet }, done); return; }
    // Send only changed fields with the loaded version so a concurrent edit is rejected rather than overwritten.
    const patch: { date?: string; normalChildren?: number; specialChildren?: number; cash?: string; link?: string; knet?: string } = {};
    if (form.date !== entry.date) patch.date = form.date;
    if (normalChildren !== entry.normalChildren) patch.normalChildren = normalChildren;
    if (specialChildren !== entry.specialChildren) patch.specialChildren = specialChildren;
    if (cash !== entry.cash) patch.cash = cash;
    if (link !== entry.link) patch.link = link;
    if (knet !== entry.knet) patch.knet = knet;
    if (Object.keys(patch).length === 0) { close(false); return; }
    update.mutate({ id: entry.id, expectedVersion: entry.version, ...patch }, done);
  };
  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit barber collection" : "Daily barber collections"}</DialogTitle>
          <DialogDescription>One entry per barber per day. Total is calculated from cash, link and KNET.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date"><Input type="date" value={form.date} onChange={event => set("date")(event.target.value)} /></Field>
            <Field label="Barber">
              <Select value={form.employeeId} onValueChange={set("employeeId")} disabled={Boolean(entry)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select barber" /></SelectTrigger>
                <SelectContent>{(employees.data ?? []).map(employee => <SelectItem key={employee.id} value={employee.id}>{employee.displayName}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Other children"><Input type="number" min="0" step="1" value={form.normalChildren} onChange={event => set("normalChildren")(event.target.value)} /></Field>
            <Field label="Children with special needs"><Input type="number" min="0" step="1" value={form.specialChildren} onChange={event => set("specialChildren")(event.target.value)} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Cash (KWD)"><Input inputMode="decimal" dir="ltr" className="text-start" value={form.cash} onChange={event => set("cash")(event.target.value)} /></Field>
            <Field label="Payment link (KWD)"><Input inputMode="decimal" dir="ltr" className="text-start" value={form.link} onChange={event => set("link")(event.target.value)} /></Field>
            <Field label="KNET (KWD)"><Input inputMode="decimal" dir="ltr" className="text-start" value={form.knet} onChange={event => set("knet")(event.target.value)} /></Field>
          </div>
          {canPrefill && visits.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading today&apos;s completed visits...</p> : null}
          {canPrefill && visits.isError ? <ErrorState error={visits.error} onRetry={() => visits.refetch()} /> : null}
          {appliedPrefill === prefillKey ? <p className="text-xs text-muted-foreground">Filled from today&apos;s completed visits while keeping your edits. You can adjust the counts.</p> : null}
          <div className="rounded-md bg-muted px-4 py-3 text-center text-xl font-semibold">Total: {[form.cash, form.link, form.knet].every(amount => amount.trim() === "" || amountPattern.test(amount)) ? <Ltr>{formatKwd(collectionTotal(amountOrZero(form.cash), amountOrZero(form.link), amountOrZero(form.knet)))}</Ltr> : "—"}</div>
          {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
          <FormAlert error={mutation.error} />
        </div>
        {entry ? <CollectionHistory id={entry.id} /> : null}
        <DialogFooter><Button onClick={submit} disabled={mutation.isPending || prefillBlocked}>Save collection</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollectionsScreen() {
  const isAdmin = useSession().data?.account.role === "admin";
  const [from, setFrom] = useState(kuwaitNow().date);
  const [to, setTo] = useState(kuwaitNow().date);
  const [employeeId, setEmployeeId] = useState("");
  const employees = useEmployees(isAdmin);
  const report = useCollectionReport({ from, to, employeeId: isAdmin ? employeeId : "" });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BarberCollection | null>(null);
  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (entry: BarberCollection) => { setEditing(entry); setOpen(true); };
  const totals = report.data?.totals;

  return (
    <>
      <PageHeader title="Barber collections" description={isAdmin ? "One daily collection entry (cash / link / KNET) per barber." : "Your daily collections, read only."} actions={isAdmin ? <Button onClick={openNew}><Plus aria-hidden />New entry</Button> : undefined} />
      <div className="flex flex-col gap-6">
        <Card className="flex flex-wrap items-end gap-4 p-5">
          <Field label="From date"><Input type="date" value={from} onChange={event => setFrom(event.target.value)} /></Field>
          <Field label="To date"><Input type="date" value={to} onChange={event => setTo(event.target.value)} /></Field>
          {isAdmin ? (
            <Field label="Barber">
              <OptionSelect value={employeeId} onChange={setEmployeeId} all="All barbers" options={(employees.data ?? []).map(employee => ({ value: employee.id, label: employee.displayName }))} />
            </Field>
          ) : null}
        </Card>
        {report.isPending ? <Card><LoadingRows /></Card> : report.isError ? <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card> : (
          <Card className={cn(report.isPlaceholderData && "opacity-60")}>
            {report.data.entries.length === 0 ? <EmptyState icon={Coins} title="No collection recorded" description={isAdmin ? "Add an entry for this barber on this day." : "No collections recorded for you in this period."} /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="ps-5">Date</TableHead>
                    <TableHead>Barber</TableHead>
                    <TableHead>Other</TableHead>
                    <TableHead>Special</TableHead>
                    <TableHead>Cash</TableHead>
                    <TableHead>Link</TableHead>
                    <TableHead>KNET</TableHead>
                    <TableHead>Total</TableHead>
                    {isAdmin ? <TableHead className="pe-5" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.entries.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell className="ps-5">{formatDate(entry.date)}</TableCell>
                      <TableCell>{entry.displayName}</TableCell>
                      <TableCell data-numeric>{entry.normalChildren}</TableCell>
                      <TableCell data-numeric>{entry.specialChildren}</TableCell>
                      <TableCell data-numeric>{formatKwd(entry.cash)}</TableCell>
                      <TableCell data-numeric>{formatKwd(entry.link)}</TableCell>
                      <TableCell data-numeric>{formatKwd(entry.knet)}</TableCell>
                      <TableCell data-numeric className="font-medium">{formatKwd(entry.total)}</TableCell>
                      {isAdmin ? <TableCell className="pe-5 text-end"><Button variant="ghost" size="icon-sm" aria-label="Edit entry" onClick={() => openEdit(entry)}><Pencil /></Button></TableCell> : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {totals ? (
              <div className="grid grid-cols-2 gap-4 border-t border-border p-5 sm:grid-cols-6">
                <Summary label="Other" value={String(totals.normalChildren)} />
                <Summary label="Special" value={String(totals.specialChildren)} />
                <Summary label="Cash" value={formatKwd(totals.cash)} />
                <Summary label="Link" value={formatKwd(totals.link)} />
                <Summary label="KNET" value={formatKwd(totals.knet)} />
                <Summary label="Total" value={formatKwd(totals.total)} />
              </div>
            ) : null}
          </Card>
        )}
      </div>
      {isAdmin && open ? <EntryDialog key={editing?.id ?? "new"} entry={editing} onOpenChange={setOpen} /> : null}
    </>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Ltr className="font-semibold">{value}</Ltr>
    </div>
  );
}

export default function CollectionsPage() {
  return <CollectionsScreen />;
}
