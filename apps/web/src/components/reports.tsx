"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { VisitStatus } from "@just4kids/contracts";
import { Field } from "@/components/field";
import { Detail, ErrorState, LoadingRows, Ltr } from "@/components/page";
import { visitStatusLabels } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PAGE_SIZE, useBranches, useClient, useClients, useEmployees } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { ClientReport, EmployeeReport } from "@/lib/api/types";
import { formatDate, formatDuration } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { paymentMethodOptions } from "@/lib/payments";
import { emptyReportFilters, rangeError, readReportFilters, reportSearch, trackingFilters, trackingRangeError, withTrackingPeriod, type ReportFilters } from "@/lib/reports";

export const dateBasisLabels = { visit_date: "Visit date", created_date: "Reservation creation date" } as const;
export const sourceLabels = { manual: "Manual reservation", ai: "Via WhatsApp" } as const;

/** The current report filters from the address; the barber filter applies to the administrator only. */
export function useReportFilters() {
  const params = useSearchParams();
  const pathname = usePathname();
  const isAdmin = useSession().data?.account.role === "admin";
  const read = readReportFilters(params, isAdmin);
  const tracking = pathname === "/reports/tracking";
  const chosen = tracking ? trackingFilters(read) : read;
  // The address keeps only what was chosen; the tracking report's default week is applied on top.
  return { filters: tracking ? withTrackingPeriod(chosen) : chosen, isAdmin, search: reportSearch(chosen) };
}

/** A link to the reservation records behind a report row, keeping the current filters. */
export function reservationsHref(filters: ReportFilters, changes: Partial<ReportFilters>) {
  return `/reports${reportSearch({ ...filters, ...changes })}`;
}

const tabs = [
  { href: "/reports", label: "Reservations" },
  { href: "/reports/haircuts", label: "Haircuts" },
  { href: "/reports/barbers", label: "Barbers", employeeLabel: "My performance" },
  { href: "/reports/clients", label: "Clients" },
  { href: "/reports/tracking", label: "Reservation tracking", adminOnly: true },
  { href: "/reports/salon", label: "Salon work", adminOnly: true },
  { href: "/reports/comprehensive", label: "Combined collections", adminOnly: true },
];

export function reportTitle(pathname: string, isAdmin: boolean) {
  const tab = tabs.find(item => item.href === pathname) ?? tabs[0]!;
  return `Report ${isAdmin ? tab.label : tab.employeeLabel ?? tab.label}`;
}

