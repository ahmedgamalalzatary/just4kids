"use client";

import { useState } from "react";
import { Coins, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminOnly } from "@/components/app-shell";
import { Field, FormAlert } from "@/components/field";
import { EmptyState, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { SalonFilterBar, useReportFilters } from "@/components/reports";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranches, useCreateSalonEntry, useSalonReport, useUpdateSalonEntry } from "@/lib/api/hooks";
import type { SalonEntry } from "@/lib/api/types";
import { formatDate } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { salonTotal } from "@/lib/salon";
import { cn } from "@/lib/utils";

const amountPattern = /^(0|[1-9][0-9]*)\.\d{3}$/;
function localDate() { return new Date().toLocaleDateString("en-CA"); }

type Form = { branchId: string; date: string; childCount: string; cash: string; link: string; knet: string };
const blank = (): Form => ({ branchId: "", date: localDate(), childCount: "0", cash: "0.000", link: "0.000", knet: "0.000" });

/** Creates or edits one branch's daily salon entry. The total is computed from the three methods. */
function EntryDialog({ entry, onOpenChange }: { entry: SalonEntry | null; onOpenChange: (open: boolean) => void }) {
  const branches = useBranches(true);
  const create = useCreateSalonEntry();
  const update = useUpdateSalonEntry();
  const mutation = entry ? update : create;
  const [form, setForm] = useState<Form>(() => entry ? { branchId: entry.branchId, date: entry.date, childCount: String(entry.childCount), cash: entry.cash, link: entry.link, knet: entry.knet } : blank());
  const [problem, setProblem] = useState<string | null>(null);
  const set = <Key extends keyof Form>(key: Key) => (value: string) => setForm(current => ({ ...current, [key]: value }));
  const close = (value: boolean) => { if (!value) { create.reset(); update.reset(); } onOpenChange(value); };
  const submit = () => {
    if (!entry && !form.branchId) { setProblem("اختر الفرع"); return; }
    if (!form.date) { setProblem("اختر التاريخ"); return; }
    const childCount = Number(form.childCount);
    if (!Number.isInteger(childCount) || childCount < 0) { setProblem("أدخل عدد أطفال صحيحاً"); return; }
    if (![form.cash, form.link, form.knet].every(amount => amountPattern.test(amount))) { setProblem("أدخل المبالغ بثلاث خانات عشرية، مثل 5.000"); return; }
    setProblem(null);
    const done = { onSuccess: () => { toast.success(entry ? "تم حفظ الإدخال" : "تمت إضافة الإدخال"); close(false); } };
    if (entry) update.mutate({ id: entry.id, date: form.date, childCount, cash: form.cash, link: form.link, knet: form.knet }, done);
    else create.mutate({ branchId: form.branchId, date: form.date, childCount, cash: form.cash, link: form.link, knet: form.knet }, done);
  };
  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "تعديل شغل الصالون" : "شغل الصالون اليومي"}</DialogTitle>
          <DialogDescription>إدخال واحد لكل فرع في اليوم الواحد. الإجمالي يُحسب تلقائياً من النقد والرابط وكي نت.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التاريخ">
              <Input type="date" value={form.date} onChange={event => set("date")(event.target.value)} />
            </Field>
            <Field label="الفرع">
              <Select value={form.branchId} onValueChange={set("branchId")} disabled={Boolean(entry)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent>{(branches.data ?? []).map(branch => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="عدد الأطفال">
              <Input type="number" min="0" step="1" value={form.childCount} onChange={event => set("childCount")(event.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="نقداً (KWD)"><Input inputMode="decimal" dir="ltr" className="text-start" value={form.cash} onChange={event => set("cash")(event.target.value)} /></Field>
            <Field label="رابط الدفع (KWD)"><Input inputMode="decimal" dir="ltr" className="text-start" value={form.link} onChange={event => set("link")(event.target.value)} /></Field>
            <Field label="كي نت (KWD)"><Input inputMode="decimal" dir="ltr" className="text-start" value={form.knet} onChange={event => set("knet")(event.target.value)} /></Field>
          </div>
          <div className="rounded-md bg-muted px-4 py-3 text-center text-xl font-semibold">الإجمالي: <Ltr>{formatKwd(salonTotal(form.cash, form.link, form.knet))}</Ltr></div>
          {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
          <FormAlert error={mutation.error} />
        </div>
        <DialogFooter><Button onClick={submit} disabled={mutation.isPending}>حفظ شغل اليوم</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SalonScreen() {
  const { filters } = useReportFilters();
  const report = useSalonReport({ from: filters.from, to: filters.to, branchId: filters.branchId });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalonEntry | null>(null);
  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (entry: SalonEntry) => { setEditing(entry); setOpen(true); };
  const totals = report.data?.totals;

  return (
    <>
      <PageHeader title="شغل الصالون اليومي" description="إدخال تحصيلات الصالون (نقداً / رابط / كي نت) واحد لكل فرع في اليوم." actions={<Button onClick={openNew}><Plus aria-hidden />إدخال جديد</Button>} />
      <div className="flex flex-col gap-6">
        <SalonFilterBar />
        {report.isPending ? <Card><LoadingRows /></Card> : report.isError ? <Card><ErrorState error={report.error} onRetry={() => report.refetch()} /></Card> : (
          <Card className={cn(report.isPlaceholderData && "opacity-60")}>
            {report.data.entries.length === 0 ? <EmptyState icon={Coins} title="لا يوجد شغل مسجل" description="أضف إدخالاً لهذا الفرع في هذا اليوم." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="ps-5">التاريخ</TableHead>
                    <TableHead>الفرع</TableHead>
                    <TableHead>الأطفال</TableHead>
                    <TableHead>نقداً</TableHead>
                    <TableHead>رابط</TableHead>
                    <TableHead>كي نت</TableHead>
                    <TableHead>الإجمالي</TableHead>
                    <TableHead className="pe-5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.entries.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell className="ps-5">{formatDate(entry.date)}</TableCell>
                      <TableCell>{entry.branchName}</TableCell>
                      <TableCell data-numeric>{entry.childCount}</TableCell>
                      <TableCell data-numeric>{formatKwd(entry.cash)}</TableCell>
                      <TableCell data-numeric>{formatKwd(entry.link)}</TableCell>
                      <TableCell data-numeric>{formatKwd(entry.knet)}</TableCell>
                      <TableCell data-numeric className="font-medium">{formatKwd(entry.total)}</TableCell>
                      <TableCell className="pe-5 text-end"><Button variant="ghost" size="icon-sm" aria-label="تعديل الإدخال" onClick={() => openEdit(entry)}><Pencil /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {totals ? (
              <div className="grid grid-cols-2 gap-4 border-t border-border p-5 sm:grid-cols-5">
                <Summary label="عدد الأطفال" value={String(totals.childCount)} />
                <Summary label="نقداً" value={formatKwd(totals.cash)} />
                <Summary label="رابط" value={formatKwd(totals.link)} />
                <Summary label="كي نت" value={formatKwd(totals.knet)} />
                <Summary label="الإجمالي" value={formatKwd(totals.total)} />
              </div>
            ) : null}
          </Card>
        )}
      </div>
      {open ? <EntryDialog key={editing?.id ?? "new"} entry={editing} onOpenChange={setOpen} /> : null}
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

export default function SalonPage() {
  return <AdminOnly><SalonScreen /></AdminOnly>;
}
