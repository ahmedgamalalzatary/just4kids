"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Pagination } from "@/components/pagination";
import { PaymentBadge, VisitStatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBookings } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Booking } from "@/lib/api/types";
import { formatDate, formatWindow, kuwaitNow } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";
import { cn } from "@/lib/utils";

function haircuts(booking: Pick<Booking, "adultCount" | "childCount">) {
  return [booking.adultCount ? `${booking.adultCount} بالغ` : null, booking.childCount ? `${booking.childCount} طفل` : null].filter(Boolean).join("، ");
}

function groupByDate(bookings: Booking[]) {
  const groups = new Map<string, Booking[]>();
  for (const booking of bookings) groups.set(booking.date, [...(groups.get(booking.date) ?? []), booking]);
  return [...groups.entries()];
}

function BookingRow({ booking, showBarber }: { booking: Booking; showBarber: boolean }) {
  return (
    <li>
      <Link href={`/bookings/${booking.id}`} className="grid gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-muted/50 sm:grid-cols-[9.5rem_1fr_auto] sm:items-center">
        <div className="flex items-center justify-between gap-3 sm:block">
          <p className="text-sm font-semibold" data-numeric>{formatWindow(booking.startTime, booking.endTime)}</p>
          <Ltr className="text-xs text-muted-foreground">{booking.reference}</Ltr>
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{booking.client.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {booking.address.area}، {haircuts(booking)}{showBarber ? `، مع ${booking.employee.displayName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <VisitStatusBadge status={booking.visitStatus} />
          <PaymentBadge paymentStatus={booking.invoice.paymentStatus} invoiceStatus={booking.invoice.status} />
          <Ltr className="ms-auto text-sm font-medium sm:ms-0 sm:min-w-[6.5rem] sm:text-end">{formatKwd(booking.invoice.total)}</Ltr>
        </div>
      </Link>
    </li>
  );
}

export default function BookingsPage() {
  const session = useSession();
  const isAdmin = session.data?.account.role === "admin";
  const [offset, setOffset] = useState(0);
  const bookings = useBookings(offset);
  const today = kuwaitNow().date;
  const newButton = isAdmin ? <Button asChild><Link href="/bookings/new"><Plus aria-hidden />حجز جديد</Link></Button> : null;

  return (
    <>
      <PageHeader
        title={isAdmin ? "الحجوزات" : "حجوزاتي"}
        description={isAdmin ? "كل الزيارات، الأحدث موعداً أولاً." : "زياراتك المسندة إليك، الأحدث موعداً أولاً."}
        actions={newButton}
      />
      {bookings.isPending ? <Card><LoadingRows /></Card> : bookings.isError ? <Card><ErrorState error={bookings.error} onRetry={() => bookings.refetch()} /></Card> : bookings.data.bookings.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarDays} title="لا توجد حجوزات بعد" description={isAdmin ? "أنشئ أول حجز لعميل مع حلاق متاح." : "ستظهر هنا الزيارات التي يسندها إليك المدير."} action={newButton} />
        </Card>
      ) : (
        <div className={cn("flex flex-col gap-6", bookings.isPlaceholderData && "opacity-60")}>
          {groupByDate(bookings.data.bookings).map(([date, items]) => (
            <section key={date} aria-labelledby={`day-${date}`}>
              <h2 id={`day-${date}`} className="mb-2 flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
                {formatDate(date)}
                {date === today ? <span className="rounded-full bg-sun px-2 py-0.5 text-xs font-semibold text-sun-foreground">اليوم</span> : null}
              </h2>
              <Card><ul className="divide-y divide-border">{items.map(booking => <BookingRow key={booking.id} booking={booking} showBarber={isAdmin} />)}</ul></Card>
            </section>
          ))}
          {bookings.data.total > bookings.data.limit ? <Card><Pagination total={bookings.data.total} limit={bookings.data.limit} offset={bookings.data.offset} onChange={setOffset} className="border-t-0" /></Card> : null}
        </div>
      )}
    </>
  );
}
