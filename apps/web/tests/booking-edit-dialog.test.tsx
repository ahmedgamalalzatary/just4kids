import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bookingResponseSchema } from "@just4kids/contracts";
import { BookingEditDialog } from "@/components/booking-edit-dialog";
import { keys } from "@/lib/api/hooks";
import { sessionKey } from "@/lib/api/session";

const id = "11111111-1111-4111-8111-111111111111";
const address = { area: "Hawally", block: "3", street: "5", houseNumber: "12", buildingName: null, avenue: null, gate: null, blueNumber: null, floor: "2", apartment: null, mapsUrl: null };
const booking = bookingResponseSchema.parse({ id, reference: "J4K-EDIT", clientId: id, addressId: id, employeeId: id, date: "2099-01-05", startTime: "13:00", endTime: "14:00", timeZone: "Asia/Kuwait", adultCount: 0, childCount: 1, visitStatus: "booked", visitVersion: 0, createdAt: "2026-10-13T00:00:00.000Z", client: { phone: "+96550000001" }, address, employee: { id, displayName: "Lenny" } });

function mount() {
  const queries = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  queries.setQueryData(sessionKey, { account: { id, phone: "+96550000000", role: "admin" }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  queries.setQueryData(keys.client(id), { id, addresses: [{ id, ...address }] });
  queries.setQueryData(keys.employees, [{ id, displayName: "Lenny", enabled: true }]);
  queries.setQueryData([...keys.areas, "active"], [{ id, name: "Hawally" }]);
  const writes: unknown[] = [];
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === `/api/bookings/${id}` && init?.method === "PATCH") {
      writes.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ...booking, visitVersion: 1 }), { status: 200 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  render(<QueryClientProvider client={queries}><BookingEditDialog booking={booking} open onOpenChange={() => {}} /></QueryClientProvider>);
  return writes;
}

afterEach(() => vi.unstubAllGlobals());

it("edits the reservation address in place and sends all saved details with its version", async () => {
  const writes = mount();
  await userEvent.click(screen.getByRole("button", { name: "Edit reservation address" }));
  expect(screen.getByLabelText(/^Floor/)).toHaveValue("2");
  await userEvent.clear(screen.getByLabelText("Street"));
  await userEvent.type(screen.getByLabelText("Street"), "New street");
  await userEvent.type(screen.getByLabelText(/^Gate/), "B");
  await userEvent.click(screen.getByRole("button", { name: "Save edit" }));
  await waitFor(() => expect(writes).toEqual([{ expectedVersion: 0, address: { ...address, street: "New street", gate: "B" } }]));
});

it("keeps an incomplete address in the editor instead of saving it", async () => {
  const writes = mount();
  await userEvent.click(screen.getByRole("button", { name: "Edit reservation address" }));
  await userEvent.clear(screen.getByLabelText("Street"));
  await userEvent.click(screen.getByRole("button", { name: "Save edit" }));
  expect(await screen.findByText("Enter the street")).toBeInTheDocument();
  expect(writes).toEqual([]);
});
