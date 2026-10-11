"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Search, Users } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { CreateClientDialog } from "@/components/client-dialogs";
import { EmptyState, ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients } from "@/lib/api/hooks";
import { clientStatusOptions, type ClientStatusFilter } from "@/lib/clients";

function ClientsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ClientStatusFilter>("all");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const query = useDeferredValue(search.trim());
  const clients = useClients(query, offset, status);

  return (
    <>
      <PageHeader title="العملاء" description="جهات الاتصال وعناوين الزيارات." actions={<Button onClick={() => setOpen(true)}><Plus aria-hidden />عميل جديد</Button>} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <label className="relative block flex-1 sm:max-w-md">
            <span className="sr-only">بحث بالاسم أو الهاتف</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} placeholder="بحث بالاسم أو رقم الهاتف" className="ps-9" />
          </label>
          <Select value={status} onValueChange={value => { setStatus(value as ClientStatusFilter); setOffset(0); }}>
            <SelectTrigger className="w-full sm:w-48" aria-label="تصفية حسب الحالة"><SelectValue /></SelectTrigger>
            <SelectContent>{clientStatusOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {clients.isPending ? <LoadingRows /> : clients.isError ? <ErrorState error={clients.error} onRetry={() => clients.refetch()} /> : clients.data.clients.length === 0 ? (
          query || status !== "all" ? <EmptyState icon={Search} title="لا يوجد عميل مطابق" description="غيّر البحث أو مرشح الحالة، أو أضف عميلاً جديداً." /> : (
            <EmptyState icon={Users} title="لا يوجد عملاء بعد" description="أضف العميل مع عنوان الزيارة لتتمكن من حجز موعد له." action={<Button onClick={() => setOpen(true)}><Plus aria-hidden />عميل جديد</Button>} />
          )
        ) : (
          <>
            <ul className={clients.isPlaceholderData ? "divide-y divide-border opacity-60" : "divide-y divide-border"}>
              {clients.data.clients.map(client => (
                <li key={client.id}>
                  <Link href={`/clients/${client.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {client.name}
                        {client.enabled ? null : <Badge variant="muted">موقوف</Badge>}
                      </p>
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
