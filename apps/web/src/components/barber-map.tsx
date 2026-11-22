"use client";

import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { BarberLocation } from "@just4kids/contracts";
import { lastSeen } from "@/lib/location";

// Kuwait City, used until the first barber position arrives.
const KUWAIT: [number, number] = [29.3759, 47.9774];
const escape = (text: string) => text.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);

type Leaflet = typeof import("leaflet");

/** An OpenStreetMap map with one labelled pin per barber; live pins are green, older ones grey. */
export type MapFocus = { id: string; at: number } | null;

export function BarberMap({ barbers, focus, now }: { barbers: BarberLocation[]; focus: MapFocus; now: Date }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<{ leaflet: Leaflet; map: LeafletMap; pins: LayerGroup; fitted: boolean } | null>(null);
  const latest = useRef({ barbers, now });

  const draw = () => {
    const current = map.current;
    if (!current) return;
    const { leaflet: L, pins } = current;
    pins.clearLayers();
    const points: [number, number][] = [];
    for (const barber of latest.current.barbers) {
      if (!barber.location) continue;
      const { live, label } = lastSeen(barber.location.updatedAt, latest.current.now);
      const point: [number, number] = [barber.location.latitude, barber.location.longitude];
      points.push(point);
      const icon = L.divIcon({
        className: "",
        iconSize: [0, 0],
        html: `<div style="transform:translate(-50%,-100%)" class="flex flex-col items-center"><span class="whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold shadow ${live ? "bg-emerald-600 text-white" : "bg-zinc-500 text-white"}">${escape(barber.displayName)}</span><span class="size-3 rounded-full border-2 border-white shadow ${live ? "bg-emerald-600" : "bg-zinc-500"}"></span></div>`,
      });
      L.marker(point, { icon, title: barber.displayName }).bindPopup(`<strong>${escape(barber.displayName)}</strong><br>${escape(label)}<br>±${barber.location.accuracy} m`).addTo(pins);
      if (barber.location.accuracy > 0) L.circle(point, { radius: barber.location.accuracy, weight: 1, opacity: 0.4, fillOpacity: 0.08, color: live ? "#059669" : "#71717a" }).addTo(pins);
    }
    // The view fits everyone once; after that the administrator's own panning and zoom are kept.
    if (!current.fitted && points.length > 0) {
      current.map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 });
      current.fitted = true;
    }
  };

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then(L => {
      if (cancelled || !container.current) return;
      const instance = L.map(container.current, { center: KUWAIT, zoom: 11 });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(instance);
      map.current = { leaflet: L, map: instance, pins: L.layerGroup().addTo(instance), fitted: false };
      draw();
    });
    return () => { cancelled = true; map.current?.map.remove(); map.current = null; };
  }, []);

  // draw reads the latest props through a ref, so the map itself is built only once.
  useEffect(() => { latest.current = { barbers, now }; draw(); });

  // Picking a barber centres the map once; later updates do not pull the view back.
  useEffect(() => {
    const current = map.current;
    const barber = latest.current.barbers.find(item => item.employeeId === focus?.id);
    if (current && barber?.location) current.map.setView([barber.location.latitude, barber.location.longitude], Math.max(current.map.getZoom(), 15));
  }, [focus]);

  return <div ref={container} className="size-full" role="region" aria-label="Barbers map" />;
}
