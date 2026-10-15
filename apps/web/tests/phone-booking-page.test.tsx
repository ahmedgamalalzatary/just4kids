import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NewBookingPage from "@/app/(app)/bookings/new/page";
import { sessionKey } from "@/lib/api/session";
import { bookingResponseSchema } from "@just4kids/contracts";

const id = "11111111-1111-4111-8111-111111111111", addressId = "22222222-2222-4222-8222-222222222222", timestamp = "2026-10-13T00:00:00.000Z";
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => "/bookings/new", useSearchParams: () => new URLSearchParams(`barber=${id}&date=2099-01-05`) }));
const address = { area: "الفنطاس", block: "1", street: "2", houseNumber: "3", buildingName: null, avenue: null, gate: null, blueNumber: null, floor: null, apartment: null, mapsUrl: null };
function mount(known: boolean, failFirst = false, sendFails = 0, deferSend?: () => Promise<Response>) {
  let registered = known, posts = 0, sends = 0;
  const client = { id, phone: "+96550000001", enabled: true, createdAt: timestamp, updatedAt: timestamp, lastUsedAddressId: addressId, addresses: [{ ...address, id: addressId, clientId: id, createdAt: timestamp, updatedAt: timestamp }] };
  const invoice = { id: addressId, bookingId: id, reference: "J4K-TEST", issuedAt: timestamp, currency: "KWD", adultCount: 0, childCount: 1, specialChildCount: 0, notes: null, amountCash: "5.000", amountLink: "0.000", total: "5.000", status: "issued", paymentStatus: "unpaid", client: { phone: client.phone }, address, employee: { id, displayName: "سالم" } };
  const saved = bookingResponseSchema.parse({ id, reference: invoice.reference, clientId: id, addressId, employeeId: id, date: "2099-01-05", startTime: "13:00", endTime: "13:30", timeZone: "Asia/Kuwait", adultCount: 0, childCount: 1, specialChildCount: 0, notes: null, source: "manual", visitStatus: "booked", visitVersion: 0, createdAt: timestamp, client: invoice.client, address, employee: invoice.employee, invoice });
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/employees") return new Response(JSON.stringify({ employees: [{ id, displayName: "سالم", phone: "+96550000002", enabled: true, accessUntil: null, photoUpdatedAt: null, createdAt: timestamp, updatedAt: timestamp }] }));
    if (url === `/api/schedules/${id}`) return new Response(JSON.stringify({ employeeId: id, days: [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "15:00" }] }], exceptions: [], blocks: [] }));
    if (url.startsWith("/api/bookings?") || url.startsWith("/api/clients?")) return new Response(JSON.stringify({ bookings: [], clients: [], total: 0, limit: 20, offset: 0 }));
    if (url.startsWith("/api/areas")) return new Response(JSON.stringify({ areas: [{ id, name: address.area, enabled: true, createdAt: timestamp, updatedAt: timestamp }] }));
    if (url.startsWith("/api/clients/lookup")) return registered ? new Response(JSON.stringify(client)) : new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "غير موجود" } }), { status: 404 });
    if ((url === "/api/bookings" || url === "/api/bookings/with-client") && init?.method === "POST") {
      posts++;
      if (failFirst && posts === 1) { registered = true; return new Response(JSON.stringify({ error: { code: "PHONE_ALREADY_USED", message: "Phone number أصبح مسجلاً؛ أعد التحقق From بيانات Client" } }), { status: 409 }); }
      return new Response(JSON.stringify(saved), { status: 201 });
    }
    if (url === `/api/bookings/${id}/sent-to-barber` && init?.method === "POST") {
      if (deferSend) return deferSend();
      sends++;
      if (sends <= sendFails) return new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "تعذر" } }), { status: 500 });
      return new Response(JSON.stringify({ id, bookingId: id, kind: "sent_to_barber", actorAccountId: id, occurredAt: timestamp }), { status: 201 });
    }
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  const queries = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  queries.setQueryData(sessionKey, { account: { id, phone: "+96550000000", role: "admin" }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  render(<QueryClientProvider client={queries}><NewBookingPage /></QueryClientProvider>);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());
it("saves without opening WhatsApp when the administrator declines", async () => {
  const open = vi.spyOn(window, "open");
  const fetch = mount(true);
  await userEvent.type(screen.getByLabelText("Client phone number"), "50000001");
  await userEvent.click(await screen.findByRole("radio", { name: "1:00 PM" }));
  await userEvent.type(screen.getByLabelText("Cash (KWD)"), "5");
  const save = screen.getByRole("button", { name: "Save reservation and send WhatsApp" });
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);
  await screen.findByText("Reservation saved");
  expect(open).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "No, return to today's reservations" }));
  expect(navigation.push).toHaveBeenCalledWith("/bookings");
  expect(open).not.toHaveBeenCalled();
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
it.each([true, false])("saves the phone-first booking through the correct atomic endpoint (known=%s)", async known => {
  const fetch = mount(known);
  await userEvent.type(screen.getByLabelText("Client phone number"), "50000001");
  await userEvent.click(await screen.findByRole("radio", { name: "1:00 PM" }));
  if (!known) {
    await screen.findByRole("option", { name: "الفنطاس" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Area" }), "الفنطاس");
    for (const [label, value] of [["Block", "1"], ["Street", "2"], ["House number", "3"]]) await userEvent.type(screen.getByLabelText(label!), value!);
  }
  await userEvent.type(screen.getByLabelText("Cash (KWD)"), "5");
  const save = screen.getByRole("button", { name: "Save reservation and send WhatsApp" });
  await waitFor(() => expect(save).toBeEnabled()); await userEvent.click(save);
  await screen.findByText("Reservation saved");
  const call = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(call[0]).toBe(known ? "/api/bookings" : "/api/bookings/with-client");
  expect(JSON.parse(String(call[1]?.body))).toMatchObject(known ? { clientId: id, addressId } : { client: { phone: "+96550000001", address: { areaId: id } } });
  expect(new Headers(call[1]?.headers).get("X-CSRF-Token")).toBe("csrf");
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});

it("keeps the saved booking dialog mounted while the WhatsApp send is pending", async () => {
  let finish!: (response: Response) => void;
  const popup = { opener: {}, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  mount(true, false, 0, () => new Promise<Response>(resolve => { finish = resolve; }));
  await userEvent.type(screen.getByLabelText("Client phone number"), "50000001");
  await userEvent.click(await screen.findByRole("radio", { name: "1:00 PM" }));
  await userEvent.type(screen.getByLabelText("Cash (KWD)"), "5");
  const save = screen.getByRole("button", { name: "Save reservation and send WhatsApp" });
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);
  await screen.findByText("Reservation saved");
  await userEvent.click(screen.getByRole("button", { name: /Yes, open WhatsApp/ }));
  await waitFor(() => expect(finish).toBeDefined());
  expect(screen.getByRole("button", { name: /No, return/ })).toBeDisabled();
  await userEvent.keyboard("{Escape}");
  expect(navigation.push).not.toHaveBeenCalled();
  finish(new Response(JSON.stringify({ id, bookingId: id, kind: "sent_to_barber", actorAccountId: id, occurredAt: timestamp }), { status: 201 }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/bookings/${id}`));
});
it("retains the failed save message after lookup switches to an existing client and clears it for the next save", async () => {
  mount(false, true);
  await userEvent.type(screen.getByLabelText("Client phone number"), "50000001");
  await userEvent.click(await screen.findByRole("radio", { name: "1:00 PM" }));
  await screen.findByRole("option", { name: "الفنطاس" });
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Area" }), "الفنطاس");
  for (const [label, value] of [["Block", "1"], ["Street", "2"], ["House number", "3"]]) await userEvent.type(screen.getByLabelText(label!), value!);
  await userEvent.type(screen.getByLabelText("Cash (KWD)"), "5");
  const save = screen.getByRole("button", { name: "Save reservation and send WhatsApp" });
  await waitFor(() => expect(save).toBeEnabled()); await userEvent.click(save);
  await screen.findByRole("radio", { name: /الفنطاس/ });
  expect(screen.getByRole("alert")).toHaveTextContent("Phone number أصبح مسجلاً");
  await waitFor(() => expect(save).toBeEnabled()); await userEvent.click(save);
  await screen.findByText("Reservation saved");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("keeps the after-save dialog open and does not navigate when the send log fails, then sends on retry", async () => {
  const popup = { opener: {}, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  mount(true, false, 1);
  await userEvent.type(screen.getByLabelText("Client phone number"), "50000001");
  await userEvent.click(await screen.findByRole("radio", { name: "1:00 PM" }));
  await userEvent.type(screen.getByLabelText("Cash (KWD)"), "5");
  const save = screen.getByRole("button", { name: "Save reservation and send WhatsApp" });
  await waitFor(() => expect(save).toBeEnabled()); await userEvent.click(save);
  await screen.findByText("Reservation saved");
  const sendButton = screen.getByRole("button", { name: /Yes, open WhatsApp/ });
  await userEvent.click(sendButton);
  await screen.findByRole("alert");
  expect(popup.location.replace).not.toHaveBeenCalled();
  expect(popup.close).toHaveBeenCalledOnce();
  expect(navigation.push).not.toHaveBeenCalled();
  await userEvent.click(sendButton);
  await waitFor(() => expect(popup.location.replace).toHaveBeenCalledOnce());
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/bookings/${id}`));
});
