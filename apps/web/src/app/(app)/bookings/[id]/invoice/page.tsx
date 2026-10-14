"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, Printer } from "lucide-react";
import { EmployeeAvatar } from "@/components/avatar";
import { Wordmark } from "@/components/brand";
import { ErrorState, LoadingRows, Ltr } from "@/components/page";
import { Button } from "@/components/ui/button";
import { useInvoice } from "@/lib/api/hooks";
import { formatAddress } from "@/lib/address";
import { formatDateTime } from "@/lib/kuwait-time";
import { formatKwd } from "@/lib/money";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useInvoice(id);

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
    data.amountCash !== "0.000" ? { label: "نقدي", amount: data.amountCash } : null,
    data.amountLink !== "0.000" ? { label: "رابط", amount: data.amountLink } : null,
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
              <dd>{data.status === "cancelled" ? "ملغاة" : data.paymentStatus === "paid" ? "مدفوعة" : "غير مدفوعة"}</dd>
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
            <div className="flex items-center gap-2">
              <EmployeeAvatar employeeId={data.employee.id} name={data.employee.displayName} className="size-10" />
              <p className="font-medium">{data.employee.displayName}</p>
            </div>
          </div>
        </section>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 text-start font-medium">البيان</th>
              <th className="py-2 text-end font-medium">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(line => (
              <tr key={line.label} className="border-b border-border">
                <td className="py-3">{line.label}</td>
                <td className="py-3 text-end"><Ltr>{formatKwd(line.amount)}</Ltr></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 text-base font-semibold">الإجمالي</td>
              <td className="pt-4 text-end text-base font-semibold"><Ltr>{formatKwd(data.total)}</Ltr></td>
            </tr>
          </tfoot>
        </table>
        {data.notes ? <p className="mt-3 text-sm">ملاحظات: {data.notes}</p> : null}
        {data.specialChildCount > 0 ? <p className="mt-3 text-sm text-muted-foreground">يشمل {data.specialChildCount} من الأطفال ذوي الاحتياجات الخاصة، ويُحسبون بسعر الطفل.</p> : null}
        {data.status === "cancelled" ? <p className="mt-6 rounded-md border border-border px-4 py-3 text-sm">أُلغيت هذه الفاتورة مع إلغاء الزيارة، وتبقى محفوظة في السجل.</p> : null}
        <p className="mt-8 text-xs text-muted-foreground">الدفع عند الزيارة نقداً أو عبر رابط الدفع أو كي نت. جميع المبالغ بالدينار الكويتي.</p>
      </article>
    </>
  );
}
