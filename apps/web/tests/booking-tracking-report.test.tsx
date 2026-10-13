import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { currentKuwaitWeek, type BookingTrackingResponse } from "@just4kids/contracts";
import { ReportFilterBar, ReportScope, ReportTabs } from "@/components/reports";
import { keys } from "@/lib/api/hooks";
import { sessionKey } from "@/lib/api/session";
import { formatDate } from "@/lib/kuwait-time";

const navigation = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/reports/tracking", useRouter: () => ({ replace: navigation.replace }), useSearchParams: () => navigation.params }));
const id = "11111111-1111-4111-8111-111111111111";
function provider(role: "admin" | "employee" = "admin") {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(sessionKey, { account: { id, phone: "+96550000000", role }, expiresAt: "2026-10-15T00:00:00.000Z", csrfToken: "a".repeat(64) });
  client.setQueryData(keys.employees, [{ id, displayName: "أحمد" }]);
  client.setQueryData([...keys.clientList("", 0), "all"], { clients: [{ id, name: "نورة", phone: "+96550000001", enabled: false }], total: 1 });
  client.setQueryData(keys.client(id), { id, name: "نورة", phone: "+96550000001" });
  return client;
}
beforeEach(() => { navigation.params = new URLSearchParams(); navigation.replace.mockReset(); });

describe("tracking report surface", () => {
  it("renders booking groups with mobile cards, printable desktop rows, actors, roles and notes", async () => {
    const trackingModule = await import("@/components/booking-tracking-report").catch(() => null);
    expect(trackingModule?.TrackingBookings).toBeDefined();
    const booking = { id, reference: "J4K-123", date: "2026-10-13", startTime: "10:00", endTime: "11:00", client: { name: "نورة", phone: "+96550000001" }, employee: { displayName: "أحمد" }, adultCount: 1, childCount: 2, specialChildCount: 1, visitStatus: "completed" };
    const event = { type: "visit", at: "2026-10-13T07:00:00.000Z", actor: { id, name: "أحمد", role: "employee" }, event: { id, fromStatus: "booked", toStatus: "arrived", reason: "وصل إلى العنوان" } };
    const data = { bookings: [{ booking, events: [event] }, { booking: { ...booking, id: "other", reference: "J4K-456" }, events: [] }] } as unknown as BookingTrackingResponse;
    const TrackingBookings = trackingModule!.TrackingBookings;
    render(<TrackingBookings data={data} />);
    expect(screen.getByText("J4K-123")).toBeInTheDocument();
    expect(screen.getByText("J4K-456")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("محجوز ← وصل الحلاق")).toBeInTheDocument();
    expect(within(table).getByText("حلاق")).toBeInTheDocument();
    expect(within(table).getByText(/وصل إلى العنوان/)).toBeInTheDocument();
    const cards = screen.getByRole("list", { name: "حركات الحجز J4K-123" });
    expect(within(cards).getByText(/وصل إلى العنوان/)).toBeInTheDocument();
    expect(cards).toHaveClass("md:hidden", "print:hidden");
    expect(table.parentElement?.parentElement).toHaveClass("hidden", "md:block", "print:block");
    expect(screen.getByText("لا توجد حركات مسجلة لهذا الحجز")).toBeInTheDocument();
  });
  it("renders an empty period clearly", async () => {
    const trackingModule = await import("@/components/booking-tracking-report").catch(() => null);
    expect(trackingModule?.TrackingBookings).toBeDefined();
    const TrackingBookings = trackingModule!.TrackingBookings;
    render(<TrackingBookings data={{ dateBasis: "visit_date", timeZone: "Asia/Kuwait", bookings: [] }} />);
    expect(screen.getByText("لا توجد حجوزات مطابقة")).toBeInTheDocument();
  });
  it("offers only period, barber and a searchable client choice, including stopped clients", async () => {
    navigation.params = new URLSearchParams("dateBasis=created_date&status=completed&q=old");
    render(<QueryClientProvider client={provider()}><ReportFilterBar /><ReportScope /></QueryClientProvider>);
    expect(screen.queryByText("أساس التاريخ")).not.toBeInTheDocument();
    expect(screen.queryByText("حالة الزيارة")).not.toBeInTheDocument();
    expect(screen.queryByText("المصدر")).not.toBeInTheDocument();
    // With no period chosen, the report covers the current Kuwait week, and the form starts on it.
    const week = currentKuwaitWeek();
    expect(screen.getByText(/حسب تاريخ الزيارة/)).toHaveTextContent(`من ${formatDate(week.from)} إلى ${formatDate(week.to)}`);
    expect(screen.getByLabelText(/إلى تاريخ/)).toHaveValue(week.to);
    await userEvent.clear(screen.getByLabelText(/من تاريخ/));
    await userEvent.type(screen.getByLabelText(/من تاريخ/), week.to);
    await userEvent.click(screen.getByRole("button", { name: /نورة/ }));
    await userEvent.click(screen.getByRole("button", { name: "عرض التقرير" }));
    expect(navigation.replace).toHaveBeenCalledWith(`/reports/tracking?from=${week.to}&to=${week.to}&clientId=${id}`, { scroll: false });
  });
  it("shows the tracking tab only to the administrator and drops unsupported carried filters", () => {
    navigation.params = new URLSearchParams(`dateBasis=created_date&status=completed&employeeId=${id}`);
    const view = render(<QueryClientProvider client={provider()}><ReportTabs /></QueryClientProvider>);
    expect(screen.getByRole("tab", { name: "تتبع الحجوزات" })).toHaveAttribute("href", `/reports/tracking?employeeId=${id}`);
    view.unmount();
    render(<QueryClientProvider client={provider("employee")}><ReportTabs /></QueryClientProvider>);
    expect(screen.queryByRole("tab", { name: "تتبع الحجوزات" })).not.toBeInTheDocument();
  });
});
