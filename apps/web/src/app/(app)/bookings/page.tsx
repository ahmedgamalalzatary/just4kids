"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useState, type ReactNode } from "react";
import { CalendarDays, ChevronRight, ChevronLeft, Plus } from "lucide-react";
import { EmployeeAvatar } from "@/components/avatar";
import { DayBookingRow, NewBookingDot, TimeChip, VisitCard } from "@/components/day-bookings";
import { Field } from "@/components/field";
import { EmptyState, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Pagination } from "@/components/pagination";
import { PaymentBadge, VisitStatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBookings, useDayBookings, useEmployees } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Booking, Employee } from "@/lib/api/types";
import { daySummary, haircutSummary, shiftDate } from "@/lib/day";
import { formatDate, kuwaitNow } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { isNewForBarber } from "@/lib/visit-rules";
import { cn } from "@/lib/utils";

function groupByDate(bookings: Booking[]) {
  const groups = new Map<string, Booking[]>();
  for (const booking of bookings) groups.set(booking.date, [...(groups.get(booking.date) ?? []), booking]);
  return [...groups.entries()];
}

function BookingRow({ booking, showBarber, unseen, photoVersion }: { booking: Booking; showBarber: boolean; unseen: boolean; photoVersion?: string | null | undefined }) {
  return (
    <li>
      <Link href={`/bookings/${booking.id}`} className="grid gap-2.5 px-4 py-4 transition-colors hover:bg-muted/50 sm:px-5 lg:grid-cols-[10rem_1fr_auto] lg:items-center lg:gap-6">
        <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-start lg:gap-2">
          <span className="flex items-center gap-2">
            {unseen ? <NewBookingDot /> : null}
            <TimeChip booking={booking} />
          </span>
          {showBarber ? (
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <EmployeeAvatar employeeId={booking.employee.id} name={booking.employee.displayName} version={photoVersion} className="size-6 text-xs" />
              <span className="truncate">{booking.employee.displayName}</span>
            </span>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 font-medium"><Ltr className="text-sm font-normal">{booking.client.phone}</Ltr></p>
          <p className="truncate text-sm text-muted-foreground">{booking.address.area}, {haircutSummary(booking)}</p>
          <p className="truncate text-xs text-muted-foreground"><Ltr>{booking.reference}</Ltr></p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <VisitStatusBadge status={booking.visitStatus} />
          <PaymentBadge paymentStatus={booking.invoice.paymentStatus} invoiceStatus={booking.invoice.status} />
          <Ltr className="ms-auto text-sm font-semibold lg:ms-0 lg:min-w-[6.5rem] lg:text-end">{formatKwd(booking.invoice.total)}</Ltr>
        </div>
      </Link>
    </li>
  );
}

type Filters = { date?: string; barber?: string; view?: string };

function DayFilters({ date, barber, isAdmin, employees, onChange }: { date: string; barber: string; isAdmin: boolean; employees: Employee[]; onChange: (next: Filters) => void }) {
  const dateId = useId();
  const today = kuwaitNow().date;
  return (
    <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={dateId}>Date</Label>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" aria-label="Previous day" onClick={() => onChange({ date: shiftDate(date, -1) })}><ChevronLeft /></Button>
          <Input id={dateId} type="date" dir="ltr" value={date} onChange={event => { if (event.target.value) onChange({ date: event.target.value }); }} className="w-40" />
          <Button type="button" variant="outline" size="icon" aria-label="Next day" onClick={() => onChange({ date: shiftDate(date, 1) })}><ChevronRight /></Button>
          {date !== today ? <Button type="button" variant="ghost" onClick={() => onChange({ date: today })}>Today</Button> : null}
        </div>
      </div>
      {isAdmin ? (
        <Field label="Barber" className="sm:w-56">
          <Select value={barber || "all"} onValueChange={value => onChange({ barber: value === "all" ? "" : value })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All barbers</SelectItem>
              {employees.map(employee => <SelectItem key={employee.id} value={employee.id}>{employee.displayName}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
    </Card>
  );
}

function DayView({ date, barber, isAdmin, employees, newButton }: { date: string; barber: string; isAdmin: boolean; employees: Employee[]; newButton: ReactNode }) {
  const day = useDayBookings(date, barber || null);
  const byId = new Map(employees.map(employee => [employee.id, employee]));
  if (day.isPending) return <Card><LoadingRows /></Card>;
  if (day.isError) return <Card><ErrorState error={day.error} onRetry={() => day.refetch()} /></Card>;
  const { bookings, total } = day.data;
  const summary = daySummary(bookings);
  return (
    <div className={cn("flex flex-col gap-3", day.isPlaceholderData && "opacity-60")}>
      <p className="px-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{formatDate(date)}</span> · <span data-numeric>{summary.active}</span> reservations, <span data-numeric>{summary.open}</span> Open
      </p>
      {bookings.length === 0 ? (
        <Card><EmptyState icon={CalendarDays} title="No appointments on this day" description={isAdmin ? "Choose another day or create a reservation." : "Visits assigned to you will appear here."} action={newButton} /></Card>
      ) : isAdmin ? (
        <Card><ul className="divide-y divide-border">{bookings.map(booking => <DayBookingRow key={booking.id} booking={booking} barberPhone={byId.get(booking.employeeId)?.phone} photoVersion={byId.get(booking.employeeId)?.photoUpdatedAt} />)}</ul></Card>
      ) : (
        <div className="flex flex-col gap-3">{bookings.map(booking => <VisitCard key={booking.id} booking={booking} />)}</div>
      )}
      {total > bookings.length ? <p className="px-1 text-xs text-muted-foreground">Showing the first <span data-numeric>{bookings.length}</span> From <span data-numeric>{total}</span> appointments. Select a barber to view the full day.</p> : null}
    </div>
  );
}

function AllView({ isAdmin, employees, newButton }: { isAdmin: boolean; employees: Employee[]; newButton: ReactNode }) {
  const [offset, setOffset] = useState(0);
  const photos = new Map(employees.map(employee => [employee.id, employee.photoUpdatedAt]));
  const bookings = useBookings(offset);
  const today = kuwaitNow().date;
  if (bookings.isPending) return <Card><LoadingRows /></Card>;
  if (bookings.isError) return <Card><ErrorState error={bookings.error} onRetry={() => bookings.refetch()} /></Card>;
  if (bookings.data.bookings.length === 0) {
    return <Card><EmptyState icon={CalendarDays} title="No reservations yet" description={isAdmin ? "Create the first reservation with an available barber." : "Visits assigned to you will appear here."} action={newButton} /></Card>;
  }
  return (
    <div className={cn("flex flex-col gap-6", bookings.isPlaceholderData && "opacity-60")}>
      {groupByDate(bookings.data.bookings).map(([date, items]) => (
        <section key={date} aria-labelledby={`day-${date}`}>
          <h2 id={`day-${date}`} className="mb-2 flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
            {formatDate(date)}
            {date === today ? <span className="rounded-full bg-sun px-2 py-0.5 text-xs font-semibold text-sun-foreground">Today</span> : null}
          </h2>
          <Card><ul className="divide-y divide-border">{items.map(booking => <BookingRow key={booking.id} booking={booking} showBarber={isAdmin} unseen={isNewForBarber(booking, isAdmin)} photoVersion={photos.get(booking.employeeId)} />)}</ul></Card>
        </section>
      ))}
      {bookings.data.total > bookings.data.limit ? <Card><Pagination total={bookings.data.total} limit={bookings.data.limit} offset={bookings.data.offset} onChange={setOffset} className="border-t-0" /></Card> : null}
    </div>
  );
}

function BookingsScreen() {
  const session = useSession();
  const isAdmin = session.data?.account.role === "admin";
  const router = useRouter();
  const params = useSearchParams();
  const date = params.get("date") || kuwaitNow().date;
  const barber = isAdmin ? params.get("barber") ?? "" : "";
  const view = params.get("view") === "all" ? "all" : "day";
  const employees = useEmployees(isAdmin);
  // Filters live in the address so the home cards can link to one barber's day and the back button keeps them.
  const update = (next: Filters) => {
    const search = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) if (value) search.set(key, value); else search.delete(key);
    const query = search.toString();
    router.replace(query ? `/bookings?${query}` : "/bookings", { scroll: false });
  };
  const newButton = isAdmin ? <Button asChild variant="sun"><Link href={barber ? `/bookings/new?barber=${barber}` : "/bookings/new"}><Plus aria-hidden />New reservation</Link></Button> : null;

  return (
    <>
      <PageHeader
        title={isAdmin ? "Reservation dispatch" : "My reservations"}
        description={isAdmin ? "Daily barber appointments and WhatsApp reservation details." : "Visits assigned to you."}
        actions={newButton}
      />
      <Tabs value={view} onValueChange={value => update({ view: value === "all" ? "all" : "" })} className="mb-4">
        <TabsList>
          <TabsTrigger value="day">Day appointments</TabsTrigger>
          <TabsTrigger value="all">All reservations</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === "day" ? (
        <>
          <DayFilters date={date} barber={barber} isAdmin={isAdmin} employees={employees.data ?? []} onChange={update} />
          <DayView date={date} barber={barber} isAdmin={isAdmin} employees={employees.data ?? []} newButton={newButton} />
        </>
      ) : <AllView isAdmin={isAdmin} employees={employees.data ?? []} newButton={newButton} />}
    </>
  );
}

export default function BookingsPage() {
  return <Suspense><BookingsScreen /></Suspense>;
}
