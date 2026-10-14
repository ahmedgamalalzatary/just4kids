import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PhoneBookingClient } from "@/components/phone-booking-client";

const id = "11111111-1111-4111-8111-111111111111", secondId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-10-13T00:00:00.000Z";
const address = { id, clientId: id, area: "الفنطاس", block: "1", street: "2", houseNumber: "3", buildingName: null, avenue: null, gate: null, blueNumber: null, floor: null, apartment: null, instructions: null, mapsUrl: null, latitude: null, longitude: null, createdAt: timestamp, updatedAt: timestamp };
const client = { id, name: "مريم", phone: "+96550000001", enabled: true, createdAt: timestamp, updatedAt: timestamp, addresses: [address, { ...address, id: secondId, street: "جديد" }], lastUsedAddressId: secondId };
function mount(mode: "found" | "new" | "stopped" | "error" = "found") {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).startsWith("/api/areas")) return new Response(JSON.stringify({ areas: [{ id, name: "الفنطاس", enabled: true, createdAt: timestamp, updatedAt: timestamp }] }));
    if (String(input).startsWith("/api/clients/lookup")) {
      if (mode === "new") return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "العميل غير موجود" } }), { status: 404 });
      if (mode === "error") return new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "تعذر البحث" } }), { status: 500 });
      return new Response(JSON.stringify({ ...client, enabled: mode !== "stopped" }));
    }
    throw new Error(`Unexpected request ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetch);
  const selection = vi.fn();
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  render(<QueryClientProvider client={queries}><PhoneBookingClient onSelection={selection} /></QueryClientProvider>);
  return { selection, fetch, queries };
}
afterEach(() => vi.unstubAllGlobals());
it("looks up eight local digits and selects the last-used address", async () => {
  const { selection, fetch } = mount();
  await userEvent.type(screen.getByLabelText("رقم هاتف العميل"), "50000001");
  await screen.findByText("مريم");
  expect(screen.getByRole("radio", { name: /جديد/ })).toHaveAttribute("aria-checked", "true");
  await waitFor(() => expect(selection).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "existing", address: expect.objectContaining({ id: secondId }) })));
  expect(String(fetch.mock.calls[0]?.[0])).toContain("phone=%2B96550000001");
  await userEvent.clear(screen.getByLabelText("رقم هاتف العميل"));
  expect(selection).toHaveBeenLastCalledWith(null);
  expect(screen.queryByText("مريم")).not.toBeInTheDocument();
});
it("shows inline fields for an unknown phone and permits a blank name only when the address is valid", async () => {
  const { selection } = mount("new");
  await userEvent.type(screen.getByLabelText("رقم هاتف العميل"), "50000001");
  await screen.findByText(/عميل جديد/);
  await screen.findByRole("option", { name: "الفنطاس" });
  expect(selection).toHaveBeenLastCalledWith(null);
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "المنطقة" }), "الفنطاس");
  for (const [label, value] of [["القطعة", "1"], ["الشارع", "2"], ["رقم المنزل", "3"]]) await userEvent.type(screen.getByLabelText(label!), value!);
  await waitFor(() => expect(selection).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "new", client: expect.objectContaining({ phone: "+96550000001", address: expect.objectContaining({ areaId: id, houseNumber: "3" }) }) })));
});
it("blocks a stopped client and never displays new-client fields", async () => {
  const { selection } = mount("stopped");
  await userEvent.type(screen.getByLabelText("رقم هاتف العميل"), "50000001");
  expect(await screen.findByRole("alert")).toHaveTextContent("موقوف");
  expect(selection).toHaveBeenLastCalledWith(null);
  expect(screen.queryByLabelText(/اسم العميل/)).not.toBeInTheDocument();
});
it("preserves inline address fields and the selection during a same-phone background recheck", async () => {
  const { selection, fetch, queries } = mount("new");
  await userEvent.type(screen.getByLabelText("رقم هاتف العميل"), "50000001");
  await screen.findByRole("option", { name: "الفنطاس" });
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "المنطقة" }), "الفنطاس");
  for (const [label, value] of [["القطعة", "1"], ["الشارع", "2"], ["رقم المنزل", "3"]]) await userEvent.type(screen.getByLabelText(label!), value!);
  await waitFor(() => expect(selection).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "new" })));
  const street = screen.getByLabelText("الشارع");
  let finish!: (response: Response) => void;
  fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  let refresh!: Promise<void>;
  act(() => { refresh = queries.invalidateQueries({ queryKey: ["clients", "lookup", "+96550000001"] }); });
  await waitFor(() => expect(finish).toBeDefined());
  try {
    expect(screen.getByLabelText("الشارع")).toBe(street);
    expect(street).toHaveValue("2");
    expect(selection).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "new" }));
  } finally {
    await act(async () => { finish(new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "غير موجود" } }), { status: 404 })); await refresh; });
  }
  expect(screen.getByLabelText("الشارع")).toBe(street);
  expect(street).toHaveValue("2");
});
it("treats lookup errors as errors, with retry, rather than a new client", async () => {
  mount("error");
  await userEvent.type(screen.getByLabelText("رقم هاتف العميل"), "50000001");
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر البحث");
  expect(screen.queryByLabelText(/اسم العميل/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
});
it("ignores a late lookup response after the phone number changes", async () => {
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("50000001") ? new Promise<Response>(resolve => { resolveOld = resolve; }) : Promise.resolve(new Response(JSON.stringify({ ...client, name: "عميل آخر", phone: "+96550000002" })))));
  const selection = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PhoneBookingClient onSelection={selection} /></QueryClientProvider>);
  const phone = screen.getByLabelText("رقم هاتف العميل");
  await userEvent.type(phone, "50000001");
  await waitFor(() => expect(resolveOld).toBeDefined());
  await userEvent.clear(phone); await userEvent.type(phone, "50000002");
  await screen.findByText("عميل آخر");
  resolveOld(new Response(JSON.stringify(client)));
  await waitFor(() => expect(selection).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "existing", client: expect.objectContaining({ phone: "+96550000002" }) })));
  expect(screen.queryByText("مريم")).not.toBeInTheDocument();
});
