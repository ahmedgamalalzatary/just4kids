"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Field, FormAlert } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin } from "@/lib/api/session";
import type { Session } from "@/lib/api/types";
import { phoneField } from "@/lib/forms";

const schema = z.object({ phone: phoneField, password: z.string().min(1, "اكتب كلمة المرور").max(128) });

export function LoginForm({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const login = useLogin();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { phone: "", password: "" } });
  const submit = form.handleSubmit(values => login.mutate(values, { onSuccess: session => onSuccess(session) }));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label="رقم الهاتف" error={form.formState.errors.phone?.message} hint="بالصيغة الدولية، مثل ‎+96550000000">
        <Input {...form.register("phone")} type="tel" dir="ltr" inputMode="tel" autoComplete="username" placeholder="+965" className="text-start" />
      </Field>
      <Field label="كلمة المرور" error={form.formState.errors.password?.message}>
        <Input {...form.register("password")} type="password" dir="ltr" autoComplete="current-password" />
      </Field>
      <FormAlert error={login.error} />
      <Button type="submit" size="lg" disabled={login.isPending}>
        {login.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        تسجيل الدخول
      </Button>
    </form>
  );
}
