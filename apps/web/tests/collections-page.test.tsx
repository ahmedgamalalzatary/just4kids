import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bookingResponseSchema } from "@just4kids/contracts";
import CollectionsPage from "@/app/(app)/collections/page";
import { sessionKey } from "@/lib/api/session";

// Radix Select uses pointer capture and scrolling that jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

it("preserves cash entered while completed visits are still loading", async () => {
  let finish!: (response: Response) => void;
  mount({ loadVisits: () => new Promise<Response>(resolve => { finish = resolve; }) });
  await userEvent.click(await screen.findByRole("button", { name: /New entry/ }));
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: "سالم" }));
  await waitFor(() => expect(finish).toBeDefined());
  const cash = screen.getByLabelText("Cash (KWD)");
  await userEvent.clear(cash);
  await userEvent.type(cash, "9.000");
  await act(async () => finish(new Response(JSON.stringify({ bookings: [completed], total: 1, limit: 100, offset: 0 }))));
  await waitFor(() => expect(screen.getByLabelText("Other children")).toHaveValue(2));
  expect(cash).toHaveValue("9.000");
});

it("prefills completed visits beyond the first page of cancelled bookings", async () => {
  mount({ loadVisits: async url => {
    const offset = Number(new URL(url, "http://test").searchParams.get("offset"));
    return new Response(JSON.stringify({ bookings: offset === 0 ? Array.from({ length: 100 }, () => ({ ...completed, visitStatus: "cancelled" })) : [completed], total: 101, limit: 100, offset }));
  } });
  await userEvent.click(await screen.findByRole("button", { name: /New entry/ }));
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: "سالم" }));
  await waitFor(() => expect(screen.getByLabelText("Other children")).toHaveValue(2));
});

it("shows failed prefill with retry and prevents saving incomplete totals", async () => {
  let attempts = 0;
  mount({ loadVisits: async () => ++attempts === 1
    ? new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "تعذر تحميل الزيارات" } }), { status: 500 })
    : new Response(JSON.stringify({ bookings: [completed], total: 1, limit: 100, offset: 0 })) });
  await userEvent.click(await screen.findByRole("button", { name: /New entry/ }));
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: "سالم" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل الزيارات");
  expect(screen.getByRole("button", { name: "Save collection" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByLabelText("Other children")).toHaveValue(2));
  expect(screen.getByRole("button", { name: "Save collection" })).toBeEnabled();
});

const id = "11111111-1111-4111-8111-111111111111", entryId = "33333333-3333-4333-8333-333333333333", addressId = "22222222-2222-4222-8222-222222222222", timestamp = "2026-10-13T00:00:00.000Z", phone = "+96550000001";
const address = { area: "الفنطاس", block: "1", street: "2", houseNumber: "3", buildingName: null, avenue: null, gate: null, blueNumber: null, floor: null, apartment: null, mapsUrl: null };
const client = { phone };
const barber = { id, displayName: "سالم" };
const completed = bookingResponseSchema.parse({ id, reference: "J4K-1", clientId: id, addressId, employeeId: id, date: "2099-01-05", startTime: "13:00", endTime: "13:30", timeZone: "Asia/Kuwait", adultCount: 0, childCount: 3, specialChildCount: 1, notes: null, source: "manual", visitStatus: "completed", visitVersion: 0, createdAt: timestamp, client, address, employee: barber });
const entry = { id: entryId, version: 1, employeeId: id, displayName: "سالم", date: "2099-01-05", normalChildren: 2, specialChildren: 1, cash: "6.000", link: "1.000", knet: "0.000", total: "7.000", enteredBy: id, createdAt: timestamp, updatedAt: timestamp };
const snapshot = (cash: string, total: string) => ({ employeeId: id, date: "2099-01-05", normalChildren: 2, specialChildren: 1, cash, link: "1.000", knet: "0.000", total });
const history = [
  { id: "h1", entryId, actorAccountId: id, occurredAt: timestamp, before: null, after: snapshot("6.000", "7.000") },
  { id: "h2", entryId, actorAccountId: id, occurredAt: timestamp, before: snapshot("5.000", "6.000"), after: snapshot("6.000", "7.000") },
];

