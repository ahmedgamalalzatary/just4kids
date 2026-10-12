import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CollectedCash, SalonFilterBar, SalonScope } from "@/components/reports";
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

describe("collections scope in reports", () => {
  it("explains why the collected money is hidden under other filters", () => {
    render(<CollectedCash value={null} />);
    expect(screen.getByText("التحصيلات تُفلتر بالفترة والحلاق فقط")).toBeInTheDocument();
  });

  it("filters the comprehensive report by period only", () => {
    renderWithSession(<><SalonScope /><SalonFilterBar /></>, "/reports/comprehensive");
    expect(screen.queryByText("الفرع")).not.toBeInTheDocument();
    expect(screen.getByText(/الفترة: كل التواريخ/)).not.toHaveTextContent("الفرع");
  });

  it("keeps the branch filter on the salon report", () => {
    renderWithSession(<><SalonScope /><SalonFilterBar /></>, "/reports/salon");
    expect(screen.getByText("الفرع")).toBeInTheDocument();
    expect(screen.getByText(/الفترة: كل التواريخ/)).toHaveTextContent("الفرع: كل الفروع");
  });
});
