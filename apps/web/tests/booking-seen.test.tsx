import { afterEach, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bookingResponseSchema } from "@just4kids/contracts";
import { keys, useBooking, useInvoice, useDayBookings } from "@/lib/api/hooks";
import { sessionKey } from "@/lib/api/session";

const id = "11111111-1111-4111-8111-111111111111", addressId = "22222222-2222-4222-8222-222222222222", timestamp = "2026-10-13T00:00:00.000Z", phone = "+96550000001";
const address = { area: "الفنطاس", block: "1", street: "2", houseNumber: "3", buildingName: null, avenue: null, gate: null, blueNumber: null, floor: null, apartment: null, mapsUrl: null };
const invoice = { id: addressId, bookingId: id, reference: "J4K-1", issuedAt: timestamp, currency: "KWD", adultCount: 0, childCount: 1, specialChildCount: 0, notes: null, amountCash: "5.000", amountLink: "0.000", total: "5.000", status: "issued", paymentStatus: "unpaid", client: { phone }, address, employee: { id, displayName: "سالم" } };
const booking = (seen: string | null) => bookingResponseSchema.parse({ id, reference: "J4K-1", clientId: id, addressId, employeeId: id, date: "2099-01-05", startTime: "13:00", endTime: "13:30", timeZone: "Asia/Kuwait", adultCount: 0, childCount: 1, specialChildCount: 0, notes: null, seenByBarberAt: seen, source: "manual", visitStatus: "booked", visitVersion: 0, createdAt: timestamp, client: invoice.client, address, employee: invoice.employee, invoice });
// Any cached list that starts with this prefix carries the barber's "new booking" dots.
const listKey = [...keys.bookings, "list", "day", "2026-10-14", "all"];

function mount(hook: () => unknown, role: "admin" | "employee", body: object) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `/api/bookings/${id}` || url === `/api/bookings/${id}/invoice`) return new Response(JSON.stringify(body));
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  const queries = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  queries.setQueryData(sessionKey, { account: { id: "99999999-9999-4999-8999-999999999999", phone: "+96550000000", role }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  queries.setQueryData(listKey, { bookings: [], total: 0, limit: 100, offset: 0 });
  const Harness = () => { hook(); return null; };
  render(<QueryClientProvider client={queries}><Harness /></QueryClientProvider>);
  return queries;
}
const settled = (queries: QueryClient, key: readonly unknown[]) => waitFor(() => expect(queries.getQueryState(key)?.status).toBe("success"));
afterEach(() => vi.unstubAllGlobals());

it.each(["booking", "invoice"])("marks a freshly cached %s seen on a new open", async kind => {
  let reads = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    reads++;
    return new Response(JSON.stringify(kind === "booking" ? booking(timestamp) : invoice));
  }));
  const queries = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  queries.setQueryData(sessionKey, { account: { id, phone, role: "employee" }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  const key = kind === "booking" ? keys.booking(id) : [...keys.booking(id), "invoice"];
  queries.setQueryData(key, kind === "booking" ? booking(null) : invoice);
  const useRead = kind === "booking" ? useBooking : useInvoice;
  const Harness = () => { useRead(id); return null; };
  render(<QueryClientProvider client={queries}><Harness /></QueryClientProvider>);
  await waitFor(() => expect(reads).toBe(1));
  if (kind === "booking") await waitFor(() => expect(queries.getQueryData<ReturnType<typeof booking>>(key)?.seenByBarberAt).toBe(timestamp));
});

it("refreshes the barber's cached lists when they open a booking", async () => {
  const queries = mount(() => useBooking(id), "employee", booking(timestamp));
  await settled(queries, keys.booking(id));
  expect(queries.getQueryState(listKey)?.isInvalidated).toBe(true);
});

it("refreshes the barber's cached lists when they open an invoice", async () => {
  const queries = mount(() => useInvoice(id), "employee", invoice);
  await settled(queries, [...keys.booking(id), "invoice"]);
  expect(queries.getQueryState(listKey)?.isInvalidated).toBe(true);
});

it("does not refresh cached lists for the administrator", async () => {
  const queries = mount(() => useBooking(id), "admin", booking(timestamp));
  await settled(queries, keys.booking(id));
  expect(queries.getQueryState(listKey)?.isInvalidated).toBe(false);
});
it("invalidates after a delayed invoice has marked the booking seen", async () => {
  let finish!: (response: Response) => void;
  let seen = false;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/invoice")) return new Promise<Response>(resolve => { finish = response => { seen = true; resolve(response); }; });
    if (url.startsWith("/api/bookings?")) return new Response(JSON.stringify({bookings: [booking(seen ? timestamp : null)], total: 1, limit: 100, offset: 0}));
    throw new Error(url);
  }));
  const queries = new QueryClient({defaultOptions: {queries: {staleTime: Infinity, retry: false}}});
  queries.setQueryData(sessionKey, {account: {id, phone, role: "employee"}, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z"});
  queries.setQueryData(listKey, {bookings: [booking(null)], total: 1, limit: 100, offset: 0});
  const Harness = () => { useDayBookings("2026-10-14"); useInvoice(id); return null; };
  render(<QueryClientProvider client={queries}><Harness /></QueryClientProvider>);
  await waitFor(() => expect(finish).toBeDefined());
  await waitFor(() => expect(queries.getQueryState(listKey)?.isInvalidated).toBe(false));
  await act(async () => finish(new Response(JSON.stringify(invoice))));
  await settled(queries, [...keys.booking(id), "invoice"]);
  await waitFor(() => expect(queries.getQueryData<{bookings: ReturnType<typeof booking>[]}>(listKey)?.bookings[0]?.seenByBarberAt).toBe(timestamp));
});
