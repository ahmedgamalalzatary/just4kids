"use client";

import { useState } from "react";
import { Crosshair, ExternalLink, MapPinned } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { BarberMap, type MapFocus } from "@/components/barber-map";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBarberLocations } from "@/lib/api/hooks";
import { lastSeen, mapsLink, visitLine } from "@/lib/location";

function LiveLocations() {
  const locations = useBarberLocations();
  const [focus, setFocus] = useState<MapFocus>(null);
  const now = new Date();
  const barbers = locations.data ?? [];
  const located = barbers.filter(barber => barber.location);
  const liveCount = located.filter(barber => lastSeen(barber.location!.updatedAt, now).live).length;

  return (
    <>
      <PageHeader title="Live location" description="Where each barber is, from their phone while the app is open. Updates every 15 seconds." actions={locations.data ? <Badge variant="secondary">{liveCount} of {barbers.length} live</Badge> : null} />
      {locations.isPending ? <Card><LoadingRows rows={4} /></Card> : locations.isError ? <Card><ErrorState error={locations.error} onRetry={() => locations.refetch()} /></Card> : barbers.length === 0 ? (
        <Card><EmptyState icon={MapPinned} title="No active barbers" description="Barbers appear here once they sign in to the app." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card className="h-[60dvh] min-h-80 overflow-hidden p-0 lg:h-[calc(100dvh-12rem)]">
            <BarberMap barbers={located} focus={focus} now={now} />
          </Card>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {barbers.map(barber => {
                const seen = barber.location ? lastSeen(barber.location.updatedAt, now) : null;
                return (
                  <li key={barber.employeeId} className="flex flex-col gap-1.5 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{barber.displayName}</p>
                      {barber.location ? (
                        <Button variant="ghost" size="icon" aria-label={`Show ${barber.displayName} on the map`} onClick={() => setFocus({ id: barber.employeeId, at: Date.now() })}><Crosshair aria-hidden /></Button>
                      ) : null}
                    </div>
                    <p className="flex items-center gap-2 text-sm">
                      <span className={seen?.live ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-muted-foreground/40"} aria-hidden />
                      <span className={seen?.live ? "" : "text-muted-foreground"}>{seen ? seen.label : "Has not shared a location yet"}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{visitLine(barber.nextBooking)}</p>
                    {barber.location ? (
                      <a className="inline-flex items-center gap-1 self-start text-sm text-primary underline-offset-4 hover:underline" href={mapsLink(barber.location.latitude, barber.location.longitude)} target="_blank" rel="noreferrer">
                        Open in Google Maps<ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

export default function LocationsPage() {
  return <AdminOnly><LiveLocations /></AdminOnly>;
}
