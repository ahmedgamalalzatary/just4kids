import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocationGate } from "@/components/location-gate";
import { sessionKey } from "@/lib/api/session";

type Success = (position: GeolocationPosition) => void;
type Failure = (error: GeolocationPositionError) => void;
let watchers: { success: Success; failure: Failure }[];
const fix = (latitude: number, longitude: number, accuracy = 10) => ({ coords: { latitude, longitude, accuracy }, timestamp: Date.now() }) as GeolocationPosition;
const failure = (code: number) => ({ code, message: "", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError;
const latest = () => watchers.at(-1)!;

function mount(geolocation: Partial<Geolocation> | null = {
  watchPosition: vi.fn((success: Success, error?: Failure | null) => { watchers.push({ success, failure: error! }); return watchers.length; }),
  clearWatch: vi.fn(),
  getCurrentPosition: vi.fn(),
}) {
  Object.defineProperty(navigator, "geolocation", { value: geolocation, configurable: true });
  const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const queries = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  queries.setQueryData(sessionKey, { account: { id: "11111111-1111-4111-8111-111111111111", phone: "+96550000000", role: "employee" }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  render(<QueryClientProvider client={queries}><LocationGate><p>Barber app</p></LocationGate></QueryClientProvider>);
  const reports = () => fetch.mock.calls.filter(([url]) => String(url) === "/api/locations/me");
  return { fetch, reports, geolocation };
}

beforeEach(() => { watchers = []; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("keeps the app closed until the first position arrives, then reports it", async () => {
  const { reports } = mount();
  expect(screen.queryByText("Barber app")).not.toBeInTheDocument();
  expect(screen.getByText("Waiting for your location…")).toBeInTheDocument();
  act(() => latest().success(fix(29.3375, 47.9744, 12.4)));
  expect(await screen.findByText("Barber app")).toBeInTheDocument();
  await waitFor(() => expect(reports()).toHaveLength(1));
  const [, init] = reports()[0]! as unknown as [string, RequestInit];
  expect(init.method).toBe("PUT");
  expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("csrf");
  expect(JSON.parse(String(init.body))).toEqual({ latitude: 29.3375, longitude: 47.9744, accuracy: 12.4 });
});

it("reports at most every 30 seconds while moving, and repeats the last position every 30 seconds while still", async () => {
  vi.useFakeTimers();
  const { reports } = mount();
  act(() => latest().success(fix(29.1, 47.1)));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(reports()).toHaveLength(1);
  act(() => latest().success(fix(29.2, 47.2)));
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(reports()).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(reports()).toHaveLength(2);
  expect(JSON.parse(String((reports()[1] as unknown as [string, RequestInit])[1].body))).toMatchObject({ latitude: 29.2, longitude: 47.2 });
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(reports()).toHaveLength(3);
});

it("blocks the app with only try again and log out when location is refused", async () => {
  const { fetch, geolocation } = mount();
  act(() => latest().failure(failure(1)));
  expect(await screen.findByRole("heading", { name: "Turn on location" })).toBeInTheDocument();
  expect(screen.queryByText("Barber app")).not.toBeInTheDocument();
  act(() => screen.getByRole("button", { name: "Try again" }).click());
  expect(geolocation!.watchPosition).toHaveBeenCalledTimes(2);
  act(() => screen.getByRole("button", { name: "Log out" }).click());
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url) === "/api/auth/logout")).toBe(true));
});

it("closes the app again if location is switched off later", async () => {
  mount();
  act(() => latest().success(fix(29.1, 47.1)));
  expect(await screen.findByText("Barber app")).toBeInTheDocument();
  act(() => latest().failure(failure(2)));
  expect(await screen.findByRole("heading", { name: "Turn on location" })).toBeInTheDocument();
  expect(screen.queryByText("Barber app")).not.toBeInTheDocument();
});

it("keeps sharing through a slow fix once a position is known", async () => {
  mount();
  act(() => latest().success(fix(29.1, 47.1)));
  expect(await screen.findByText("Barber app")).toBeInTheDocument();
  act(() => latest().failure(failure(3)));
  expect(screen.getByText("Barber app")).toBeInTheDocument();
});

it("blocks the app on a phone or browser without location", async () => {
  mount(null);
  expect(await screen.findByRole("heading", { name: "Turn on location" })).toBeInTheDocument();
});
