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
import { fromFils, formatKwd, toFils } from "@/lib/money";
import { cn } from "@/lib/utils";

const amountPattern = /^(0|[1-9][0-9]*)\.\d{3}$/;
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
  { key: "date", label: "التاريخ" },
  { key: "normalChildren", label: "أطفال عاديون" },
  { key: "specialChildren", label: "أطفال ذوو احتياجات خاصة" },
  { key: "cash", label: "نقداً" },
  { key: "link", label: "رابط" },
  { key: "knet", label: "كي نت" },
  { key: "total", label: "الإجمالي" },
] as const;
type CollectionSnapshot = NonNullable<BarberCollectionEvent["before"]>;

/** The before → after lines for one stored collection edit. */
function collectionChanges(before: CollectionSnapshot, after: CollectionSnapshot) {
  return collectionFields.filter(field => before[field.key] !== after[field.key]).map(field => `${field.label}: ${before[field.key]} ← ${after[field.key]}`);
}

/** The stored edit history of one daily collection, latest action first. */
function CollectionHistory({ id }: { id: string }) {
  const history = useCollectionHistory(id);
  if (history.isPending) return <LoadingRows rows={2} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  if (history.data.length === 0) return null;
  return (
    <section aria-label="سجل التعديلات" className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">سجل التعديلات</h3>
      <ol className="flex flex-col gap-3">
        {[...history.data].reverse().map(event => (
          <li key={event.id} className="text-sm">
            <p className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</p>
            {event.before === null
              ? <p>أُنشئ الإدخال</p>
              : <ul className="flex flex-col gap-0.5">{collectionChanges(event.before, event.after).map(change => <li key={change}>{change}</li>)}</ul>}
          </li>
        ))}
      </ol>
    </section>
  );
}

