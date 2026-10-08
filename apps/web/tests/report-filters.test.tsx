import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReportFilterBar, ReportScope } from "@/components/reports";
import { keys } from "@/lib/api/hooks";
import { sessionKey } from "@/lib/api/session";

const navigation = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/reports/barbers",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));

const branchId = "7a3f2c1e-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const employeeId = "1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a8b";

function renderReport(role: "admin" | "employee", search = "") {
  navigation.params = new URLSearchParams(search);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(sessionKey, { account: { id: employeeId, phone: "+96550000000", role }, expiresAt: "2026-10-15T00:00:00.000Z", csrfToken: "a".repeat(64) });
  client.setQueryData(keys.branches, [{ id: branchId, name: "السالمية" }]);
  client.setQueryData(keys.employees, [{ id: employeeId, displayName: "أحمد" }]);
  render(<QueryClientProvider client={client}><ReportScope /><ReportFilterBar /></QueryClientProvider>);
}

beforeEach(() => { navigation.replace.mockReset(); });

describe("report filters", () => {
  it("applies trimmed filters to the address", async () => {
    renderReport("admin");
    await userEvent.type(screen.getByLabelText(/من تاريخ/), "2026-10-01");
    await userEvent.type(screen.getByLabelText(/بحث/), "  J4K-7 ");
    await userEvent.click(screen.getByRole("button", { name: "عرض التقرير" }));
    expect(navigation.replace).toHaveBeenCalledWith("/reports/barbers?from=2026-10-01&q=J4K-7", { scroll: false });
  });

  it("blocks a range that ends before it starts", async () => {
    renderReport("admin");
    await userEvent.type(screen.getByLabelText(/من تاريخ/), "2026-10-05");
    await userEvent.type(screen.getByLabelText(/إلى تاريخ/), "2026-10-01");
    expect(screen.getByText("تاريخ النهاية قبل تاريخ البداية")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "عرض التقرير" })).toBeDisabled();
  });

  it("clears every filter", async () => {
    renderReport("admin", `?status=completed&branchId=${branchId}`);
    await userEvent.click(screen.getByRole("button", { name: "مسح المرشحات" }));
    expect(navigation.replace).toHaveBeenCalledWith("/reports/barbers", { scroll: false });
  });

  it("labels the date basis, range, and named filters for screen and print", () => {
    renderReport("admin", `?dateBasis=created_date&from=2026-10-01&to=2026-10-31&branchId=${branchId}&employeeId=${employeeId}&source=ai`);
    expect(screen.getByRole("heading", { name: "تقرير الحلاقون" })).toBeInTheDocument();
    const scope = screen.getByText(/حسب تاريخ إنشاء الحجز/);
    expect(scope).toHaveTextContent("بتوقيت الكويت");
    expect(scope).toHaveTextContent("الفرع: السالمية، الحلاق: أحمد، المصدر: عبر واتساب");
  });

  it("offers barbers no branch or barber filters and states their own-record scope", () => {
    renderReport("employee", `?branchId=${branchId}`);
    expect(screen.queryByText("الفرع")).not.toBeInTheDocument();
    expect(screen.queryByText("الحلاق")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "تقرير أدائي" })).toBeInTheDocument();
    expect(screen.getByText(/زياراتك المسندة إليك فقط/)).not.toHaveTextContent("الفرع:");
  });
});
