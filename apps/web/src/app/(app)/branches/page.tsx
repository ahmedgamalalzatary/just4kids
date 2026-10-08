"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil, Plus, Store } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { Field, FormAlert } from "@/components/field";
import { EmptyState, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranches, useCreateBranch, useUpdateBranch } from "@/lib/api/hooks";
import type { Branch } from "@/lib/api/types";
import { branchFormSchema, type BranchForm } from "@/lib/forms";
import { formatDuration } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";

function BranchDialog({ branch, open, onOpenChange }: { branch: Branch | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const mutation = branch ? update : create;
  const form = useForm<BranchForm, unknown, ReturnType<typeof branchFormSchema.parse>>({
    resolver: zodResolver(branchFormSchema),
    values: branch
      ? { name: branch.name, location: branch.location, adultPrice: branch.adultPrice, childPrice: branch.childPrice, adultDurationMinutes: String(branch.adultDurationMinutes), childDurationMinutes: String(branch.childDurationMinutes) }
      : { name: "", location: "", adultPrice: "", childPrice: "", adultDurationMinutes: "30", childDurationMinutes: "20" },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(values => {
    const done = () => { toast.success(branch ? "تم حفظ الفرع" : "تمت إضافة الفرع"); onOpenChange(false); };
    if (branch) update.mutate({ id: branch.id, ...values }, { onSuccess: done });
    else create.mutate(values, { onSuccess: done });
  });

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) { create.reset(); update.reset(); } onOpenChange(value); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{branch ? "تعديل الفرع" : "إضافة فرع"}</DialogTitle>
          <DialogDescription>تطبَّق الأسعار الجديدة على الحجوزات الجديدة فقط؛ الفواتير السابقة تحتفظ بأسعارها.</DialogDescription>
        </DialogHeader>
        <form id="branch-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم الفرع" error={errors.name?.message} className="sm:col-span-2"><Input {...form.register("name")} /></Field>
          <Field label="الموقع أو العنوان" error={errors.location?.message} className="sm:col-span-2"><Textarea rows={2} {...form.register("location")} /></Field>
          <Field label="سعر حلاقة البالغ (د.ك)" error={errors.adultPrice?.message}><Input {...form.register("adultPrice")} dir="ltr" inputMode="decimal" placeholder="0.000" className="text-start" /></Field>
          <Field label="سعر حلاقة الطفل (د.ك)" error={errors.childPrice?.message}><Input {...form.register("childPrice")} dir="ltr" inputMode="decimal" placeholder="0.000" className="text-start" /></Field>
          <Field label="مدة حلاقة البالغ (دقيقة)" error={errors.adultDurationMinutes?.message} hint="للعرض فقط؛ لا تغيّر مدة نافذة الحجز."><Input {...form.register("adultDurationMinutes")} dir="ltr" inputMode="numeric" className="text-start" /></Field>
          <Field label="مدة حلاقة الطفل (دقيقة)" error={errors.childDurationMinutes?.message}><Input {...form.register("childDurationMinutes")} dir="ltr" inputMode="numeric" className="text-start" /></Field>
        </form>
        <FormAlert error={mutation.error} />
        <DialogFooter>
          <Button type="submit" form="branch-form" disabled={mutation.isPending}>{branch ? "حفظ التغييرات" : "إضافة الفرع"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BranchesScreen() {
  const branches = useBranches();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [open, setOpen] = useState(false);
  const openDialog = (branch: Branch | null) => { setEditing(branch); setOpen(true); };

  return (
    <>
      <PageHeader title="الفروع" description="أسعار الحلاقة ومدة كل خدمة لكل فرع." actions={<Button onClick={() => openDialog(null)}><Plus aria-hidden />إضافة فرع</Button>} />
      <Card>
        {branches.isPending ? <LoadingRows rows={3} /> : branches.isError ? <ErrorState error={branches.error} onRetry={() => branches.refetch()} /> : branches.data.length === 0 ? (
          <EmptyState icon={Store} title="لا توجد فروع بعد" description="أضف الفرع الأول لتحديد الأسعار وربط الحلاقين به." action={<Button onClick={() => openDialog(null)}><Plus aria-hidden />إضافة فرع</Button>} />
        ) : (
          <>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>الفرع</TableHead>
                  <TableHead>سعر البالغ</TableHead>
                  <TableHead>سعر الطفل</TableHead>
                  <TableHead>المدة (بالغ / طفل)</TableHead>
                  <TableHead><span className="sr-only">إجراءات</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.data.map(branch => (
                  <TableRow key={branch.id}>
                    <TableCell><p className="font-medium">{branch.name}</p><p className="max-w-xs truncate text-xs text-muted-foreground">{branch.location}</p></TableCell>
                    <TableCell><Ltr>{formatKwd(branch.adultPrice)}</Ltr></TableCell>
                    <TableCell><Ltr>{formatKwd(branch.childPrice)}</Ltr></TableCell>
                    <TableCell className="text-muted-foreground">{formatDuration(branch.adultDurationMinutes)} / {formatDuration(branch.childDurationMinutes)}</TableCell>
                    <TableCell className="text-end"><Button variant="ghost" size="sm" onClick={() => openDialog(branch)}><Pencil aria-hidden />تعديل</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ul className="divide-y divide-border md:hidden">
              {branches.data.map(branch => (
                <li key={branch.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{branch.name}</p>
                    <p className="text-xs text-muted-foreground">{branch.location}</p>
                    <p className="mt-2 text-sm">بالغ <Ltr>{formatKwd(branch.adultPrice)}</Ltr>، طفل <Ltr>{formatKwd(branch.childPrice)}</Ltr></p>
                  </div>
                  <Button variant="outline" size="icon-sm" aria-label={`تعديل ${branch.name}`} onClick={() => openDialog(branch)}><Pencil /></Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <BranchDialog branch={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}

export default function BranchesPage() {
  return <AdminOnly><BranchesScreen /></AdminOnly>;
}