export function ReportTabs() {
  const pathname = usePathname();
  const { filters, isAdmin, search } = useReportFilters();
  const list = useRef<HTMLDivElement>(null);
  // On a narrow screen the tabs scroll sideways; keep the open report's tab in view.
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const reveal = () => element.querySelector("[data-state=active]")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    reveal();
    // The strip narrows later, e.g. when the page scrollbar appears or the web font loads.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(reveal);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pathname, isAdmin]);
  return (
    <Tabs value={pathname} dir="ltr" activationMode="manual" data-print-hidden>
      <TabsList ref={list} className="w-full max-w-full justify-start overflow-x-auto [scrollbar-width:none] sm:w-fit">
        {tabs.filter(tab => isAdmin || !tab.adminOnly).map(tab => (
          <TabsTrigger key={tab.href} value={tab.href} asChild>
            <Link href={`${tab.href}${tab.href === "/reports/tracking" && pathname !== tab.href ? reportSearch(trackingFilters(filters)) : search}`}>{isAdmin ? tab.label : tab.employeeLabel ?? tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

const ALL = "all";

/** A select whose optional "all" choice clears the value back to "" (Radix forbids an empty item value). */
export function OptionSelect({ value, onChange, all, options, id, ...aria }: {
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
        <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Report filters">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Field label="Date basis" className="col-span-2 lg:col-span-1">
              <OptionSelect value={draft.dateBasis} onChange={value => set("dateBasis")(value === "created_date" ? "created_date" : "visit_date")}
                options={[{ value: "visit_date", label: dateBasisLabels.visit_date }, { value: "created_date", label: dateBasisLabels.created_date }]} />
            </Field>
            <Field label="From date" optional>
              <Input type="date" value={draft.from} onChange={event => set("from")(event.target.value)} />
            </Field>
            <Field label="To date" optional error={error}>
              <Input type="date" value={draft.to} onChange={event => set("to")(event.target.value)} />
            </Field>
            <Field label="Search" optional className="col-span-2 lg:col-span-1">
              <Input type="search" value={draft.q} maxLength={120} onChange={event => set("q")(event.target.value)} placeholder="Reference or client phone" />
            </Field>
            {isAdmin ? (
              <Field label="Barber">
                <OptionSelect value={draft.employeeId} onChange={set("employeeId")} all="All barbers" options={(employees.data ?? []).map(employee => ({ value: employee.id, label: employee.displayName }))} />
              </Field>
            ) : null}
            <Field label="Visit status">
              <OptionSelect value={draft.status} onChange={value => set("status")(value as VisitStatus | "")} all="All statuses"
                options={Object.entries(visitStatusLabels).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Source">
              <OptionSelect value={draft.source} onChange={value => set("source")(value as ReportFilters["source"])} all="All sources"
                options={Object.entries(sourceLabels).map(([value, label]) => ({ value, label }))} />
            </Field>
          </div>
          {isAdmin && filters.clientId ? (
            <p className="text-sm text-muted-foreground">
              Filtered to one client.{" "}
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => apply({ ...draft, clientId: "" })}>View all clients</Button>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={Boolean(error)}>View report</Button>
            <Button type="button" variant="ghost" onClick={() => { setDraft(emptyReportFilters); apply(emptyReportFilters); }}>Clear filters</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Filters edited as a draft and applied to the address; the form restarts whenever the address changes. */
export function ReportFilterBar() {
  const { filters, isAdmin, search } = useReportFilters();
  const pathname = usePathname();
  if (pathname === "/reports/tracking") return isAdmin ? <TrackingFilterForm key={search} filters={filters} /> : null;
  return <FilterForm key={search} filters={filters} isAdmin={isAdmin} />;
}

function TrackingFilterForm({ filters }: { filters: ReportFilters }) {
  const router = useRouter();
  const [draft, setDraft] = useState(filters);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const query = useDeferredValue(search.trim());
  const clients = useClients(query, offset);
  const client = useClient(draft.clientId || null);
  const employees = useEmployees(true);
  const error = trackingRangeError(draft.from, draft.to);
  const set = (key: "from" | "to" | "employeeId" | "clientId", value: string) => setDraft(current => ({ ...current, [key]: value }));
  const apply = (next: ReportFilters) => router.replace(`/reports/tracking${reportSearch(trackingFilters(next))}`, { scroll: false });
  return (
    <Card data-print-hidden>
      <CardContent>
        <form onSubmit={event => { event.preventDefault(); if (!error) apply(draft); }} className="flex flex-col gap-4" aria-label="Report filters">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Field label="From date" optional><Input type="date" value={draft.from} onChange={event => set("from", event.target.value)} /></Field>
            <Field label="To date" optional error={error}><Input type="date" value={draft.to} onChange={event => set("to", event.target.value)} /></Field>
            <Field label="Barber" className="col-span-2 lg:col-span-1"><OptionSelect value={draft.employeeId} onChange={value => set("employeeId", value)} all="All barbers" options={(employees.data ?? []).map(employee => ({ value: employee.id, label: employee.displayName }))} /></Field>
            <div className="col-span-2 flex flex-col gap-2 lg:col-span-1">
              {draft.clientId ? (
                <><p className="text-sm">Client: {client.data?.phone ?? "…"}</p><Button type="button" variant="link" className="h-auto self-start p-0" onClick={() => set("clientId", "")}>All clients / choose another client</Button></>
              ) : (
                <>
                  <Field label="Find client" optional hint="Leave unselected to include all clients."><Input type="search" maxLength={120} value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} placeholder="Phone number" /></Field>
                  {clients.isPending ? <LoadingRows rows={1} /> : clients.isError ? <ErrorState error={clients.error} onRetry={() => clients.refetch()} /> : (
                    <>
                      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
                        {clients.data.clients.map(person => <li key={person.id}><button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-muted/60" onClick={() => set("clientId", person.id)}><Ltr>{person.phone}</Ltr>{person.enabled ? null : <span>(stopped)</span>}</button></li>)}
                      </ul>
                      {clients.data.clients.length === 0 ? <p className="text-xs text-muted-foreground">No matching client</p> : null}
                      <div className="flex gap-2">
                        {offset > 0 ? <Button type="button" variant="ghost" size="sm" onClick={() => setOffset(current => Math.max(0, current - PAGE_SIZE))}>Previous</Button> : null}
                        {offset + PAGE_SIZE < clients.data.total ? <Button type="button" variant="ghost" size="sm" onClick={() => setOffset(current => current + PAGE_SIZE)}>Next</Button> : null}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={Boolean(error)}>View report</Button>
            <Button type="button" variant="ghost" onClick={() => { setDraft(withTrackingPeriod(emptyReportFilters)); setSearch(""); setOffset(0); apply(emptyReportFilters); }}>Clear filters</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// The comprehensive report covers the period only, as in the old app: barber collections carry no branch.
const periodOnly = (pathname: string) => pathname === "/reports/comprehensive";

/** From/to filter (plus branch, except on the comprehensive report) for the administrator-only salon reports. */
export function SalonFilterBar() {
  const { filters, isAdmin, search } = useReportFilters();
  const pathname = usePathname();
  // Rebuild the form whenever the address changes, matching ReportFilterBar.
  return <SalonFilterForm key={search} from={filters.from} to={filters.to} branchId={filters.branchId} isAdmin={isAdmin} withBranch={!periodOnly(pathname)} />;
}

function SalonFilterForm({ from, to, branchId, isAdmin, withBranch }: { from: string; to: string; branchId: string; isAdmin: boolean; withBranch: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const branches = useBranches(isAdmin && withBranch);
  const [draft, setDraft] = useState({ from, to, branchId: withBranch ? branchId : "" });
  const error = rangeError(draft.from, draft.to);
  const apply = (next: { from: string; to: string; branchId: string }) => router.replace(`${pathname}${reportSearch({ ...emptyReportFilters, ...next })}`, { scroll: false });
  const set = <Key extends keyof typeof draft>(key: Key) => (value: string) => setDraft(current => ({ ...current, [key]: value }));
  return (
    <Card data-print-hidden>
      <CardContent>
        <form onSubmit={event => { event.preventDefault(); if (!error) apply(draft); }} className="flex flex-col gap-4" aria-label="Report filters">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Field label="From date" optional><Input type="date" value={draft.from} onChange={event => set("from")(event.target.value)} /></Field>
            <Field label="To date" optional error={error}><Input type="date" value={draft.to} onChange={event => set("to")(event.target.value)} /></Field>
            {withBranch ? <Field label="Branch" className="col-span-2"><OptionSelect value={draft.branchId} onChange={set("branchId")} all="All branches" options={(branches.data ?? []).map(branch => ({ value: branch.id, label: branch.name }))} /></Field> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={Boolean(error)}>View report</Button>
            <Button type="button" variant="ghost" onClick={() => { const cleared = { from: "", to: "", branchId: "" }; setDraft(cleared); apply(cleared); }}>Clear filters</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Print-visible period (and branch, except on the comprehensive report) for the salon reports. */
export function SalonScope() {
  const { filters, isAdmin } = useReportFilters();
  const withBranch = !periodOnly(usePathname());
  const branches = useBranches(isAdmin && withBranch);
  const range = filters.from && filters.to ? `From ${formatDate(filters.from)} To ${formatDate(filters.to)}`
    : filters.from ? `From ${formatDate(filters.from)}` : filters.to ? `Until ${formatDate(filters.to)}` : "All dates";
  const branch = filters.branchId ? branches.data?.find(item => item.id === filters.branchId)?.name ?? "…" : "All branches";
  return <p className="text-sm text-muted-foreground">Period: {range}{withBranch ? ` Branch: ${branch}` : ""} (Kuwait time).</p>;
}

/** The report name, date basis, and applied filters, shown on screen and on paper. */
export function ReportScope() {
  const pathname = usePathname();
  const { filters, isAdmin } = useReportFilters();
  const employees = useEmployees(isAdmin);
  const client = useClient(isAdmin && filters.clientId ? filters.clientId : null);
  const range = filters.from && filters.to ? `From ${formatDate(filters.from)} To ${formatDate(filters.to)}`
    : filters.from ? `From ${formatDate(filters.from)}` : filters.to ? `Until ${formatDate(filters.to)}` : "All dates";
  const applied = [
    filters.employeeId ? `Barber: ${employees.data?.find(employee => employee.id === filters.employeeId)?.displayName ?? "…"}` : null,
    filters.clientId ? `Client: ${client.data?.phone ?? "…"}` : null,
    filters.status ? `Status: ${visitStatusLabels[filters.status]}` : null,
    filters.source ? `Source: ${sourceLabels[filters.source]}` : null,
    filters.q ? `Search: ${filters.q}` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">{reportTitle(pathname, isAdmin)}</h2>
      <p className="text-sm text-muted-foreground">
        By {dateBasisLabels[filters.dateBasis]}, {range} (Kuwait time).
        {applied.length ? ` ${applied.join(", ")}.` : ""}
        {isAdmin ? "" : " Only visits assigned to you."}
      </p>
    </div>
  );
}

/** Adult plus child haircuts with the split underneath, including the special-needs subset of children. */
export function Quantity({ value }: { value: { adult: number; child: number; special: number } }) {
  return (
    <span className="inline-flex flex-col">
      <span className="font-medium" data-numeric>{value.adult + value.child}</span>
      <span className="text-xs text-muted-foreground" data-numeric>{value.adult} adults, {value.child} children, {value.special} special needs</span>
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

export const reservedHoursLabel = "Reserved hours (including travel)";

type Cash = NonNullable<EmployeeReport["employees"][number]["cash"]>;

/** Collected money with the overall total and its split across the used payment methods. */
export function CashMoney({ value, unit = "Receipt" }: { value: Cash; unit?: string | undefined }) {
  const parts = paymentMethodOptions.filter(option => value.byMethod[option.value].count > 0).map(option => `${option.label} ${formatKwd(value.byMethod[option.value].total)}`);
  return (
    <span className="inline-flex flex-col">
      <Ltr className="font-medium">{formatKwd(value.total)}</Ltr>
      <span className="text-xs text-muted-foreground" data-numeric>{value.count} {unit}</span>
      {parts.length ? <span className="text-xs text-muted-foreground" data-numeric>{parts.join(", ")}</span> : null}
    </span>
  );
}

/** The barbers' daily collections, or a note when a filter they cannot follow hides them. */
export function CollectedCash({ value, unit }: { value: Cash | null; unit?: string | undefined }) {
  return value ? <CashMoney value={value} unit={unit} /> : <span className="text-xs text-muted-foreground">Collections are filtered by period and barber only</span>;
}

type Performance = Pick<ClientReport["clients"][number], "work"> & { cash?: Cash | null };

/** Work and time shared by the barber and client reports, with the barber's daily collections underneath. */
export function PerformanceDetails({ value, cashUnit, children }: { value: Performance; cashUnit?: string | undefined; children?: ReactNode }) {
  const { work, cash = null } = value;
  const group = "grid grid-cols-2 gap-4 sm:grid-cols-4";
  return (
    <div className="flex flex-col gap-4">
      <dl className={group} aria-label="Work">
        <Detail label="Reservations"><span data-numeric>{work.bookings}</span></Detail>
        <Detail label="Completed visits"><span data-numeric>{work.completedVisits}</span></Detail>
        <Detail label="Reserved haircuts"><Quantity value={work.reserved} /></Detail>
        <Detail label="Completed haircuts"><Quantity value={work.completed} /></Detail>
      </dl>
      <dl className={`${group} border-t border-border pt-4`} aria-label="Time">
        <Detail label={reservedHoursLabel}>{formatDuration(work.reservedMinutes)}</Detail>
        {children}
      </dl>
      <dl className={`${group} border-t border-border pt-4`} aria-label="Collections">
        <Detail label="Collected amount"><CollectedCash value={cash} unit={cashUnit} /></Detail>
      </dl>
    </div>
  );
}

/** Report tables scroll on narrow screens; on paper their cells wrap so every column fits the page. */
export const printableTable = "print:text-xs print:[&_td]:px-1.5 print:[&_td]:whitespace-normal print:[&_th]:px-1.5 print:[&_th]:whitespace-normal";
