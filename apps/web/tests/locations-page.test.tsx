import { afterEach, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LocationsPage from "@/app/(app)/locations/page";
import { sessionKey } from "@/lib/api/session";

const focused = vi.fn();
vi.mock("@/components/barber-map", () => ({
  BarberMap: ({ barbers, focus }: { barbers: { employeeId: string }[]; focus: { id: string } | null }) => {
    focused(focus?.id ?? null);
    return <div data-testid="map">{barbers.length} on map</div>;
  },
}));

const live = { employeeId: "11111111-1111-4111-8111-111111111111", displayName: "Salem", location: { latitude: 29.3401, longitude: 48.0011, accuracy: 8, updatedAt: new Date(Date.now() - 20_000).toISOString() }, nextBooking: { id: "33333333-3333-4333-8333-333333333333", startTime: "18:00", endTime: "19:00", area: "Jabriya", visitStatus: "booked" } };
const stale = { employeeId: "22222222-2222-4222-8222-222222222222", displayName: "Fahad", location: { latitude: 29.1, longitude: 48.1, accuracy: 30, updatedAt: new Date(Date.now() - 12 * 60_000).toISOString() }, nextBooking: null };
const never = { employeeId: "44444444-4444-4444-8444-444444444444", displayName: "Nasser", location: null, nextBooking: null };

function mount(role: "admin" | "employee" = "admin") {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/locations") return new Response(JSON.stringify({ barbers: [live, stale, never] }));
    throw new Error(`Unexpected request ${String(input)}`);
  }));
  const queries = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  queries.setQueryData(sessionKey, { account: { id: live.employeeId, phone: "+96550000000", role }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  render(<QueryClientProvider client={queries}><LocationsPage /></QueryClientProvider>);
}
afterEach(() => { vi.unstubAllGlobals(); focused.mockClear(); });

it("lists every barber with how fresh their position is and what they are doing", async () => {
  mount();
  const salem = within((await screen.findByText("Salem")).closest("li")!);
  expect(salem.getByText("Live now")).toBeInTheDocument();
  expect(salem.getByText("Next visit 6:00 PM · Jabriya")).toBeInTheDocument();
  expect(salem.getByRole("link", { name: /Google Maps/ })).toHaveAttribute("href", "https://www.google.com/maps?q=29.3401,48.0011");
  const fahad = within(screen.getByText("Fahad").closest("li")!);
  expect(fahad.getByText("Last seen 12 min ago")).toBeInTheDocument();
  expect(fahad.getByText("No more visits today")).toBeInTheDocument();
  const nasser = within(screen.getByText("Nasser").closest("li")!);
  expect(nasser.getByText("Has not shared a location yet")).toBeInTheDocument();
  expect(nasser.queryByRole("link", { name: /Google Maps/ })).not.toBeInTheDocument();
  expect(screen.getByTestId("map")).toHaveTextContent("2 on map");
  expect(screen.getByText("1 of 3 live")).toBeInTheDocument();
});

it("centres the map on a barber when picked from the list", async () => {
  mount();
  await userEvent.click(await screen.findByRole("button", { name: "Show Fahad on the map" }));
  expect(focused).toHaveBeenLastCalledWith(stale.employeeId);
  expect(screen.queryByRole("button", { name: "Show Nasser on the map" })).not.toBeInTheDocument();
});

it("is for the administrator only", () => {
  mount("employee");
  expect(screen.getByText("This page is available to administrators only.")).toBeInTheDocument();
});
