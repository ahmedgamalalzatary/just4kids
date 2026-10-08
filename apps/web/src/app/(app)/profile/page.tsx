"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Field, FormAlert } from "@/components/field";
import { Detail, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMyEmployee, useUpdateMyName } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Employee } from "@/lib/api/types";
import { requiredText } from "@/lib/forms";

const schema = z.object({ displayName: requiredText(120, "اكتب اسمك") });

function NameForm({ employee }: { employee: Employee }) {
  const update = useUpdateMyName();
  const form = useForm({ resolver: zodResolver(schema), values: { displayName: employee.displayName } });
  const submit = form.handleSubmit(values => update.mutate(values, { onSuccess: () => toast.success("تم حفظ اسمك") }));
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="الاسم الظاهر" error={form.formState.errors.displayName?.message} hint="يظهر للمدير وللعملاء عند اختيار الحلاق."><Input {...form.register("displayName")} /></Field>
      <FormAlert error={update.error} />
      <Button type="submit" className="w-fit" disabled={update.isPending || !form.formState.isDirty}>حفظ الاسم</Button>
    </form>
  );
}

export default function ProfilePage() {
  const session = useSession();
  const isEmployee = session.data?.account.role === "employee";
  const me = useMyEmployee(isEmployee);

  if (!isEmployee) return <p className="py-16 text-center text-sm text-muted-foreground">هذه الصفحة خاصة بالحلاقين.</p>;
  return (
    <>
      <PageHeader title="ملفي" />
      {me.isPending ? <LoadingRows rows={3} /> : me.isError ? <ErrorState error={me.error} onRetry={() => me.refetch()} /> : (
        <div className="grid max-w-3xl gap-6">
          <Card>
            <CardHeader><CardTitle>اسمك</CardTitle></CardHeader>
            <CardContent><NameForm employee={me.data} /></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>بيانات يديرها المدير</CardTitle>
                <CardDescription>لتغيير رقم الهاتف أو الفرع أو كلمة المرور تواصل مع المدير.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="رقم الهاتف"><Ltr>{me.data.phone}</Ltr></Detail>
                <Detail label="الفرع">{me.data.branch.name}<span className="block text-xs text-muted-foreground">{me.data.branch.location}</span></Detail>
              </dl>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
