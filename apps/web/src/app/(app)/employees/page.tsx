"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronLeft, Plus, Scissors } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { BranchSelect } from "@/components/branch-select";
import { Field, FormAlert } from "@/components/field";
import { EmptyState, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useBranches, useCreateEmployee, useEmployees } from "@/lib/api/hooks";
import type { Branch } from "@/lib/api/types";
import { employeeCreateFormSchema } from "@/lib/forms";

function CreateEmployeeDialog({ branches, open, onOpenChange }: { branches: Branch[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const create = useCreateEmployee();
  const form = useForm({ resolver: zodResolver(employeeCreateFormSchema), defaultValues: { displayName: "", phone: "", branchId: "", password: "" } });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(values => create.mutate(values, {
    onSuccess: employee => { toast.success("تمت إضافة الحلاق"); onOpenChange(false); form.reset(); router.push(`/employees/${employee.id}`); },
  }));

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) create.reset(); onOpenChange(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة حلاق</DialogTitle>
          <DialogDescription>يدخل الحلاق برقم هاتفه وكلمة المرور هذه. أعطه كلمة المرور بنفسك.</DialogDescription>
        </DialogHeader>
        <form id="employee-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="الاسم" error={errors.displayName?.message}><Input {...form.register("displayName")} /></Field>
          <Field label="رقم الهاتف" error={errors.phone?.message} hint="بالصيغة الدولية، مثل ‎+96550000000"><Input {...form.register("phone")} type="tel" dir="ltr" inputMode="tel" className="text-start" placeholder="+965" /></Field>
          <Field label="الفرع" error={errors.branchId?.message}>
            <Controller control={form.control} name="branchId" render={({ field }) => <BranchSelect branches={branches} value={field.value} onChange={field.onChange} />} />
          </Field>
          <Field label="كلمة المرور" error={errors.password?.message} hint="8 أحرف على الأقل."><Input {...form.register("password")} type="text" dir="ltr" autoComplete="new-password" className="text-start" /></Field>
        </form>
        <FormAlert error={create.error} />
        <DialogFooter><Button type="submit" form="employee-form" disabled={create.isPending}>إضافة الحلاق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeesScreen() {
  const employees = useEmployees();
  const branches = useBranches();
  const [open, setOpen] = useState(false);
  const noBranches = branches.data?.length === 0;
  const addButton = <Button onClick={() => setOpen(true)} disabled={!branches.data || noBranches}><Plus aria-hidden />إضافة حلاق</Button>;

  return (
    <>
      <PageHeader title="الحلاقون" description="حسابات الحلاقين وفروعهم وساعات عملهم." actions={addButton} />
      {noBranches ? <p className="mb-4 text-sm text-muted-foreground">أضف فرعاً أولاً من <Link href="/branches" className="text-primary underline-offset-4 hover:underline">صفحة الفروع</Link>، ثم أضف الحلاقين.</p> : null}
      <Card>
        {employees.isPending ? <LoadingRows /> : employees.isError ? <ErrorState error={employees.error} onRetry={() => employees.refetch()} /> : employees.data.length === 0 ? (
          <EmptyState icon={Scissors} title="لا يوجد حلاقون بعد" description="أضف حلاقاً ليظهر في الحجوزات بعد تحديد ساعات عمله." />
        ) : (
          <ul className="divide-y divide-border">
            {employees.data.map(employee => (
              <li key={employee.id}>
                <Link href={`/employees/${employee.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-semibold text-secondary-foreground" aria-hidden>{employee.displayName.charAt(0)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {employee.displayName}
                      {employee.enabled ? null : <Badge variant="muted">موقوف</Badge>}
                    </p>
                    <p className="text-sm text-muted-foreground">{employee.branch.name}، <Ltr>{employee.phone}</Ltr></p>
                  </div>
                  <ChevronLeft className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {branches.data ? <CreateEmployeeDialog branches={branches.data} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

export default function EmployeesPage() {
  return <AdminOnly><EmployeesScreen /></AdminOnly>;
}
