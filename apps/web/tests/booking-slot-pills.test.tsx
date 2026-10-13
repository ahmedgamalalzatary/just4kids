import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { keys } from "@/lib/api/hooks";
import { sessionKey } from "@/lib/api/session";
import type { Employee, Schedule } from "@/lib/api/types";
import { SlotPills } from "@/components/booking-slot-pills";

const id = "11111111-1111-4111-8111-111111111111", blockId = "22222222-2222-4222-8222-222222222222";
const date = "2099-01-05";
const barber: Employee = { id, phone: "+96550000000", displayName: "أحمد", enabled: true, photoUpdatedAt: null, accessUntil: null, createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z" };
const block = { id: blockId, employeeId: id, date, startTime: "13:00", endTime: "13:30", reason: "موعد خاص", createdBy: id, createdAt: "2026-10-13T00:00:00.000Z" };
const initial: Schedule = { employeeId: id, days: [{ dayOfWeek: 1, intervals: [{ startTime: "09:00", endTime: "15:00" }] }], exceptions: [], blocks: [] };
async function mount(options: { blocked?: boolean; conflict?: boolean; role?: "admin" | "employee" } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  let blocks = options.blocked ? [block] : [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/blocks") && init?.method === "POST") {
      if (options.conflict) return new Response(JSON.stringify({ error: { code: "TIME_BLOCK_CONFLICT", message: "الوقت محجوز، أعد تحميل الأوقات" } }), { status: 409 });
      blocks = [{ ...block, reason: JSON.parse(String(init.body)).reason }];
      return new Response(JSON.stringify(blocks[0]), { status: 201 });
    }
    if (url.endsWith(`/blocks/${blockId}`) && init?.method === "DELETE") { blocks = []; return new Response(null, { status: 204 }); }
    if (url === `/api/schedules/${id}`) return new Response(JSON.stringify({ ...initial, blocks }));
    if (url.startsWith("/api/bookings?")) return new Response(JSON.stringify({ bookings: [], total: 0, limit: 100, offset: 0, date, employeeId: id }));
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  client.setQueryData(sessionKey, { account: { id, phone: "+96550000000", role: options.role ?? "admin" }, csrfToken: "csrf", expiresAt: "2099-01-05T00:00:00.000Z" });
  client.setQueryData(keys.schedule(id), { ...initial, blocks });
  client.setQueryData([...keys.bookings, "list", "day", date, id], { bookings: [], total: 0, limit: 100, offset: 0 });
  const select = vi.fn(), changed = vi.fn();
  render(<QueryClientProvider client={client}><SlotPills barber={barber} date={date} duration={60} selected={null} onSelect={select} onAvailabilityChange={changed} /></QueryClientProvider>);
  return { fetch, select, changed };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("booking time lock controls", () => {
  it("keeps normal booking selection, and locks only half an hour even with a one-hour visit selected", async () => {
    const { fetch, select, changed } = await mount();
    await userEvent.click(screen.getByRole("radio", { name: "1:00 م" }));
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ startTime: "13:00", endTime: "14:00" }));
    await userEvent.click(screen.getByRole("button", { name: "قفل / فتح الأوقات" }));
    await userEvent.click(screen.getByRole("radio", { name: "1:00 م" }));
    await userEvent.type(screen.getByLabelText(/سبب القفل/), "موعد خاص");
    await userEvent.click(screen.getByRole("button", { name: "قفل نصف الساعة" }));
    expect(await screen.findByRole("radio", { name: "1:00 م، مغلق: موعد خاص" })).toHaveClass("bg-status-locked-soft");
    const call = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(call[0]).toBe(`/api/schedules/${id}/blocks`);
    expect(JSON.parse(String(call[1]?.body))).toEqual({ date, startTime: "13:00", reason: "موعد خاص" });
    expect(new Headers(call[1]?.headers).get("X-CSRF-Token")).toBe("csrf");
    expect(changed).toHaveBeenCalled();
  });
  it("shows the saved reason and unlocks the manual lock without offering to unlock scheduled breaks", async () => {
    const { fetch } = await mount({ blocked: true });
    await userEvent.click(screen.getByRole("radio", { name: "1:00 م، مغلق: موعد خاص" }));
    expect(screen.getByText("مغلق: موعد خاص")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "فتح نصف الساعة" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "1:00 م" })).toBeInTheDocument());
    expect(fetch.mock.calls.some(([url, init]) => String(url).endsWith(`/blocks/${blockId}`) && init?.method === "DELETE")).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: "3:00 م، مغلق: استراحة" }));
    expect(screen.queryByRole("button", { name: "فتح نصف الساعة" })).not.toBeInTheDocument();
  });
  it("shows a recoverable conflict and never pretends the time was locked", async () => {
    await mount({ conflict: true });
    await userEvent.click(screen.getByRole("button", { name: "قفل / فتح الأوقات" }));
    await userEvent.click(screen.getByRole("radio", { name: "1:00 م" }));
    await userEvent.click(screen.getByRole("button", { name: "قفل نصف الساعة" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("الوقت محجوز، أعد تحميل الأوقات");
    expect(screen.queryByRole("radio", { name: /^1:00 م، مغلق/ })).not.toBeInTheDocument();
  });
  it("hides all lock writes from employees", async () => {
    await mount({ blocked: true, role: "employee" });
    expect(screen.queryByRole("button", { name: "قفل / فتح الأوقات" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "1:00 م، مغلق: موعد خاص" }));
    expect(screen.queryByRole("button", { name: "فتح نصف الساعة" })).not.toBeInTheDocument();
  });
});
