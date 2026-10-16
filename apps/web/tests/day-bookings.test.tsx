import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bookingResponseSchema } from "@just4kids/contracts";
import { WhatsAppButton } from "@/components/day-bookings";
import { sessionKey } from "@/lib/api/session";

const id = "11111111-1111-4111-8111-111111111111", timestamp = "2026-10-13T00:00:00.000Z", phone = "+96550000002";
const address = { area: "الفنطاس", block: "1", street: "2", houseNumber: "3", buildingName: null, avenue: null, gate: null, blueNumber: null, floor: null, apartment: null, mapsUrl: null };
const booking = bookingResponseSchema.parse({ id, reference: "J4K-TEST", clientId: id, addressId: id, employeeId: id, date: "2099-01-05", startTime: "13:00", endTime: "13:30", timeZone: "Asia/Kuwait", adultCount: 0, childCount: 1, specialChildCount: 0, notes: null, source: "manual", visitStatus: "booked", visitVersion: 0, createdAt: timestamp, client: { phone }, address, employee: { id, displayName: "سالم" } });

function mount(send: (attempt: number) => Response | Promise<Response>) {
  let attempt = 0;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `/api/bookings/${id}/sent-to-barber` && init?.method === "POST") return send(++attempt);
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  const queries = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  queries.setQueryData(sessionKey, { account: { id, phone: "+96550000000", role: "admin" }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  render(<QueryClientProvider client={queries}><WhatsAppButton booking={booking} barberPhone={phone} /></QueryClientProvider>);
  return fetch;
}
const ok = () => new Response(JSON.stringify({ id, bookingId: id, kind: "sent_to_barber", actorAccountId: id, occurredAt: timestamp }), { status: 201 });
const fail = () => new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "تعذر" } }), { status: 500 });
afterEach(() => vi.unstubAllGlobals());

it("does not open WhatsApp until the send is recorded, and opens it on retry", async () => {
  const popup = { opener: {}, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  mount(attempt => attempt === 1 ? fail() : ok());
  const button = screen.getByRole("button", { name: /WhatsApp/ });
  await userEvent.click(button);
  await screen.findByRole("alert");
  expect(popup.location.replace).not.toHaveBeenCalled();
  expect(popup.close).toHaveBeenCalledOnce();
  await userEvent.click(button);
  await waitFor(() => expect(popup.location.replace).toHaveBeenCalledOnce());
  expect(String(popup.location.replace.mock.calls[0]![0])).toContain("wa.me");
  expect(popup.opener).toBeNull();
});

it("reserves a tab during the click and keeps it blank until logging succeeds", async () => {
  let finish!: (response: Response) => void;
  const popup = { opener: {}, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
  const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  mount(() => new Promise<Response>(resolve => { finish = resolve; }));
  const button = screen.getByRole("button", { name: /WhatsApp/ });
  await userEvent.click(button);
  expect(open).toHaveBeenCalledWith("about:blank", "_blank");
  expect(popup.opener).toBeNull();
  expect(button).toBeDisabled();
  expect(popup.location.replace).not.toHaveBeenCalled();
  finish(ok());
  await waitFor(() => expect(popup.location.replace).toHaveBeenCalledOnce());
});

it("reports a blocked popup without recording a send and lets the user retry", async () => {
  const popup = { opener: {}, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValueOnce(null).mockReturnValue(popup as unknown as Window);
  const fetch = mount(ok);
  const button = screen.getByRole("button", { name: /WhatsApp/ });
  await userEvent.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent("pop-ups");
  expect(fetch).not.toHaveBeenCalled();
  await userEvent.click(button);
  await waitFor(() => expect(popup.location.replace).toHaveBeenCalledOnce());
});
