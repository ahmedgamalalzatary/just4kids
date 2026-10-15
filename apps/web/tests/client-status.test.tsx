import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClientStatusDialog } from "@/components/client-status-dialog";
import type { Client } from "@/lib/api/types";

const client: Client = { id: "11111111-1111-4111-8111-111111111111", phone: "+96555550101", enabled: true, createdAt: "2026-10-11T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z", addresses: [] };

function renderDialog() {
  render(<QueryClientProvider client={new QueryClient()}><ClientStatusDialog client={client} open onOpenChange={() => {}} /></QueryClientProvider>);
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("ClientStatusDialog", () => {
  it("requires a reason before stopping the client", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Enter a reason")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the stop request with the reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();
    await userEvent.type(screen.getByRole("textbox"), "طلب Client");
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/clients/${client.id}/status`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ enabled: false, reason: "طلب Client" }));
  });
});
