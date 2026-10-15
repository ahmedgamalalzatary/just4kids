import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CollectedCash, SalonFilterBar, SalonScope } from "@/components/reports";
import BarberReportPage from "@/app/(app)/reports/barbers/page";
import InvoicesReportPage from "@/app/(app)/reports/invoices/page";
import { keys } from "@/lib/api/hooks";
import { sessionKey } from "@/lib/api/session";

const navigation = vi.hoisted(() => ({ pathname: "/reports/comprehensive", params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => navigation.params,
}));

const branchId = "7a3f2c1e-4b5d-4e6f-8a9b-0c1d2e3f4a5b";

function renderWithSession(node: React.ReactNode, pathname: string) {
  navigation.pathname = pathname;
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(sessionKey, { account: { id: branchId, phone: "+96550000000", role: "admin" }, expiresAt: "2026-10-15T00:00:00.000Z", csrfToken: "a".repeat(64) });
  client.setQueryData(keys.branches, [{ id: branchId, name: "السالمية" }]);
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
afterEach(() => vi.unstubAllGlobals());

// The administrator's daily collections feed the barber and invoice reports, so their counts are entries, not receipts.
const collected = { count: 2, total: "7.000", byMethod: { cash: { count: 2, total: "7.000" }, link: { count: 0, total: "0.000" }, knet: { count: 0, total: "0.000" } } };

describe("collections scope in reports", () => {
  it("explains why the collected money is hidden under other filters", () => {
    render(<CollectedCash value={null} />);
    expect(screen.getByText("Collections are filtered by period and barber only")).toBeInTheDocument();
  });

  it("filters the comprehensive report by period only", () => {
    renderWithSession(<><SalonScope /><SalonFilterBar /></>, "/reports/comprehensive");
    expect(screen.queryByText("Branch")).not.toBeInTheDocument();
    expect(screen.getByText(/Period: All dates/)).not.toHaveTextContent("Branch");
  });

  it("keeps the branch filter on the salon report", () => {
    renderWithSession(<><SalonScope /><SalonFilterBar /></>, "/reports/salon");
    expect(screen.getByText("Branch")).toBeInTheDocument();
    expect(screen.getByText(/Period: All dates/)).toHaveTextContent("Branch: All branches");
  });

  it("labels the barber report's daily collections as entries, not receipts", async () => {
    const employee = {
      employeeId: branchId, displayName: "سالم", enabled: true, availableMinutes: null,
      work: { bookings: 0, reserved: { adult: 0, child: 0, special: 0 }, completed: { adult: 0, child: 0, special: 0 }, open: { adult: 0, child: 0, special: 0 }, cancelled: { adult: 0, child: 0, special: 0 }, noShow: { adult: 0, child: 0, special: 0 }, completedVisits: 0, reservedMinutes: 0 },
      invoices: { issued: { count: 0, total: "0.000" }, outstanding: { count: 0, total: "0.000" }, cancelled: { count: 0, total: "0.000" } },
      cash: collected,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/reports/employees")) return new Response(JSON.stringify({ dateBasis: "visit_date", timeZone: "Asia/Kuwait", employees: [employee] }));
      throw new Error(`Unexpected request ${url}`);
    }));
    renderWithSession(<BarberReportPage />, "/reports/barbers");
    expect(await screen.findByText("2 entry")).toBeInTheDocument();
  });

  it("labels the invoice report's collected summary as entries, not receipts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/reports/invoices")) return new Response(JSON.stringify({
        dateBasis: "visit_date", timeZone: "Asia/Kuwait",
        summary: { invoices: { issued: { count: 0, total: "0.000" }, outstanding: { count: 0, total: "0.000" }, cancelled: { count: 0, total: "0.000" } }, cash: collected, editedBookings: 0, edits: 0, correctedBookings: 0, corrections: 0 },
        invoices: [], total: 0, limit: 20, offset: 0,
      }));
      throw new Error(`Unexpected request ${url}`);
    }));
    renderWithSession(<InvoicesReportPage />, "/reports/invoices");
    expect(await screen.findByText("2 entry")).toBeInTheDocument();
  });
});
