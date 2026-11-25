"use client";

import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployees, useUpdateClient } from "@/lib/api/hooks";
import type { Client } from "@/lib/api/types";

const NONE = "none";

/** The client's favorite barber, chosen by hand; it has no effect on WhatsApp bookings. */
export function FavoriteBarber({ client }: { client: Client }) {
  const employees = useEmployees();
  const update = useUpdateClient();
  const current = client.favoriteBarber;
  // The saved favorite stays listed even while the barbers load or after the barber was disabled.
  const barbers = [...(employees.data ?? []).map(employee => ({ id: employee.id, name: employee.displayName }))];
  if (current && !barbers.some(barber => barber.id === current.id)) barbers.unshift(current);

  const choose = (value: string) => {
    const favoriteBarberId = value === NONE ? null : value;
    if (favoriteBarberId === (current?.id ?? null)) return;
    update.mutate({ id: client.id, favoriteBarberId }, { onSuccess: () => toast.success("Favorite barber saved") });
  };

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle>Favorite barber</CardTitle></CardHeader>
      <CardContent>
        <Select value={current?.id ?? NONE} onValueChange={choose} disabled={update.isPending}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Favorite barber"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No favorite barber</SelectItem>
            {barbers.map(barber => <SelectItem key={barber.id} value={barber.id}>{barber.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
