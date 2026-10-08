"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, ChevronRight, MapPin, Pencil, Plus } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { AddressDialog, EditClientDialog } from "@/components/client-dialogs";
import { ErrorState, LoadingRows, Ltr, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useClient } from "@/lib/api/hooks";
import type { Address } from "@/lib/api/types";
import { formatAddress, mapLink } from "@/lib/address";

function ClientScreen({ id }: { id: string }) {
  const client = useClient(id);
  const [editOpen, setEditOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const openAddress = (address: Address | null) => { setEditingAddress(address); setAddressOpen(true); };

  const back = <Link href="/clients" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronRight className="size-4" aria-hidden />العملاء</Link>;
  if (client.isPending) return <>{back}<LoadingRows /></>;
  if (client.isError) return <>{back}<ErrorState error={client.error} onRetry={() => client.refetch()} /></>;

  return (
    <>
      <PageHeader
        back={back}
        title={client.data.name}
        description={<Ltr>{client.data.phone}</Ltr>}
        actions={(
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil aria-hidden />تعديل البيانات</Button>
            <Button asChild><Link href={`/bookings/new?client=${client.data.id}`}><CalendarPlus aria-hidden />حجز جديد</Link></Button>
          </>
        )}
      />
      <Card>
        <CardHeader>
          <CardTitle>عناوين الزيارة</CardTitle>
          <Button variant="outline" size="sm" onClick={() => openAddress(null)}><Plus aria-hidden />عنوان جديد</Button>
        </CardHeader>
        <ul className="divide-y divide-border">
          {client.data.addresses.map(address => {
            const link = mapLink(address);
            return (
              <li key={address.id} className="flex items-start gap-4 px-5 py-4">
                <MapPin className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{formatAddress(address)}</p>
                  {address.instructions ? <p className="mt-1 text-xs text-muted-foreground">{address.instructions}</p> : null}
                  {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline-offset-4 hover:underline">فتح الموقع على الخريطة</a> : null}
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="تعديل العنوان" onClick={() => openAddress(address)}><Pencil /></Button>
              </li>
            );
          })}
        </ul>
      </Card>
      <EditClientDialog client={client.data} open={editOpen} onOpenChange={setEditOpen} />
      <AddressDialog clientId={client.data.id} address={editingAddress} open={addressOpen} onOpenChange={setAddressOpen} />
    </>
  );
}

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  return <AdminOnly><ClientScreen id={id} /></AdminOnly>;
}
