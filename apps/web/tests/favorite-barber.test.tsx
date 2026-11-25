import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FavoriteBarber } from "@/components/favorite-barber";
import type { Client } from "@/lib/api/types";

// Radix Select uses pointer capture and scrolling that jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => { vi.unstubAllGlobals(); });

const barberId = "22222222-2222-4222-8222-222222222222";
const client: Client = { id: "11111111-1111-4111-8111-111111111111", phone: "+96555550101", enabled: true, favoriteBarber: null, createdAt: "2026-10-11T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z", addresses: [] };
const employees = { employees: [{ id: barberId, displayName: "Salem", displayNameAr: null, enabled: true }] };

function stubFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/employees")) return Response.json(employees);
    if (url.startsWith("/api/auth/csrf")) return Response.json({ csrfToken: "token" });
    return Response.json({ ...client, favoriteBarber: init?.method === "PATCH" ? { id: barberId, name: "Salem" } : null });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const renderCard = (value: Client) => render(<QueryClientProvider client={new QueryClient()}><FavoriteBarber client={value} /></QueryClientProvider>);

describe("favorite barber", () => {
  it("says when no favorite barber is set", () => {
    stubFetch();
    renderCard(client);
    expect(screen.getByRole("combobox", { name: "Favorite barber" })).toHaveTextContent("No favorite barber");
  });

  it("shows the chosen favorite barber", () => {
    stubFetch();
    renderCard({ ...client, favoriteBarber: { id: barberId, name: "Salem" } });
    expect(screen.getByRole("combobox", { name: "Favorite barber" })).toHaveTextContent("Salem");
  });

  it("saves the barber chosen from the list", async () => {
    const fetchMock = stubFetch();
    renderCard(client);
    await userEvent.click(screen.getByRole("combobox", { name: "Favorite barber" }));
    await userEvent.click(await screen.findByRole("option", { name: "Salem" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const [url, init] = fetchMock.mock.calls.find(([, call]) => call?.method === "PATCH")!;
    expect(url).toBe(`/api/clients/${client.id}`);
    expect(init!.body).toBe(JSON.stringify({ favoriteBarberId: barberId }));
  });

  it("clears it with the no-favorite option", async () => {
    const fetchMock = stubFetch();
    renderCard({ ...client, favoriteBarber: { id: barberId, name: "Salem" } });
    await userEvent.click(screen.getByRole("combobox", { name: "Favorite barber" }));
    await userEvent.click(await screen.findByRole("option", { name: "No favorite barber" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    expect(fetchMock.mock.calls.find(([, call]) => call?.method === "PATCH")![1]!.body).toBe(JSON.stringify({ favoriteBarberId: null }));
  });
});
