import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bookingResponseSchema } from "@just4kids/contracts";
import { keys } from "@/lib/api/hooks";
import { sessionKey } from "@/lib/api/session";
import type { Employee, Schedule } from "@/lib/api/types";
import { SlotPills } from "@/components/booking-slot-pills";

const id = "11111111-1111-4111-8111-111111111111", blockId = "22222222-2222-4222-8222-222222222222";
const date = "2099-01-05";
const barber: Employee = { id, phone: "+96550000000", displayName: "أحمد", enabled: true, photoUpdatedAt: null, accessUntil: null, createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z" };
const block = { id: blockId, employeeId: id, date, startTime: "13:00", endTime: "13:30", reason: "موعد Special", createdBy: id, createdAt: "2026-10-13T00:00:00.000Z" };
const initial: Schedule = { employeeId: id, days: [{ dayOfWeek: 1, active: true, intervals: [{ startTime: "09:00", endTime: "15:00" }] }], exceptions: [], blocks: [] };
const address = { area: "الفنطاس", block: "1", street: "2", houseNumber: "3", buildingName: null, avenue: null, gate: null, blueNumber: null, floor: null, apartment: null, mapsUrl: null };
const booked = bookingResponseSchema.parse({ id: blockId, reference: "J4K-9", clientId: id, addressId: id, employeeId: id, date, startTime: "13:00", endTime: "13:30", timeZone: "Asia/Kuwait", adultCount: 1, childCount: 2, specialChildCount: 1, notes: "Ring the bell", source: "manual", visitStatus: "booked", visitVersion: 0, createdAt: "2026-10-13T00:00:00.000Z", client: { phone: "+96550000001" }, address, employee: { id, displayName: "أحمد" } });
const longBooked = bookingResponseSchema.parse({ ...booked, endTime: "14:00" });
async function mount(options: { blocked?: boolean; conflict?: boolean; role?: "admin" | "employee"; booked?: boolean; longBooked?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  let blocks = options.blocked ? [block] : [];
  const bookings = options.booked ? [booked] : options.longBooked ? [longBooked] : [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/blocks") && init?.method === "POST") {
      if (options.conflict) return new Response(JSON.stringify({ error: { code: "TIME_BLOCK_CONFLICT", message: "Time محجوز، أعد تحميل الأوقات" } }), { status: 409 });
      const input = JSON.parse(String(init.body));
      blocks = [{ ...block, startTime: input.startTime, endTime: input.endTime, reason: input.reason }];
      return new Response(JSON.stringify(blocks[0]), { status: 201 });
    }
    if (url.endsWith(`/blocks/${blockId}`) && init?.method === "DELETE") { blocks = []; return new Response(null, { status: 204 }); }
    if (url === `/api/schedules/${id}`) return new Response(JSON.stringify({ ...initial, blocks }));
    if (url.startsWith("/api/bookings?")) return new Response(JSON.stringify({ bookings, total: bookings.length, limit: 100, offset: 0, date, employeeId: id }));
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  client.setQueryData(sessionKey, { account: { id, phone: "+96550000000", role: options.role ?? "admin" }, csrfToken: "csrf", expiresAt: "2099-01-05T00:00:00.000Z" });
  client.setQueryData(keys.schedule(id), { ...initial, blocks });
  client.setQueryData([...keys.bookings, "list", "day", date, id], { bookings, total: bookings.length, limit: 100, offset: 0 });
  const select = vi.fn(), changed = vi.fn();
  render(<QueryClientProvider client={client}><SlotPills barber={barber} date={date} selected={null} selectedEnd={null} onSelect={select} onAvailabilityChange={changed} /></QueryClientProvider>);
  return { fetch, select, changed };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("booked hour bubble", () => {
  it("opens the reservation summary on hover without a link, and toggles on click", async () => {
    await mount({ booked: true });
    const pill = screen.getByRole("radio", { name: "1:00 PM, booked" });
    expect(pill).not.toHaveAttribute("title");
    await userEvent.hover(pill);
    expect(await screen.findByText("+96550000001")).toBeInTheDocument();
    expect(screen.getByText("2 children (1 with special needs), 1 adult")).toBeInTheDocument();
    expect(screen.getByText("الفنطاس")).toBeInTheDocument();
    expect(screen.getByText("Ring the bell")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open reservation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "2:00 PM" }));
    await waitFor(() => expect(screen.queryByText("+96550000001")).not.toBeInTheDocument());
  });

  it("shows one bubble per half-hour of a longer reservation", async () => {
    await mount({ longBooked: true });
    expect(screen.getByRole("radio", { name: "1:00 PM, booked" })).toBeInTheDocument();
    await userEvent.hover(screen.getByRole("radio", { name: "1:30 PM, booked" }));
    expect(await screen.findAllByText("+96550000001")).toHaveLength(1);
  });

  it("keeps the bubble open after a single touch tap", async () => {
    await mount({ booked: true });
    const pill = screen.getByRole("radio", { name: "1:00 PM, booked" });
    fireEvent.pointerEnter(pill, { pointerType: "touch" });
    fireEvent.mouseEnter(pill);
    fireEvent.click(pill);
    expect(await screen.findByText("+96550000001")).toBeInTheDocument();
  });

  it("toggles the bubble on click", async () => {
    await mount({ booked: true });
    const pill = screen.getByRole("radio", { name: "1:00 PM, booked" });
    fireEvent.click(pill);
    expect(await screen.findByText("+96550000001")).toBeInTheDocument();
    fireEvent.click(pill);
    await waitFor(() => expect(screen.queryByText("+96550000001")).not.toBeInTheDocument());
  });

  it("closes the bubble on an outside click and on Escape", async () => {
    await mount({ booked: true });
    const pill = screen.getByRole("radio", { name: "1:00 PM, booked" });
    fireEvent.click(pill);
    expect(await screen.findByText("+96550000001")).toBeInTheDocument();
    await userEvent.click(document.body);
    await waitFor(() => expect(screen.queryByText("+96550000001")).not.toBeInTheDocument());
    fireEvent.click(pill);
    expect(await screen.findByText("+96550000001")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("+96550000001")).not.toBeInTheDocument());
  });
});

