"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, LogOut, MapPinOff, RotateCw } from "lucide-react";
import { LOCATION_REPORT_MS, type LocationUpdate } from "@just4kids/contracts";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/client";
import { sessionKey, useLogout } from "@/lib/api/session";
import type { Session } from "@/lib/api/types";

type Status = "waiting" | "sharing" | "off";

/**
 * Barbers use the app only while sharing their location: the phone reports its position every 30 seconds,
 * and if location is refused or switched off the app closes until it is turned back on or the barber logs out.
 */
export function LocationGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const logout = useLogout();
  const [status, setStatus] = useState<Status>("waiting");
  const [attempt, setAttempt] = useState(0);
  const latest = useRef<LocationUpdate | null>(null);
  const lastSent = useRef(0);
  // The shell renders this only in the browser, once the session has loaded.
  const supported = typeof navigator !== "undefined" && Boolean(navigator.geolocation?.watchPosition);

  useEffect(() => {
    if (!supported) return;
    const geolocation = navigator.geolocation;
    let known = false;
    const send = () => {
      if (!latest.current) return;
      lastSent.current = Date.now();
      const csrfToken = queryClient.getQueryData<Session | null>(sessionKey)?.csrfToken;
      // A failed report is simply retried with the next one.
      void apiRequest<void>("/locations/me", { method: "PUT", body: latest.current, csrfToken }).catch(() => undefined);
    };
    const watch = geolocation.watchPosition(position => {
      known = true;
      latest.current = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
      setStatus("sharing");
      if (Date.now() - lastSent.current >= LOCATION_REPORT_MS) send();
    }, error => {
      // A slow fix is not a refusal once the phone has a position.
      if (error.code === error.TIMEOUT && known) return;
      known = false;
      latest.current = null;
      setStatus("off");
    }, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 60_000 });
    // A still phone may not report new positions, so the last one is repeated to keep it current.
    const timer = setInterval(() => { if (Date.now() - lastSent.current >= LOCATION_REPORT_MS - 1_000) send(); }, LOCATION_REPORT_MS);
    // Coming back to the app reports straight away instead of waiting for the next tick.
    const onVisible = () => { if (document.visibilityState === "visible") { lastSent.current = 0; send(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { geolocation.clearWatch(watch); clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [attempt, queryClient, supported]);

  const shown: Status = supported ? status : "off";
  if (shown === "sharing") return children;

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <Wordmark />
        {shown === "waiting" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Waiting for your location…
          </p>
        ) : (
          <>
            <span className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground"><MapPinOff className="size-5" aria-hidden /></span>
            <div className="flex flex-col gap-2">
              <h1 className="text-xl font-semibold">Turn on location</h1>
              <p className="text-sm text-muted-foreground">The app works only while your location is shared. Turn on location on your phone and allow it for this site, then try again.</p>
            </div>
          </>
        )}
        <div className="flex w-full flex-col gap-2">
          {shown === "off" ? <Button onClick={() => { setStatus("waiting"); setAttempt(value => value + 1); }}><RotateCw aria-hidden />Try again</Button> : null}
          <Button variant="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut aria-hidden />Log out</Button>
        </div>
      </div>
    </div>
  );
}
