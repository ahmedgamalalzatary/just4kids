"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronLeft, KeyRound } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { EmployeeAvatar } from "@/components/avatar";
import { Field, FormAlert } from "@/components/field";
import { ErrorState, LoadingRows, PageHeader } from "@/components/page";
import { ExceptionsCard, WeeklyScheduleEditor } from "@/components/schedule";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEmployee, useRemoveEmployeePhoto, useResetEmployeePassword, useSchedule, useUpdateEmployee, useUploadEmployeePhoto } from "@/lib/api/hooks";
import type { Employee } from "@/lib/api/types";
import { employeeEditFormSchema, passwordResetFormSchema } from "@/lib/forms";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

function PhotoCard({ employee }: { employee: Employee }) {
  const upload = useUploadEmployeePhoto();
  const remove = useRemoveEmployeePhoto();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = upload.isPending || remove.isPending;

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) { setError("Unsupported photo format. Use JPEG, PNG or WEBP."); return; }
    if (file.size > PHOTO_MAX_BYTES) { setError("Photo exceeds 2 MB."); return; }
    setError(null);
    upload.mutate({ id: employee.id, file }, { onSuccess: () => toast.success("Barber photo saved") });
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Barber photo</CardTitle>
          <CardDescription>The photo is cropped to a square. Reservations show the current photo.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <EmployeeAvatar employeeId={employee.id} name={employee.displayName} version={employee.photoUpdatedAt} className="size-20" />
        <div className="flex min-w-0 flex-col gap-2">
          <input ref={input} type="file" accept={PHOTO_TYPES.join(",")} className="sr-only" onChange={event => { choose(event.target.files?.[0]); event.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={pending}>{upload.isPending ? "Uploading..." : "Upload or replace photo"}</Button>
            <Button type="button" variant="ghost" onClick={() => { setError(null); remove.mutate({ id: employee.id }, { onSuccess: () => toast.success("Photo deleted") }); }} disabled={pending}>Delete photo</Button>
          </div>
          <p className="text-xs text-muted-foreground">JPEG, PNG or WEBP, up to 2 MB.</p>
          {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
          <FormAlert error={upload.error ?? remove.error} />
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileCard({ employee }: { employee: Employee }) {
  const update = useUpdateEmployee();
  const form = useForm({
    resolver: zodResolver(employeeEditFormSchema),
    values: { displayName: employee.displayName, phone: employee.phone, enabled: employee.enabled, accessUntil: employee.accessUntil ?? "" },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(values => {
    // Send only what changed, so an unchanged phone is never rewritten.
    const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => (employee[key as keyof typeof values] ?? "") !== value));
    if (Object.keys(changes).length === 0) return;
    update.mutate({ id: employee.id, ...changes }, { onSuccess: () => toast.success("Barber details saved") });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.displayName?.message}><Input {...form.register("displayName")} /></Field>
          <Field label="Phone number" error={errors.phone?.message} hint="The barber uses this to log in."><Input {...form.register("phone")} type="tel" dir="ltr" inputMode="tel" className="text-start" /></Field>
          <div className="flex items-center gap-3 self-end pb-2">
            <Controller control={form.control} name="enabled" render={({ field }) => <Switch id="employee-enabled" checked={field.value} onCheckedChange={field.onChange} />} />
            <Label htmlFor="employee-enabled">Account enabled</Label>
          </div>
          <Field label="Account expiry date" error={errors.accessUntil?.message} hint="The barber cannot log in after this date. Leave blank for no expiry.">
            <Input {...form.register("accessUntil")} type="date" dir="ltr" className="text-start" />
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">Stopping the account prevents login and hides the barber from new reservations.</p>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <FormAlert error={update.error} />
            <Button type="submit" className="w-fit" disabled={update.isPending || !form.formState.isDirty}>Save changes</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ResetPasswordDialog({ employee, open, onOpenChange }: { employee: Employee; open: boolean; onOpenChange: (open: boolean) => void }) {
  const reset = useResetEmployeePassword();
  const form = useForm({ resolver: zodResolver(passwordResetFormSchema), defaultValues: { password: "", confirm: "" } });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(values => reset.mutate({ id: employee.id, password: values.password }, {
    onSuccess: () => { toast.success("Password changed"); onOpenChange(false); form.reset(); },
  }));
  return (
    <Dialog open={open} onOpenChange={value => { if (!value) { reset.reset(); form.reset(); } onOpenChange(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New password for {employee.displayName}</DialogTitle>
          <DialogDescription>The barber is logged out on all devices and must use the new password.</DialogDescription>
        </DialogHeader>
        <form id="reset-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="New password" error={errors.password?.message} hint="At least 8 characters."><Input {...form.register("password")} type="text" dir="ltr" autoComplete="new-password" className="text-start" /></Field>
          <Field label="Confirm password" error={errors.confirm?.message}><Input {...form.register("confirm")} type="text" dir="ltr" autoComplete="new-password" className="text-start" /></Field>
        </form>
        <FormAlert error={reset.error} />
        <DialogFooter><Button type="submit" form="reset-form" disabled={reset.isPending}>Change password</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeScreen({ id }: { id: string }) {
  const employee = useEmployee(id);
  const schedule = useSchedule(id);
  const [resetOpen, setResetOpen] = useState(false);

  const back = <Link href="/employees" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" aria-hidden />Barbers</Link>;
  if (employee.isPending) return <>{back}<LoadingRows /></>;
  if (employee.isError) return <>{back}<ErrorState error={employee.error} onRetry={() => employee.refetch()} /></>;

  return (
    <>
      <PageHeader
        back={back}
        title={<span className="flex flex-wrap items-center gap-3">{employee.data.displayName}{employee.data.enabled ? null : <Badge variant="muted">Stopped</Badge>}</span>}
        actions={<Button variant="outline" onClick={() => setResetOpen(true)}><KeyRound aria-hidden />Change password</Button>}
      />
      <div className="flex flex-col gap-6">
        <PhotoCard employee={employee.data} />
        <ProfileCard employee={employee.data} />
        {schedule.isPending ? <LoadingRows rows={3} /> : schedule.isError ? <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} /> : (
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-start">
            <WeeklyScheduleEditor key={JSON.stringify(schedule.data.days)} employeeId={id} schedule={schedule.data} />
            <ExceptionsCard employeeId={id} schedule={schedule.data} editable />
          </div>
        )}
      </div>
      <ResetPasswordDialog employee={employee.data} open={resetOpen} onOpenChange={setResetOpen} />
    </>
  );
}

export default function EmployeePage() {
  const { id } = useParams<{ id: string }>();
  return <AdminOnly><EmployeeScreen id={id} /></AdminOnly>;
}