function mount({ entries = [], events = [], emptyDate = "", loadVisits }: { entries?: object[]; events?: object[]; emptyDate?: string; loadVisits?: (url: string) => Promise<Response> } = {}) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/employees") return new Response(JSON.stringify({ employees: [{ id, displayName: "سالم", phone: "+96550000002", enabled: true, accessUntil: null, photoUpdatedAt: null, createdAt: timestamp, updatedAt: timestamp }] }));
    if (url === `/api/collections/${entryId}/history`) return new Response(JSON.stringify({ events }));
    if (url === "/api/collections" && init?.method === "POST") return new Response(JSON.stringify(entry), { status: 201 });
    if (url.startsWith("/api/collections?")) return new Response(JSON.stringify({ timeZone: "Asia/Kuwait", from: null, to: null, entries, totals: { normalChildren: 0, specialChildren: 0, cash: "0.000", link: "0.000", knet: "0.000", total: "0.000" } }));
    if (url.startsWith("/api/bookings?") && loadVisits) return loadVisits(url);
    if (url.startsWith("/api/bookings?")) {
      const date = new URL(url, "http://test").searchParams.get("date");
      const bookings = date === emptyDate ? [] : [{ ...completed, date }];
      return new Response(JSON.stringify({ bookings, total: bookings.length, limit: 100, offset: 0 }));
    }
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  const queries = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  queries.setQueryData(sessionKey, { account: { id, phone: "+96550000000", role: "admin" }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  render(<QueryClientProvider client={queries}><CollectionsPage /></QueryClientProvider>);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

it("pre-fills a new daily collection from that day's completed visits", async () => {
  mount();
  await userEvent.click(await screen.findByRole("button", { name: /New entry/ }));
  const dialog = within(await screen.findByRole("dialog"));
  await userEvent.click(dialog.getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: "سالم" }));
  await waitFor(() => expect(screen.getByLabelText("Other children")).toHaveValue(2));
  expect(screen.getByLabelText("Children with special needs")).toHaveValue(1);
  expect(screen.getByText(/Filled from today's completed visits/)).toBeInTheDocument();
});

it("shows an entry's stored edit history with the before and after values", async () => {
  mount({ entries: [entry], events: history });
  await userEvent.click(await screen.findByRole("button", { name: "Edit entry" }));
  const region = within(await screen.findByRole("region", { name: "Edit history" }));
  expect(region.getByText("Cash: 5.000 → 6.000")).toBeInTheDocument();
  expect(region.getByText("Entry created")).toBeInTheDocument();
});

it("clears prior totals when changing to an empty day", async () => {
  const fetch = mount({ emptyDate: "2099-01-06" });
  await userEvent.click(await screen.findByRole("button", { name: /New entry/ }));
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: "سالم" }));
  await waitFor(() => expect(screen.getByLabelText("Other children")).toHaveValue(2));
  const date = screen.getByLabelText("Date");
  await userEvent.clear(date);
  await userEvent.type(date, "2099-01-06");
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes("date=2099-01-06"))).toBe(true));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save collection" })).toBeEnabled());
  expect(screen.getByLabelText("Other children")).toHaveValue(0);
  expect(screen.getByLabelText("Children with special needs")).toHaveValue(0);
});

it("starts a new entry with empty inputs and a zero total", async () => {
  mount();
  await userEvent.click(await screen.findByRole("button", { name: /New entry/ }));
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByLabelText("Other children")).toHaveValue(null);
  expect(dialog.getByLabelText("Children with special needs")).toHaveValue(null);
  expect(dialog.getByLabelText("Cash (KWD)")).toHaveValue("");
  expect(dialog.getByLabelText("Payment link (KWD)")).toHaveValue("");
  expect(dialog.getByLabelText("KNET (KWD)")).toHaveValue("");
  expect(dialog.getByText("0.000 KWD")).toBeInTheDocument();
});

it("sends zero values when empty fields are saved", async () => {
  const fetch = mount();
  await userEvent.click(await screen.findByRole("button", { name: /New entry/ }));
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: "سالم" }));
  await waitFor(() => expect(screen.getByLabelText("Other children")).toHaveValue(2));
  for (const label of ["Other children", "Children with special needs", "Cash (KWD)", "Payment link (KWD)", "KNET (KWD)"]) {
    await userEvent.clear(screen.getByLabelText(label));
  }
  await userEvent.click(screen.getByRole("button", { name: "Save collection" }));
  await waitFor(() => expect(fetch.mock.calls.some(([url, init]) => String(url) === "/api/collections" && init?.method === "POST")).toBe(true));
  const [, request] = fetch.mock.calls.find(([url, init]) => String(url) === "/api/collections" && init?.method === "POST")!;
  expect(JSON.parse(String(request?.body))).toMatchObject({ normalChildren: 0, specialChildren: 0, cash: "0.000", link: "0.000", knet: "0.000" });
});
