import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SalonPage from "@/app/(app)/salon/page";
import { keys } from "@/lib/api/hooks";
import { sessionKey } from "@/lib/api/session";

const navigation = vi.hoisted(() => ({ pathname: "/salon", params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => navigation.params,
}));

// Radix Select uses pointer capture and scrolling that jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

const id = "11111111-1111-4111-8111-111111111111", branchId = "22222222-2222-4222-8222-222222222222", timestamp = "2026-10-16T00:00:00.000Z";
const entry = { id, version: 1, branchId, branchName: "السالمية", date: "2099-01-05", childCount: 2, cash: "6.000", link: "1.000", knet: "0.000", total: "7.000", enteredBy: id, createdAt: timestamp, updatedAt: timestamp };

function mount() {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/salon" && init?.method === "POST") return new Response(JSON.stringify(entry), { status: 201 });
    if (url.startsWith("/api/salon?")) return new Response(JSON.stringify({ timeZone: "Asia/Kuwait", from: null, to: null, entries: [], totals: { childCount: 0, cash: "0.000", link: "0.000", knet: "0.000", total: "0.000" } }));
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  client.setQueryData(sessionKey, { account: { id, phone: "+96550000000", role: "admin" }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  client.setQueryData(keys.branches, [{ id: branchId, name: "السالمية", address: "x" }]);
  render(<QueryClientProvider client={client}><SalonPage /></QueryClientProvider>);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

it("starts a new salon entry with empty inputs and a zero total", async () => {
  mount();
  await userEvent.click(await screen.findByRole("button", { name: /New entry/ }));
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByLabelText("Child count")).toHaveValue(null);
  expect(dialog.getByLabelText("Cash (KWD)")).toHaveValue("");
  expect(dialog.getByLabelText("Payment link (KWD)")).toHaveValue("");
  expect(dialog.getByLabelText("KNET (KWD)")).toHaveValue("");
  expect(dialog.getByText("0.000 KWD")).toBeInTheDocument();
});

it("sends zero values when empty salon fields are saved", async () => {
  const fetch = mount();
  await userEvent.click(await screen.findByRole("button", { name: /New entry/ }));
  const dialog = within(await screen.findByRole("dialog"));
  await userEvent.click(dialog.getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: "السالمية" }));
  for (const label of ["Child count", "Cash (KWD)", "Payment link (KWD)", "KNET (KWD)"]) {
    await userEvent.clear(dialog.getByLabelText(label));
  }
  await userEvent.click(screen.getByRole("button", { name: "Save daily work" }));
  await waitFor(() => expect(fetch.mock.calls.some(([url, init]) => String(url) === "/api/salon" && init?.method === "POST")).toBe(true));
  const [, request] = fetch.mock.calls.find(([url, init]) => String(url) === "/api/salon" && init?.method === "POST")!;
  expect(JSON.parse(String(request?.body))).toMatchObject({ childCount: 0, cash: "0.000", link: "0.000", knet: "0.000" });
});
