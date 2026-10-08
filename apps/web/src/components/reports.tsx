"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type { VisitStatus } from "@just4kids/contracts";
import { Field } from "@/components/field";
import { Detail, Ltr } from "@/components/page";
import { visitStatusLabels } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBranches, useEmployees } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { BranchReport } from "@/lib/api/types";
import { formatDate, formatDuration } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { emptyReportFilters, rangeError, readReportFilters, reportSearch, type ReportFilters } from "@/lib/reports";

export const dateBasisLabels = { visit_date: "تاريخ الزيارة", created_date: "تاريخ إنشاء الحجز" } as const;
export const sourceLabels = { manual: "حجز يدوي", ai: "عبر واتساب" } as const;

/** The current report filters from the address; branch and barber filters apply to the administrator only. */
export function useReportFilters() {
  const params = useSearchParams();
  const isAdmin = useSession().data?.account.role === "admin";
  const filters = readReportFilters(params, isAdmin);
  return { filters, isAdmin, search: reportSearch(filters) };
}

/** A link to the reservation records behind a report row, keeping the current filters. */
export function reservationsHref(filters: ReportFilters, changes: Partial<ReportFilters>) {
  return `/reports${reportSearch({ ...filters, ...changes })}`;
}

const tabs = [
  { href: "/reports", label: "الحجوزات" },
  { href: "/reports/haircuts", label: "الحلاقات" },
  { href: "/reports/barbers", label: "الحلاقون", employeeLabel: "أدائي" },
  { href: "/reports/branches", label: "الفروع" },
];

export function reportTitle(pathname: string, isAdmin: boolean) {
  const tab = tabs.find(item => item.href === pathname) ?? tabs[0]!;
  return `تقرير ${isAdmin ? tab.label : tab.employeeLabel ?? tab.label}`;
}

