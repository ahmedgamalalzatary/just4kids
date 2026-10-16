import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BranchesPage from "@/app/(app)/branches/page";
import { sessionKey } from "@/lib/api/session";

const id = "11111111-1111-4111-8111-111111111111", timestamp = "2026-10-13T00:00:00.000Z";
const branch = { id, name: "حولي", address: "شارع 1", createdAt: timestamp, updatedAt: timestamp };
function mount() {
  let branches = [branch];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/branches" && init?.method === "POST") {
      const created = { id: "22222222-2222-4222-8222-222222222222", ...JSON.parse(String(init.body)), createdAt: timestamp, updatedAt: timestamp };
      branches = [...branches, created];
      return new Response(JSON.stringify(created), { status: 201 });
    }
    if (url.startsWith("/api/branches/") && init?.method === "PATCH") {
      branches = branches.map(value => value.id === id ? { ...value, ...JSON.parse(String(init.body)) } : value);
      return new Response(JSON.stringify(branches.find(value => value.id === id)));
    }
    if (url === "/api/branches") return new Response(JSON.stringify({ branches }));
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  const queries = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  queries.setQueryData(sessionKey, { account: { id, phone: "+96550000000", role: "admin" }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  render(<QueryClientProvider client={queries}><BranchesPage /></QueryClientProvider>);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

it("adds a branch with a name and an address only", async () => {
  const fetch = mount();
  await userEvent.click(await screen.findByRole("button", { name: /Add branch/ }));
  const dialog = within(await screen.findByRole("dialog"));
  await userEvent.type(dialog.getByLabelText("Branch name"), "السالمية");
  await userEvent.type(dialog.getByLabelText("Address"), "شارع 2");
  await userEvent.click(dialog.getByRole("button", { name: "Add branch" }));
  await waitFor(() => expect(fetch.mock.calls.some(([url, init]) => String(url) === "/api/branches" && init?.method === "POST")).toBe(true));
  const [, request] = fetch.mock.calls.find(([url, init]) => String(url) === "/api/branches" && init?.method === "POST")!;
  expect(JSON.parse(String(request?.body))).toEqual({ name: "السالمية", address: "شارع 2" });
});

it("edits a branch name and address", async () => {
  const fetch = mount();
  await userEvent.click((await screen.findAllByRole("button", { name: /Edit/ }))[0]!);
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByLabelText("Branch name")).toHaveValue("حولي");
  expect(dialog.getByLabelText("Address")).toHaveValue("شارع 1");
  await userEvent.clear(dialog.getByLabelText("Address"));
  await userEvent.type(dialog.getByLabelText("Address"), "شارع 2");
  await userEvent.click(dialog.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(fetch.mock.calls.some(([url, init]) => String(url) === `/api/branches/${id}` && init?.method === "PATCH")).toBe(true));
  const [, request] = fetch.mock.calls.find(([url, init]) => String(url) === `/api/branches/${id}` && init?.method === "PATCH")!;
  expect(JSON.parse(String(request?.body))).toEqual({ name: "حولي", address: "شارع 2" });
});
