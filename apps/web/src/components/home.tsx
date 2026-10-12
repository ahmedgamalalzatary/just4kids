"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, CalendarPlus, ChartPie, Coins, Route, Scissors, Wallet, type LucideIcon } from "lucide-react";
import { EmployeeAvatar } from "@/components/avatar";
import { VisitCard } from "@/components/day-bookings";
import { EmptyState, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDayBookings, useEmployees, useMyEmployee } from "@/lib/api/hooks";
import type { Booking, Employee } from "@/lib/api/types";
import { currentOrNext, daySummary } from "@/lib/day";
import { formatDate, formatWindow, kuwaitNow } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Kuwait date and time, refreshed every minute so "now" and "next" stay current while the page is open. */
function useKuwaitClock() {
  const [now, setNow] = useState(() => kuwaitNow());
  useEffect(() => {
    const timer = setInterval(() => setNow(kuwaitNow()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function BarberCard({ employee, bookings, time }: { employee: Employee; bookings: Booking[]; time: string }) {
  const summary = daySummary(bookings);
  const focus = currentOrNext(bookings, time);
  return (
    <Card className={cn("flex flex-col border-primary/35", !employee.enabled && "opacity-70")}>
      <div className="relative p-3 pb-0">
        <EmployeeAvatar employeeId={employee.id} name={employee.displayName} version={employee.photoUpdatedAt} className="aspect-[4/3] size-auto w-full rounded-lg text-5xl" />
        <span className={cn("absolute start-5 top-5 rounded-full px-2.5 py-0.5 text-xs font-semibold", employee.enabled ? "bg-status-completed text-white dark:text-background" : "bg-muted text-muted-foreground")}>
          {employee.enabled ? "يعمل" : "موقوف"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-lg font-semibold">{employee.displayName}</p>
          <p className="text-xs text-muted-foreground">{employee.branch ? employee.branch.name : "بدون فرع"}</p>
        </div>
        <div className="rounded-md bg-muted/70 px-3 py-2 text-sm">
          {focus ? (
            <>
              <span className="font-medium">{focus.kind === "current" ? "الآن: " : "التالي: "}</span>
              <span data-numeric>{formatWindow(focus.booking.startTime, focus.booking.endTime)}</span>
              <span className="block truncate text-muted-foreground">{focus.booking.client.name}، {focus.booking.address.area}</span>
            </>
          ) : <span className="text-muted-foreground">لا يوجد موعد قادم اليوم.</span>}
        </div>
        <p className="text-xs text-muted-foreground">حجوزات اليوم: <span className="font-semibold text-foreground" data-numeric>{summary.active}</span> · مفتوحة: <span className="font-semibold text-foreground" data-numeric>{summary.open}</span></p>
        <div className="mt-auto flex flex-col gap-2">
          {employee.enabled ? <Button asChild variant="sun"><Link href={`/bookings/new?barber=${employee.id}`}><CalendarPlus aria-hidden />حجز لهذا الحلاق</Link></Button> : null}
          <Button asChild variant="outline"><Link href={`/bookings?barber=${employee.id}`}>مواعيد اليوم</Link></Button>
        </div>
      </div>
    </Card>
  );
}

function Tile({ href, icon: Icon, title, children }: { href: string; icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <Link href={href} className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent">
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-linear-135 from-sun to-sun-end text-sun-foreground"><Icon className="size-5" aria-hidden /></span>
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{children}</p>
    </Link>
  );
}

export function AdminHome() {
  const now = useKuwaitClock();
  const employees = useEmployees();
  const day = useDayBookings(now.date);
  const bookings = day.data?.bookings ?? [];
  const summary = daySummary(bookings);
  const ordered = [...(employees.data ?? [])].sort((a, b) => Number(b.enabled) - Number(a.enabled));

  return (
    <>
      <PageHeader title="لوحة التحكم" description={formatDate(now.date)} actions={<Button asChild variant="outline"><Link href="/bookings"><Route aria-hidden />توجيه الحجز</Link></Button>} />
      <section aria-labelledby="barbers-heading">
        <h2 id="barbers-heading" className="sr-only">الحلاقون</h2>
        {employees.isPending || day.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-96 rounded-xl" />)}</div>
        ) : employees.isError ? <Card><ErrorState error={employees.error} onRetry={() => employees.refetch()} /></Card>
          : day.isError ? <Card><ErrorState error={day.error} onRetry={() => day.refetch()} /></Card>
          : ordered.length === 0 ? (
            <Card><EmptyState icon={Scissors} title="لا يوجد حلاقون بعد" description="أضف الحلاقين لتظهر بطاقاتهم هنا." action={<Button asChild><Link href="/employees">الحلاقون</Link></Button>} /></Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ordered.map(employee => <BarberCard key={employee.id} employee={employee} bookings={bookings.filter(booking => booking.employeeId === employee.id)} time={now.time} />)}
            </div>
          )}
      </section>
      <section aria-labelledby="tiles-heading" className="mt-8">
        <h2 id="tiles-heading" className="mb-3 text-sm font-medium text-muted-foreground">اختصارات</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile href="/bookings" icon={Route} title="توجيه الحجز">{day.data ? `${summary.active} حجز اليوم` : "مواعيد اليوم"}</Tile>
          <Tile href="/reports/barbers" icon={Scissors} title="شغل الحلاقين">الحجوزات والتحصيل لكل حلاق</Tile>
          <Tile href="/salon" icon={Coins} title="شغل الصالون">إدخال شغل الصالون اليومي</Tile>
          <Tile href="/reports/salon" icon={ChartPie} title="تقرير شغل الصالون">الأيام والإجماليات حسب الفترة</Tile>
        </div>
      </section>
    </>
  );
}

function BigCard({ icon: Icon, title, value, note, action }: { icon: LucideIcon; title: string; value: ReactNode; note: ReactNode; action: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-linear-135 from-sun to-sun-end text-sun-foreground"><Icon className="size-6" aria-hidden /></span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div>
        <p className="text-3xl font-bold">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{note}</p>
      </div>
      {action}
    </Card>
  );
}

export function BarberHome() {
  const now = useKuwaitClock();
  const me = useMyEmployee();
  const day = useDayBookings(now.date);
  const bookings = day.data?.bookings ?? [];
  const summary = daySummary(bookings);
  const visible = bookings.filter(booking => booking.visitStatus !== "cancelled");

  return (
    <>
      <header className="mb-6 flex items-center gap-3">
        {me.data ? <EmployeeAvatar employeeId={me.data.id} name={me.data.displayName} version={me.data.photoUpdatedAt} className="size-12" /> : <Skeleton className="size-12 rounded-full" />}
        <div>
          <h1 className="text-2xl font-semibold">{me.data ? `أهلاً، ${me.data.displayName}` : <Skeleton className="h-7 w-32" />}</h1>
          <p className="text-sm text-muted-foreground">{formatDate(now.date)}</p>
        </div>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <BigCard icon={CalendarDays} title="حجوزات اليوم" value={day.data ? <span data-numeric>{summary.open}</span> : <Skeleton className="h-9 w-12" />}
          note={day.data ? <>زيارات مفتوحة من أصل <span data-numeric>{summary.active}</span> اليوم</> : "…"}
          action={<Button asChild variant="sun" size="lg"><a href="#today">عرض زيارات اليوم</a></Button>} />
        <BigCard icon={Wallet} title="إيراد اليوم" value={day.data ? <Ltr>{formatKwd(summary.collected)}</Ltr> : <Skeleton className="h-9 w-28" />}
          note="المبالغ المدفوعة لزيارات اليوم"
          action={<Button asChild variant="sun" size="lg"><Link href="/reports">تقاريري</Link></Button>} />
      </div>
      <section id="today" aria-labelledby="today-heading" className="mt-8 scroll-mt-20">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="today-heading" className="text-lg font-semibold">زيارات اليوم</h2>
          <Button asChild variant="ghost" size="sm"><Link href="/bookings">كل الأيام</Link></Button>
        </div>
        {day.isPending ? <Card><LoadingRows rows={3} /></Card> : day.isError ? <Card><ErrorState error={day.error} onRetry={() => day.refetch()} /></Card>
          : visible.length === 0 ? <Card><EmptyState icon={CalendarDays} title="لا توجد زيارات اليوم" description="ستظهر هنا الزيارات التي يسندها إليك المدير." /></Card>
          : <div className="flex flex-col gap-3">{visible.map(booking => <VisitCard key={booking.id} booking={booking} />)}</div>}
      </section>
    </>
  );
}
