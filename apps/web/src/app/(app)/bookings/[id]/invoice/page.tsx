"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Printer } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { ErrorState, LoadingRows, Ltr } from "@/components/page";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import type { Invoice } from "@/lib/api/types";
import { formatAddress } from "@/lib/address";
import { formatDateTime } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useQuery({ queryKey: [...keys.booking(id), "invoice"], queryFn: ({ signal }) => apiRequest<Invoice>(`/bookings/${id}/invoice`, { signal }) });

  const toolbar = (
    <div className="mb-6 flex items-center justify-between gap-3" data-print-hidden>
      <Link href={`/bookings/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronRight className="size-4" aria-hidden />الحجز</Link>
      <Button onClick={() => window.print()} disabled={!invoice.data}><Printer aria-hidden />طباعة أو حفظ PDF</Button>
    </div>
  );
  if (invoice.isPending) return <>{toolbar}<LoadingRows /></>;
  if (invoice.isError) return <>{toolbar}<ErrorState error={invoice.error} onRetry={() => invoice.refetch()} /></>;
  const data = invoice.data;
  const lines = [
    data.adultCount > 0 ? { label: "حلاقة بالغ", count: data.adultCount, unit: data.adultUnitPrice, amount: data.adultAmount } : null,
    data.childCount > 0 ? { label: "حلاقة طفل", count: data.childCount, unit: data.childUnitPrice, amount: data.childAmount } : null,
  ].filter(line => line !== null);

  return (
    <>
      {toolbar}
      <article className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-6 sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
          <div>
            <Wordmark size="lg" />
            <p className="mt-2 text-sm text-muted-foreground">حلاقة منزلية للكبار والصغار</p>
          </div>
          <div className="text-sm">
            <h1 className="text-xl font-semibold">فاتورة</h1>
            <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">رقم الحجز</dt><dd><Ltr>{data.reference}</Ltr></dd>
              <dt className="text-muted-foreground">تاريخ الإصدار</dt><dd>{formatDateTime(data.issuedAt)}</dd>
              <dt className="text-muted-foreground">الحالة</dt>
              <dd>{data.status === "cancelled" ? "ملغاة" : data.paymentStatus === "paid" ? "مدفوعة نقداً" : "غير مدفوعة"}</dd>
            </dl>
          </div>
        </header>

        <section className="grid gap-6 border-b border-border py-6 text-sm sm:grid-cols-2">
          <div>
            <h2 className="mb-1 text-xs text-muted-foreground">العميل</h2>
            <p className="font-medium">{data.client.name}</p>
            <Ltr>{data.client.phone}</Ltr>
            <p className="mt-1">{formatAddress(data.address)}</p>
          </div>
          <div>
            <h2 className="mb-1 text-xs text-muted-foreground">الحلاق</h2>
            <p className="font-medium">{data.employee.displayName}</p>
            <p>{data.employee.branchName}</p>
            <p className="text-muted-foreground">{data.employee.branchLocation}</p>
          </div>
        </section>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 text-start font-medium">الخدمة</th>
              <th className="py-2 text-center font-medium">العدد</th>
              <th className="py-2 text-end font-medium">سعر الوحدة</th>
              <th className="py-2 text-end font-medium">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(line => (
              <tr key={line.label} className="border-b border-border">
                <td className="py-3">{line.label}</td>
                <td className="py-3 text-center" data-numeric>{line.count}</td>
                <td className="py-3 text-end"><Ltr>{formatKwd(line.unit)}</Ltr></td>
                <td className="py-3 text-end"><Ltr>{formatKwd(line.amount)}</Ltr></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-4 text-base font-semibold">الإجمالي</td>
              <td className="pt-4 text-end text-base font-semibold"><Ltr>{formatKwd(data.total)}</Ltr></td>
            </tr>
          </tfoot>
        </table>
        {data.status === "cancelled" ? <p className="mt-6 rounded-md border border-border px-4 py-3 text-sm">أُلغيت هذه الفاتورة مع إلغاء الزيارة، وتبقى محفوظة في السجل.</p> : null}
        <p className="mt-8 text-xs text-muted-foreground">الدفع نقداً عند الزيارة. جميع المبالغ بالدينار الكويتي.</p>
      </article>
    </>
  );
}
