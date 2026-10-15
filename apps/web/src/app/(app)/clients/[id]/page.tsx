"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Ban, CalendarPlus, ChevronLeft, MapPin, Pencil, Plus, RotateCcw } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { AddressDialog, EditClientDialog } from "@/components/client-dialogs";
import { ClientStatusDialog } from "@/components/client-status-dialog";
import { ErrorState, LoadingRows, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClient, useClientStatusEvents } from "@/lib/api/hooks";
import type { Address } from "@/lib/api/types";
import { formatAddress, mapLink } from "@/lib/address";
import { clientStatusLabel } from "@/lib/clients";
import { formatDateTime } from "@/lib/kuwait-time";

function ClientScreen({ id }: { id: string }) {
  const client = useClient(id);
  const statusEvents = useClientStatusEvents(id);
  const [editOpen, setEditOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const openAddress = (address: Address | null) => { setEditingAddress(address); setAddressOpen(true); };

  const back = <Link href="/clients" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" aria-hidden />Clients</Link>;
  if (client.isPending) return <>{back}<LoadingRows /></>;
  if (client.isError) return <>{back}<ErrorState error={client.error} onRetry={() => client.refetch()} /></>;

  return (
    <>
      <PageHeader
        back={back}
        title={<span className="flex flex-wrap items-center gap-3">{client.data.phone}{client.data.enabled ? null : <Badge variant="muted">Stopped</Badge>}</span>}

        actions={(
          <>
            <Button variant="outline" onClick={() => setStatusOpen(true)}>{client.data.enabled ? <Ban aria-hidden /> : <RotateCcw aria-hidden />}{client.data.enabled ? "Stop client" : "Reactivate"}</Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil aria-hidden />Edit details</Button>
            <Button asChild><Link href={`/bookings/new?client=${client.data.id}`}><CalendarPlus aria-hidden />New reservation</Link></Button>
          </>
        )}
      />
      <Card className="mb-6">
        <CardHeader><CardTitle>Client status</CardTitle><span className="text-sm text-muted-foreground">Current status: {clientStatusLabel(client.data.enabled)}</span></CardHeader>
        <CardContent>
          {statusEvents.isPending ? <LoadingRows rows={1} /> : statusEvents.isError ? <ErrorState error={statusEvents.error} onRetry={() => statusEvents.refetch()} /> : statusEvents.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status changes recorded.</p>
          ) : (
            <ul className="divide-y divide-border">
              {statusEvents.data.map(event => (
                <li key={event.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{event.enabled ? "Reactivate" : "Stop"}</p>
                    <p className="text-muted-foreground">{event.reason}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Visit addresses</CardTitle>
          <Button variant="outline" size="sm" onClick={() => openAddress(null)}><Plus aria-hidden />New address</Button>
        </CardHeader>
        <ul className="divide-y divide-border">
          {client.data.addresses.map(address => {
            const link = mapLink(address);
            return (
              <li key={address.id} className="flex items-start gap-4 px-5 py-4">
                <MapPin className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{formatAddress(address)}</p>

                  {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline-offset-4 hover:underline">Open location on map</a> : null}
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Edit address" onClick={() => openAddress(address)}><Pencil /></Button>
              </li>
            );
          })}
        </ul>
      </Card>
      <EditClientDialog client={client.data} open={editOpen} onOpenChange={setEditOpen} />
      <AddressDialog clientId={client.data.id} address={editingAddress} open={addressOpen} onOpenChange={setAddressOpen} />
      <ClientStatusDialog client={client.data} open={statusOpen} onOpenChange={setStatusOpen} />
    </>
  );
}

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  return <AdminOnly><ClientScreen id={id} /></AdminOnly>;
}
