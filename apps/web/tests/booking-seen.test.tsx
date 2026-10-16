import { afterEach, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bookingResponseSchema } from "@just4kids/contracts";
import { keys, useBooking } from "@/lib/api/hooks";
import { sessionKey } from "@/lib/api/session";

const id = "11111111-1111-4111-8111-111111111111", addressId = "22222222-2222-4222-8222-222222222222", timestamp = "2026-10-13T00:00:00.000Z", phone = "+96550000001";
const address = { area: "الفنطاس", block: "1", street: "2", houseNumber: "3", buildingName: null, avenue: null, gate: null, blueNumber: null, floor: null, apartment: null, mapsUrl: null };
const booking = (seen: string | null) => bookingResponseSchema.parse({ id, reference: "J4K-1", clientId: id, addressId, employeeId: id, date: "2099-01-05", startTime: "13:00", endTime: "13:30", timeZone: "Asia/Kuwait", adultCount: 0, childCount: 1, specialChildCount: 0, notes: null, seenByBarberAt: seen, source: "manual", visitStatus: "booked", visitVersion: 0, createdAt: timestamp, client: { phone }, address, employee: { id, displayName: "سالم" } });
// Any cached list that starts with this prefix carries the barber's "new booking" dots.
const listKey = [...keys.bookings, "list", "day", "2026-10-14", "all"];

function mount(role: "admin" | "employee", body: object) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `/api/bookings/${id}`) return new Response(JSON.stringify(body));
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  const queries = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  queries.setQueryData(sessionKey, { account: { id: "99999999-9999-4999-8999-999999999999", phone: "+96550000000", role }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  queries.setQueryData(listKey, { bookings: [], total: 0, limit: 100, offset: 0 });
  const Harness = () => { useBooking(id); return null; };
  render(<QueryClientProvider client={queries}><Harness /></QueryClientProvider>);
  return queries;
}
const settled = (queries: QueryClient, key: readonly unknown[]) => waitFor(() => expect(queries.getQueryState(key)?.status).toBe("success"));
afterEach(() => vi.unstubAllGlobals());

it("marks a freshly cached booking seen on a new open", async () => {
  let reads = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    reads++;
    return new Response(JSON.stringify(booking(timestamp)));
  }));
  const queries = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  queries.setQueryData(sessionKey, { account: { id, phone, role: "employee" }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  queries.setQueryData(keys.booking(id), booking(null));
  const Harness = () => { useBooking(id); return null; };
  render(<QueryClientProvider client={queries}><Harness /></QueryClientProvider>);
  await waitFor(() => expect(reads).toBe(1));
  await waitFor(() => expect(queries.getQueryData<ReturnType<typeof booking>>(keys.booking(id))?.seenByBarberAt).toBe(timestamp));
});

it("refreshes the barber's cached lists when they open a booking", async () => {
  const queries = mount("employee", booking(timestamp));
  await settled(queries, keys.booking(id));
  expect(queries.getQueryState(listKey)?.isInvalidated).toBe(true);
});

it("does not refresh cached lists for the administrator", async () => {
  const queries = mount("admin", booking(timestamp));
  await settled(queries, keys.booking(id));
  expect(queries.getQueryState(listKey)?.isInvalidated).toBe(false);
});
