"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarClock, CalendarDays, LogOut, Menu, Scissors, Store, UserRound, Users, type LucideIcon } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Ltr } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyEmployee } from "@/lib/api/hooks";
import { useLogout, useSession } from "@/lib/api/session";
import type { Account } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const adminNav: NavItem[] = [
  { href: "/bookings", label: "الحجوزات", icon: CalendarDays },
  { href: "/clients", label: "العملاء", icon: Users },
  { href: "/employees", label: "الحلاقون", icon: Scissors },
  { href: "/branches", label: "الفروع", icon: Store },
];

const employeeNav: NavItem[] = [
  { href: "/bookings", label: "حجوزاتي", icon: CalendarDays },
  { href: "/schedule", label: "جدولي", icon: CalendarClock },
  { href: "/profile", label: "ملفي", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map(item => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-[1.125rem]" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function AccountFooter({ account }: { account: Account }) {
  const logout = useLogout();
  const me = useMyEmployee(account.role === "employee");
  const name = account.role === "admin" ? "المدير" : me.data?.displayName;
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center gap-3 px-1">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground" aria-hidden>
          {account.role === "employee" && name ? name.trim().charAt(0) : <UserRound className="size-4" />}
        </span>
        <div className="min-w-0 text-sm leading-tight">
          <p className="truncate font-medium">{name ?? <Skeleton className="h-4 w-20" />}</p>
          <Ltr className="text-xs text-muted-foreground">{account.phone}</Ltr>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut aria-hidden />
          خروج
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const account = session.data?.account;

  useEffect(() => {
    if (session.data === null) router.replace(pathname && pathname !== "/" ? `/login?next=${encodeURIComponent(pathname)}` : "/login");
  }, [session.data, pathname, router]);

  if (!account) {
    return (
      <div className="grid min-h-dvh place-items-center" aria-busy="true">
        {session.isError ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm">تعذر الاتصال بالخادم.</p>
            <Button variant="outline" onClick={() => session.refetch()}>إعادة المحاولة</Button>
          </div>
        ) : <Wordmark className="animate-pulse opacity-60" />}
      </div>
    );
  }

  const items = account.role === "admin" ? adminNav : employeeNav;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-e border-border bg-sidebar px-4 py-5 text-sidebar-foreground lg:flex" data-print-hidden>
        <Link href="/bookings" className="px-2"><Wordmark /></Link>
        <nav aria-label="القائمة الرئيسية" className="flex-1"><NavLinks items={items} pathname={pathname} /></nav>
        <AccountFooter account={account} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden" data-print-hidden>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="القائمة"><Menu /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-72 flex-col gap-6 bg-sidebar p-5">
              <SheetTitle className="sr-only">القائمة</SheetTitle>
              <SheetDescription className="sr-only">التنقل والحساب</SheetDescription>
              <Wordmark className="self-start px-2" />
              <nav aria-label="القائمة الرئيسية" className="flex-1"><NavLinks items={items} pathname={pathname} onNavigate={() => setMenuOpen(false)} /></nav>
              <AccountFooter account={account} />
            </SheetContent>
          </Sheet>
          <Link href="/bookings"><Wordmark /></Link>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">{children}</main>

        <nav aria-label="التنقل السريع" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" data-print-hidden>
          <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
            {items.map(item => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2 text-[0.6875rem] text-muted-foreground", active && "text-primary")}>
                    <item.icon className="size-5" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

/** Shows a clear message instead of an administrator page when an employee opens its address directly. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.data?.account.role !== "admin") {
    return <p className="py-16 text-center text-sm text-muted-foreground">هذه الصفحة متاحة للمدير فقط.</p>;
  }
  return children;
}
