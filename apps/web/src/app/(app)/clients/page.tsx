"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Search, Users } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { CreateClientDialog } from "@/components/client-dialogs";
import { EmptyState, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useClients } from "@/lib/api/hooks";

function ClientsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const query = useDeferredValue(search.trim());
  const clients = useClients(query, offset);

  return (
    <>
      <PageHeader title="العملاء" description="جهات الاتصال وعناوين الزيارات." actions={<Button onClick={() => setOpen(true)}><Plus aria-hidden />عميل جديد</Button>} />
      <Card>
        <div className="border-b border-border p-4">
          <label className="relative block max-w-md">
            <span className="sr-only">بحث بالاسم أو الهاتف</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} placeholder="بحث بالاسم أو رقم الهاتف" className="ps-9" />
          </label>
        </div>
        {clients.isPending ? <LoadingRows /> : clients.isError ? <ErrorState error={clients.error} onRetry={() => clients.refetch()} /> : clients.data.clients.length === 0 ? (
          query ? <EmptyState icon={Search} title="لا يوجد عميل مطابق" description="جرّب جزءاً من الاسم أو الرقم، أو أضف عميلاً جديداً." /> : (
            <EmptyState icon={Users} title="لا يوجد عملاء بعد" description="أضف العميل مع عنوان الزيارة لتتمكن من حجز موعد له." action={<Button onClick={() => setOpen(true)}><Plus aria-hidden />عميل جديد</Button>} />
          )
        ) : (
          <>
            <ul className={clients.isPlaceholderData ? "divide-y divide-border opacity-60" : "divide-y divide-border"}>
              {clients.data.clients.map(client => (
                <li key={client.id}>
                  <Link href={`/clients/${client.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{client.name}</p>
                      <Ltr className="text-sm text-muted-foreground">{client.phone}</Ltr>
                    </div>
                    <ChevronLeft className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination total={clients.data.total} limit={clients.data.limit} offset={clients.data.offset} onChange={setOffset} />
          </>
        )}
      </Card>
      <CreateClientDialog open={open} onOpenChange={setOpen} onCreated={client => router.push(`/clients/${client.id}`)} />
    </>
  );
}

export default function ClientsPage() {
  return <AdminOnly><ClientsScreen /></AdminOnly>;
}