type Form = { employeeId: string; date: string; normalChildren: string; specialChildren: string; cash: string; link: string; knet: string };
const blank = (): Form => ({ employeeId: "", date: kuwaitNow().date, normalChildren: "0", specialChildren: "0", cash: "0.000", link: "0.000", knet: "0.000" });

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
      setForm(current => ({ ...current, normalChildren: "0", specialChildren: "0", cash: "0.000", link: "0.000", knet: "0.000", [key]: value }));
    } else {
      setEditedFields(current => current.includes(key) ? current : [...current, key]);
      setForm(current => ({ ...current, [key]: value }));
    }
  };
  const prefillBlocked = canPrefill && (appliedPrefill !== prefillKey || visits.isError);
  const close = (value: boolean) => { if (!value) { create.reset(); update.reset(); } onOpenChange(value); };
  const submit = () => {
    if (prefillBlocked) return;
    if (!entry && !form.employeeId) { setProblem("اختر الحلاق"); return; }
    if (!form.date) { setProblem("اختر التاريخ"); return; }
    const normalChildren = Number(form.normalChildren), specialChildren = Number(form.specialChildren);
    if (!Number.isInteger(normalChildren) || normalChildren < 0 || !Number.isInteger(specialChildren) || specialChildren < 0) { setProblem("أدخل أعداد أطفال صحيحة"); return; }
    if (![form.cash, form.link, form.knet].every(amount => amountPattern.test(amount))) { setProblem("أدخل المبالغ بثلاث خانات عشرية، مثل 5.000"); return; }
    setProblem(null);
    const done = { onSuccess: () => { toast.success(entry ? "تم حفظ الإدخال" : "تمت إضافة الإدخال"); close(false); } };
    if (!entry) { create.mutate({ employeeId: form.employeeId, date: form.date, normalChildren, specialChildren, cash: form.cash, link: form.link, knet: form.knet }, done); return; }
    // Send only changed fields with the loaded version so a concurrent edit is rejected rather than overwritten.
    const patch: { date?: string; normalChildren?: number; specialChildren?: number; cash?: string; link?: string; knet?: string } = {};
    if (form.date !== entry.date) patch.date = form.date;
    if (normalChildren !== entry.normalChildren) patch.normalChildren = normalChildren;
    if (specialChildren !== entry.specialChildren) patch.specialChildren = specialChildren;
    if (form.cash !== entry.cash) patch.cash = form.cash;
    if (form.link !== entry.link) patch.link = form.link;
    if (form.knet !== entry.knet) patch.knet = form.knet;
    if (Object.keys(patch).length === 0) { close(false); return; }
    update.mutate({ id: entry.id, expectedVersion: entry.version, ...patch }, done);
  };
  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "تعديل تحصيل الحلاق" : "تحصيل الحلاق اليومي"}</DialogTitle>
          <DialogDescription>إدخال واحد لكل حلاق في اليوم الواحد. الإجمالي يُحسب تلقائياً من النقد والرابط وكي نت.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التاريخ"><Input type="date" value={form.date} onChange={event => set("date")(event.target.value)} /></Field>
            <Field label="الحلاق">
              <Select value={form.employeeId} onValueChange={set("employeeId")} disabled={Boolean(entry)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر الحلاق" /></SelectTrigger>
                <SelectContent>{(employees.data ?? []).map(employee => <SelectItem key={employee.id} value={employee.id}>{employee.displayName}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="أطفال عاديون"><Input type="number" min="0" step="1" value={form.normalChildren} onChange={event => set("normalChildren")(event.target.value)} /></Field>
            <Field label="أطفال ذوو احتياجات خاصة"><Input type="number" min="0" step="1" value={form.specialChildren} onChange={event => set("specialChildren")(event.target.value)} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="نقداً (KWD)"><Input inputMode="decimal" dir="ltr" className="text-start" value={form.cash} onChange={event => set("cash")(event.target.value)} /></Field>
            <Field label="رابط الدفع (KWD)"><Input inputMode="decimal" dir="ltr" className="text-start" value={form.link} onChange={event => set("link")(event.target.value)} /></Field>
            <Field label="كي نت (KWD)"><Input inputMode="decimal" dir="ltr" className="text-start" value={form.knet} onChange={event => set("knet")(event.target.value)} /></Field>
          </div>
          {canPrefill && visits.isPending ? <p role="status" className="text-sm text-muted-foreground">جارٍ تحميل زيارات اليوم المكتملة…</p> : null}
          {canPrefill && visits.isError ? <ErrorState error={visits.error} onRetry={() => visits.refetch()} /> : null}
          {appliedPrefill === prefillKey ? <p className="text-xs text-muted-foreground">تم الملء تلقائياً من زيارات اليوم المكتملة مع الاحتفاظ بتعديلاتك. يمكنك تعديل الأرقام.</p> : null}
          <div className="rounded-md bg-muted px-4 py-3 text-center text-xl font-semibold">الإجمالي: {[form.cash, form.link, form.knet].every(amount => amountPattern.test(amount)) ? <Ltr>{formatKwd(collectionTotal(form.cash, form.link, form.knet))}</Ltr> : "—"}</div>
          {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
          <FormAlert error={mutation.error} />
        </div>
        {entry ? <CollectionHistory id={entry.id} /> : null}
        <DialogFooter><Button onClick={submit} disabled={mutation.isPending || prefillBlocked}>حفظ التحصيل</Button></DialogFooter>
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
      <PageHeader title="تحصيلات الحلاقين" description={isAdmin ? "إدخال تحصيلات كل حلاق (نقداً / رابط / كي نت) واحد لكل حلاق في اليوم." : "تحصيلاتك اليومية، للعرض فقط."} actions={isAdmin ? <Button onClick={openNew}><Plus aria-hidden />إدخال جديد</Button> : undefined} />
      <div className="flex flex-col gap-6">
        <Card className="flex flex-wrap items-end gap-4 p-5">
          <Field label="من تاريخ"><Input type="date" value={from} onChange={event => setFrom(event.target.value)} /></Field>
          <Field label="إلى تاريخ"><Input type="date" value={to} onChange={event => setTo(event.target.value)} /></Field>
          {isAdmin ? (
            <Field label="الحلاق">
              <OptionSelect value={employeeId} onChange={setEmployeeId} all="كل الحلاقين" options={(employees.data ?? []).map(employee => ({ value: employee.id, label: employee.displayName }))} />
            </Field>
          ) : null}
        </Card>
        {report.isPending ? <Card><LoadingRows /></Card> : report.isError ? <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card> : (
          <Card className={cn(report.isPlaceholderData && "opacity-60")}>
            {report.data.entries.length === 0 ? <EmptyState icon={Coins} title="لا يوجد تحصيل مسجل" description={isAdmin ? "أضف إدخالاً لهذا الحلاق في هذا اليوم." : "لا توجد تحصيلات مسجلة لك في هذه الفترة."} /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="ps-5">التاريخ</TableHead>
                    <TableHead>الحلاق</TableHead>
                    <TableHead>عادي</TableHead>
                    <TableHead>خاص</TableHead>
                    <TableHead>نقداً</TableHead>
                    <TableHead>رابط</TableHead>
                    <TableHead>كي نت</TableHead>
                    <TableHead>الإجمالي</TableHead>
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
                      {isAdmin ? <TableCell className="pe-5 text-end"><Button variant="ghost" size="icon-sm" aria-label="تعديل الإدخال" onClick={() => openEdit(entry)}><Pencil /></Button></TableCell> : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {totals ? (
              <div className="grid grid-cols-2 gap-4 border-t border-border p-5 sm:grid-cols-6">
                <Summary label="عادي" value={String(totals.normalChildren)} />
                <Summary label="خاص" value={String(totals.specialChildren)} />
                <Summary label="نقداً" value={formatKwd(totals.cash)} />
                <Summary label="رابط" value={formatKwd(totals.link)} />
                <Summary label="كي نت" value={formatKwd(totals.knet)} />
                <Summary label="الإجمالي" value={formatKwd(totals.total)} />
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