export function ReportTabs() {
  const pathname = usePathname();
  const { isAdmin, search } = useReportFilters();
  return (
    <Tabs value={pathname} dir="rtl" activationMode="manual" data-print-hidden>
      <TabsList className="w-full sm:w-fit">
        {tabs.map(tab => (
          <TabsTrigger key={tab.href} value={tab.href} asChild>
            <Link href={`${tab.href}${search}`}>{isAdmin ? tab.label : tab.employeeLabel ?? tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

const ALL = "all";

function OptionSelect({ value, onChange, all, options, id, ...aria }: {
  value: string; onChange: (value: string) => void; all?: string; options: { value: string; label: string }[]; id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string;
}) {
  return (
    <Select value={value || ALL} onValueChange={next => onChange(next === ALL ? "" : next)}>
      <SelectTrigger id={id} className="w-full" {...aria}><SelectValue /></SelectTrigger>
      <SelectContent>
        {all ? <SelectItem value={ALL}>{all}</SelectItem> : null}
        {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function FilterForm({ filters, isAdmin }: { filters: ReportFilters; isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState(filters);
  const branches = useBranches(isAdmin);
  const employees = useEmployees(isAdmin);
  const error = rangeError(draft.from, draft.to);
  const set = <Key extends keyof ReportFilters>(key: Key) => (value: ReportFilters[Key]) => setDraft(current => ({ ...current, [key]: value }));
  const apply = (next: ReportFilters) => router.replace(`${pathname}${reportSearch({ ...next, q: next.q.trim() })}`, { scroll: false });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!error) apply(draft);
  };

  return (
    <Card data-print-hidden>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4" aria-label="مرشحات التقرير">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Field label="أساس التاريخ" className="col-span-2 lg:col-span-1">
              <OptionSelect value={draft.dateBasis} onChange={value => set("dateBasis")(value === "created_date" ? "created_date" : "visit_date")}
                options={[{ value: "visit_date", label: dateBasisLabels.visit_date }, { value: "created_date", label: dateBasisLabels.created_date }]} />
            </Field>
            <Field label="من تاريخ" optional>
              <Input type="date" value={draft.from} onChange={event => set("from")(event.target.value)} />
            </Field>
            <Field label="إلى تاريخ" optional error={error}>
              <Input type="date" value={draft.to} onChange={event => set("to")(event.target.value)} />
            </Field>
            <Field label="بحث" optional className="col-span-2 lg:col-span-1">
              <Input type="search" value={draft.q} maxLength={120} onChange={event => set("q")(event.target.value)} placeholder="المرجع أو اسم العميل أو هاتفه" />
            </Field>
            {isAdmin ? (
              <>
                <Field label="الفرع">
                  <OptionSelect value={draft.branchId} onChange={set("branchId")} all="كل الفروع" options={(branches.data ?? []).map(branch => ({ value: branch.id, label: branch.name }))} />
                </Field>
                <Field label="الحلاق">
                  <OptionSelect value={draft.employeeId} onChange={set("employeeId")} all="كل الحلاقين" options={(employees.data ?? []).map(employee => ({ value: employee.id, label: employee.displayName }))} />
                </Field>
              </>
            ) : null}
            <Field label="حالة الزيارة">
              <OptionSelect value={draft.status} onChange={value => set("status")(value as VisitStatus | "")} all="كل الحالات"
                options={Object.entries(visitStatusLabels).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="المصدر">
              <OptionSelect value={draft.source} onChange={value => set("source")(value as ReportFilters["source"])} all="كل المصادر"
                options={Object.entries(sourceLabels).map(([value, label]) => ({ value, label }))} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={Boolean(error)}>عرض التقرير</Button>
            <Button type="button" variant="ghost" onClick={() => { setDraft(emptyReportFilters); apply(emptyReportFilters); }}>مسح المرشحات</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Filters edited as a draft and applied to the address; the form restarts whenever the address changes. */
export function ReportFilterBar() {
  const { filters, isAdmin, search } = useReportFilters();
  return <FilterForm key={search} filters={filters} isAdmin={isAdmin} />;
}

/** The report name, date basis, and applied filters, shown on screen and on paper. */
export function ReportScope() {
  const pathname = usePathname();
  const { filters, isAdmin } = useReportFilters();
  const branches = useBranches(isAdmin);
  const employees = useEmployees(isAdmin);
  const range = filters.from && filters.to ? `من ${formatDate(filters.from)} إلى ${formatDate(filters.to)}`
    : filters.from ? `من ${formatDate(filters.from)}` : filters.to ? `حتى ${formatDate(filters.to)}` : "كل التواريخ";
  const applied = [
    filters.branchId ? `الفرع: ${branches.data?.find(branch => branch.id === filters.branchId)?.name ?? "…"}` : null,
    filters.employeeId ? `الحلاق: ${employees.data?.find(employee => employee.id === filters.employeeId)?.displayName ?? "…"}` : null,
    filters.status ? `الحالة: ${visitStatusLabels[filters.status]}` : null,
    filters.source ? `المصدر: ${sourceLabels[filters.source]}` : null,
    filters.q ? `بحث: «${filters.q}»` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">{reportTitle(pathname, isAdmin)}</h2>
      <p className="text-sm text-muted-foreground">
        حسب {dateBasisLabels[filters.dateBasis]}، {range} (بتوقيت الكويت).
        {applied.length ? ` ${applied.join("، ")}.` : ""}
        {isAdmin ? "" : " زياراتك المسندة إليك فقط."}
      </p>
    </div>
  );
}

/** Adult plus child haircuts with the split underneath. */
export function Quantity({ value }: { value: { adult: number; child: number } }) {
  return (
    <span className="inline-flex flex-col">
      <span className="font-medium" data-numeric>{value.adult + value.child}</span>
      <span className="text-xs text-muted-foreground" data-numeric>{value.adult} بالغ، {value.child} طفل</span>
    </span>
  );
}

/** An exact KWD total with its record count. */
export function Money({ value, unit }: { value: { count: number; total: string }; unit: string }) {
  return (
    <span className="inline-flex flex-col">
      <Ltr className="font-medium">{formatKwd(value.total)}</Ltr>
      <span className="text-xs text-muted-foreground" data-numeric>{value.count} {unit}</span>
    </span>
  );
}

export const reservedHoursLabel = "الساعات المحجوزة (تشمل التنقل)";

type Performance = Pick<BranchReport["branches"][number], "work" | "invoices" | "cash">;

/** Work, time, and money measures shared by the barber and branch reports. Invoices and cash stay separate. */
export function PerformanceDetails({ value, children }: { value: Performance; children?: ReactNode }) {
  const { work, invoices, cash } = value;
  const group = "grid grid-cols-2 gap-4 sm:grid-cols-4";
  return (
    <div className="flex flex-col gap-4">
      <dl className={group} aria-label="العمل">
        <Detail label="الحجوزات"><span data-numeric>{work.bookings}</span></Detail>
        <Detail label="الزيارات المكتملة"><span data-numeric>{work.completedVisits}</span></Detail>
        <Detail label="الحلاقات المحجوزة"><Quantity value={work.reserved} /></Detail>
        <Detail label="الحلاقات المكتملة"><Quantity value={work.completed} /></Detail>
      </dl>
      <dl className={`${group} border-t border-border pt-4`} aria-label="الوقت">
        <Detail label={reservedHoursLabel}>{formatDuration(work.reservedMinutes)}</Detail>
        {children}
      </dl>
      <dl className={`${group} border-t border-border pt-4`} aria-label="الفواتير والنقد">
        <Detail label="الفواتير الصادرة"><Money value={invoices.issued} unit="فاتورة" /></Detail>
        <Detail label="فواتير غير مدفوعة"><Money value={invoices.outstanding} unit="فاتورة" /></Detail>
        <Detail label="الفواتير الملغاة"><Money value={invoices.cancelled} unit="فاتورة" /></Detail>
        <Detail label="النقد المستلم"><Money value={cash} unit="إيصال" /></Detail>
      </dl>
    </div>
  );
}

/** Report tables scroll on narrow screens; on paper their cells wrap so every column fits the page. */
export const printableTable = "print:text-xs print:[&_td]:px-1.5 print:[&_td]:whitespace-normal print:[&_th]:px-1.5 print:[&_th]:whitespace-normal";
