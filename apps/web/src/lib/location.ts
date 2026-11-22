import type { BarberLocation } from "@just4kids/contracts";
import { formatDateTime, formatTime } from "@/lib/kuwait-time";

/** A position younger than this counts as live; phones report every 30 seconds. */
export const LIVE_MS = 90_000;

export function lastSeen(updatedAt: string, now: Date): { live: boolean; label: string } {
  const age = now.getTime() - new Date(updatedAt).getTime();
  if (age < LIVE_MS) return { live: true, label: "Live now" };
  if (age < 3_600_000) return { live: false, label: `Last seen ${Math.max(1, Math.floor(age / 60_000))} min ago` };
  if (age < 86_400_000) return { live: false, label: `Last seen ${Math.floor(age / 3_600_000)} h ago` };
  return { live: false, label: `Last seen ${formatDateTime(updatedAt)}` };
}

export function mapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export function visitLine(visit: BarberLocation["nextBooking"]): string {
  if (!visit) return "No more visits today";
  return visit.visitStatus === "arrived" ? `At a visit until ${formatTime(visit.endTime)} · ${visit.area}` : `Next visit ${formatTime(visit.startTime)} · ${visit.area}`;
}
