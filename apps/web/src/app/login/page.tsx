"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSession } from "@/lib/api/session";

/** Only same-site paths are accepted as a return address after signing in. */
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/bookings";
}

function LoginScreen() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const session = useSession();

  useEffect(() => {
    if (session.data) router.replace(next);
  }, [session.data, next, router]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,34rem)]">
      <main className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between">
          <Wordmark />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-semibold">تسجيل الدخول</h1>
          <p className="mt-2 mb-8 text-sm text-muted-foreground">للمدير والحلاقين. استخدم رقم هاتفك وكلمة المرور التي أعطاك إياها المدير.</p>
          <LoginForm onSuccess={() => router.replace(next)} />
        </div>
      </main>
      <aside aria-hidden className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-end lg:p-12">
        <span className="absolute -top-24 -start-24 grid size-[26rem] -rotate-12 place-items-center rounded-[5rem] bg-sun text-[18rem] leading-none font-bold text-sun-foreground">4</span>
        <p className="relative max-w-xs text-2xl leading-snug font-medium text-balance">حلاقة في البيت، للكبار والصغار.</p>
      </aside>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginScreen /></Suspense>;
}
