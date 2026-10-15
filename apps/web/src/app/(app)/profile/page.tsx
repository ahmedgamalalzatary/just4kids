"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { EmployeeAvatar } from "@/components/avatar";
import { Field, FormAlert } from "@/components/field";
import { Detail, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMyEmployee, useUpdateMyName } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Employee } from "@/lib/api/types";
import { requiredText } from "@/lib/forms";

const schema = z.object({ displayName: requiredText(120, "Enter your name") });

function NameForm({ employee }: { employee: Employee }) {
  const update = useUpdateMyName();
  const form = useForm({ resolver: zodResolver(schema), values: { displayName: employee.displayName } });
  const submit = form.handleSubmit(values => update.mutate(values, { onSuccess: () => toast.success("Your name was saved") }));
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Display name" error={form.formState.errors.displayName?.message} hint="Shown to administrators and clients when choosing a barber."><Input {...form.register("displayName")} /></Field>
      <FormAlert error={update.error} />
      <Button type="submit" className="w-fit" disabled={update.isPending || !form.formState.isDirty}>Save name</Button>
    </form>
  );
}

export default function ProfilePage() {
  const session = useSession();
  const isEmployee = session.data?.account.role === "employee";
  const me = useMyEmployee(isEmployee);

  if (!isEmployee) return <p className="py-16 text-center text-sm text-muted-foreground">This page is for barbers.</p>;
  return (
    <>
      <PageHeader title="My profile" />
      {me.isPending ? <LoadingRows rows={3} /> : me.isError ? <ErrorState error={me.error} onRetry={() => me.refetch()} /> : (
        <div className="grid max-w-3xl gap-6">
          <Card>
            <CardHeader><CardTitle>Your name</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-3">
                <EmployeeAvatar employeeId={me.data.id} name={me.data.displayName} version={me.data.photoUpdatedAt} className="size-16" />
                <p className="text-sm text-muted-foreground">Your account photo is managed by the administrator.</p>
              </div>
              <NameForm employee={me.data} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Managed by the administrator</CardTitle>
                <CardDescription>Contact the administrator to change your phone number, branch or password.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Phone number"><Ltr>{me.data.phone}</Ltr></Detail>
              </dl>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
