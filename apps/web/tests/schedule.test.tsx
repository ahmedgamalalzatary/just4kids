import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { keys } from "@/lib/api/hooks";
import { sessionKey } from "@/lib/api/session";
import type { Schedule } from "@/lib/api/types";
import { WeeklyScheduleEditor, WeeklyScheduleView } from "@/components/schedule";

const id = "11111111-1111-4111-8111-111111111111";
const schedule: Schedule = { employeeId: id, days: [{ dayOfWeek: 1, active: true, intervals: [{ startTime: "09:00", endTime: "15:00" }] }], exceptions: [], blocks: [] };

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  let last: { days: { dayOfWeek: number; active: boolean; intervals: unknown[] }[] } | null = null;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `/api/schedules/${id}/weekly` && init?.method === "PUT") {
      last = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ ...schedule, days: last!.days }), { status: 200 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  client.setQueryData(sessionKey, { account: { id, phone: "+96550000000", role: "admin" }, csrfToken: "csrf", expiresAt: "2099-01-05T00:00:00.000Z" });
  client.setQueryData(keys.schedule(id), schedule);
  render(<QueryClientProvider client={client}><WeeklyScheduleEditor employeeId={id} schedule={schedule} /></QueryClientProvider>);
  return { getLast: () => last };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("weekly schedule editor", () => {
  it("saves all seven days and turns a weekday inactive while keeping its shifts", async () => {
    const { getLast } = mount();
    await userEvent.click(screen.getByRole("switch", { name: "Monday active" }));
    await userEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(getLast()).not.toBeNull());
    const days = getLast()!.days;
    expect(days).toHaveLength(7);
    expect(days.find(day => day.dayOfWeek === 1)).toEqual({ dayOfWeek: 1, active: false, intervals: [{ startTime: "09:00", endTime: "15:00" }] });
    expect(days.find(day => day.dayOfWeek === 2)).toEqual({ dayOfWeek: 2, active: true, intervals: [] });
  });

  it("shows an inactive weekday read-only on the barber view", () => {
    render(<WeeklyScheduleView schedule={{ ...schedule, days: [{ dayOfWeek: 1, active: false, intervals: [{ startTime: "09:00", endTime: "15:00" }] }] }} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });
});
