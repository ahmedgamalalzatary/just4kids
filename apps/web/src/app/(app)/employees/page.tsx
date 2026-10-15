"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronRight, Plus, Scissors } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { EmployeeAvatar } from "@/components/avatar";
import { Field, FormAlert } from "@/components/field";
import { EmptyState, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateEmployee, useEmployees } from "@/lib/api/hooks";
import { employeeCreateFormSchema } from "@/lib/forms";

function CreateEmployeeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const create = useCreateEmployee();
  const form = useForm({ resolver: zodResolver(employeeCreateFormSchema), defaultValues: { displayName: "", phone: "", password: "" } });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(values => create.mutate({ displayName: values.displayName, phone: values.phone, password: values.password }, {
    onSuccess: employee => { toast.success("Barber added"); onOpenChange(false); form.reset(); router.push(`/employees/${employee.id}`); },
  }));

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) create.reset(); onOpenChange(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add barber</DialogTitle>
          <DialogDescription>The barber logs in with this phone and password. Give them the password directly.</DialogDescription>
        </DialogHeader>
        <form id="employee-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="Name" error={errors.displayName?.message}><Input {...form.register("displayName")} /></Field>
          <Field label="Phone number" error={errors.phone?.message} hint="International format, e.g. +96550000000"><Input {...form.register("phone")} type="tel" dir="ltr" inputMode="tel" className="text-start" placeholder="+965" /></Field>
          <Field label="Password" error={errors.password?.message} hint="At least 8 characters."><Input {...form.register("password")} type="text" dir="ltr" autoComplete="new-password" className="text-start" /></Field>
        </form>
        <FormAlert error={create.error} />
        <DialogFooter><Button type="submit" form="employee-form" disabled={create.isPending}>Add barber</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeesScreen() {
  const employees = useEmployees();
  const [open, setOpen] = useState(false);
  const addButton = <Button onClick={() => setOpen(true)}><Plus aria-hidden />Add barber</Button>;

  return (
    <>
      <PageHeader title="Barbers" description="Barber accounts and working hours." actions={addButton} />
      <Card>
        {employees.isPending ? <LoadingRows /> : employees.isError ? <ErrorState error={employees.error} onRetry={() => employees.refetch()} /> : employees.data.length === 0 ? (
          <EmptyState icon={Scissors} title="No barbers yet" description="Add a barber and set their working hours to enable bookings." />
        ) : (
          <ul className="divide-y divide-border">
            {employees.data.map(employee => (
              <li key={employee.id}>
                <Link href={`/employees/${employee.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50">
                  <EmployeeAvatar employeeId={employee.id} name={employee.displayName} version={employee.photoUpdatedAt} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {employee.displayName}
                      {employee.enabled ? null : <Badge variant="muted">Stopped</Badge>}
                    </p>
                    <p className="text-sm text-muted-foreground"><Ltr>{employee.phone}</Ltr></p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CreateEmployeeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default function EmployeesPage() {
  return <AdminOnly><EmployeesScreen /></AdminOnly>;
}