describe("booking time lock controls", () => {
  it("asks for the end time after tapping a start and discards it when the start changes", async () => {
    const { select } = await mount();
    await userEvent.click(screen.getByRole("radio", { name: "1:00 PM" }));
    await userEvent.click(screen.getByRole("radio", { name: "End at 2:00 PM" }));
    expect(select).toHaveBeenCalledWith({ startTime: "13:00", endTime: "14:00" });
    expect(screen.getByRole("radio", { name: "End at 2:00 PM" })).toHaveClass("bg-primary");
    // Choosing a different start must discard the previous end, not carry it over.
    await userEvent.click(screen.getByRole("radio", { name: "2:00 PM" }));
    expect(screen.getAllByRole("radio", { name: /^End at/ }).every(end => end.getAttribute("aria-checked") === "false")).toBe(true);
    expect(select).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("Visit starts at 2:00 PM");
  });
  it("picks a start and an end for a lock and stores the whole window", async () => {
    const { fetch, changed } = await mount();
    await userEvent.click(screen.getByRole("button", { name: "Lock / unlock times" }));
    await userEvent.click(screen.getByRole("radio", { name: "1:00 PM" }));
    await userEvent.click(screen.getByRole("radio", { name: "Lock until 2:00 PM" }));
    await userEvent.type(screen.getByLabelText(/Lock reason/), "موعد Special");
    await userEvent.click(screen.getByRole("button", { name: "Lock 1:00 PM to 2:00 PM" }));
    expect(await screen.findByRole("radio", { name: "1:00 PM, closed: موعد Special" })).toHaveClass("bg-status-locked-soft");
    const call = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(call[0]).toBe(`/api/schedules/${id}/blocks`);
    expect(JSON.parse(String(call[1]?.body))).toEqual({ date, startTime: "13:00", endTime: "14:00", reason: "موعد Special" });
    expect(new Headers(call[1]?.headers).get("X-CSRF-Token")).toBe("csrf");
    expect(changed).toHaveBeenCalled();
  });
  it("defaults the lock end to the first half-hour after the start", async () => {
    const { fetch } = await mount();
    await userEvent.click(screen.getByRole("button", { name: "Lock / unlock times" }));
    await userEvent.click(screen.getByRole("radio", { name: "1:00 PM" }));
    expect(screen.getByRole("status").textContent).toContain("Closing from 1:00 PM to 1:30 PM");
    await userEvent.click(screen.getByRole("button", { name: "Lock 1:00 PM to 1:30 PM" }));
    const call = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ date, startTime: "13:00", endTime: "13:30", reason: "" });
  });
  it("shows the saved reason and unlocks the manual window without offering to unlock scheduled breaks", async () => {
    const { fetch } = await mount({ blocked: true });
    await userEvent.click(screen.getByRole("radio", { name: "1:00 PM, closed: موعد Special" }));
    expect(screen.getByText("Closed: موعد Special")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unlock 1:00 PM – 1:30 PM" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "1:00 PM" })).toBeInTheDocument());
    expect(fetch.mock.calls.some(([url, init]) => String(url).endsWith(`/blocks/${blockId}`) && init?.method === "DELETE")).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: "3:00 PM, closed: Break" }));
    expect(screen.queryByRole("button", { name: /^Unlock/ })).not.toBeInTheDocument();
  });
  it("shows a recoverable conflict and never pretends the time was locked", async () => {
    await mount({ conflict: true });
    await userEvent.click(screen.getByRole("button", { name: "Lock / unlock times" }));
    await userEvent.click(screen.getByRole("radio", { name: "1:00 PM" }));
    await userEvent.click(screen.getByRole("button", { name: "Lock 1:00 PM to 1:30 PM" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Time محجوز، أعد تحميل الأوقات");
    expect(screen.queryByRole("radio", { name: /^1:00 PM, closed/ })).not.toBeInTheDocument();
  });
  it("hides all lock writes from employees", async () => {
    await mount({ blocked: true, role: "employee" });
    expect(screen.queryByRole("button", { name: "Lock / unlock times" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "1:00 PM, closed: موعد Special" }));
    expect(screen.queryByRole("button", { name: /^Unlock/ })).not.toBeInTheDocument();
  });
});
