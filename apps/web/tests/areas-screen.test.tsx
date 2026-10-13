import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AreasScreen } from "@/components/areas-screen";
import { CreateClientDialog } from "@/components/client-dialogs";
import { sessionKey } from "@/lib/api/session";
import type { Area } from "@/lib/api/types";

const id = "11111111-1111-4111-8111-111111111111";
const area: Area = { id, name: "الفنطاس", enabled: true, createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z" };
function setup() {
  let rows = [area];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.startsWith("/api/areas")) {
      if (init?.method === "POST") { rows = [...rows, { ...area, id: "22222222-2222-4222-8222-222222222222", ...body }]; return new Response(JSON.stringify(rows[1]), { status: 201 }); }
      if (init?.method === "PATCH") { rows = rows.map(row => url.endsWith(row.id) ? { ...row, ...body } : row); return new Response(JSON.stringify(rows.find(row => url.endsWith(row.id)))); }
      return new Response(JSON.stringify({ areas: url.includes("status=active") ? rows.filter(row => row.enabled) : rows }));
    }
    if (url === "/api/clients" && init?.method === "POST") return new Response(JSON.stringify({ id, name: body.name, phone: body.phone, enabled: true, addresses: [{ ...body.address, id, clientId: id }], createdAt: area.createdAt, updatedAt: area.updatedAt }), { status: 201 });
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(sessionKey, { account: { id, role: "admin", phone: "+96550000000" }, csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00.000Z" });
  return { fetch, wrap: (element: ReactNode) => <QueryClientProvider client={client}>{element}</QueryClientProvider> };
}
afterEach(() => vi.unstubAllGlobals());
it("adds and renames Arabic areas and stops/reactivates them from the admin list", async () => {
  const { wrap } = setup(); render(wrap(<AreasScreen />));
  await screen.findByText("الفنطاس");
  await userEvent.type(screen.getByLabelText("اسم المنطقة بالعربية"), "حولي");
  await userEvent.click(screen.getByRole("button", { name: "إضافة المنطقة" }));
  await screen.findByText("حولي");
  const row = screen.getByText("الفنطاس").closest("li")!;
  await userEvent.click(within(row).getByRole("button", { name: "تعديل" }));
  const input = screen.getByLabelText("اسم المنطقة بالعربية");
  await userEvent.clear(input); await userEvent.type(input, "الفنطاس الجديدة");
  await userEvent.click(screen.getByRole("button", { name: "حفظ الاسم" }));
  const renamed = (await screen.findByText("الفنطاس الجديدة")).closest("li")!;
  await userEvent.click(within(renamed).getByRole("button", { name: "إيقاف" }));
  await within(renamed).findByText("موقوفة");
  await userEvent.click(within(renamed).getByRole("button", { name: "تفعيل" }));
  await within(renamed).findByText("متاحة");
});
it("sends the selected area identity with a new client's address and the session CSRF token", async () => {
  const { wrap, fetch } = setup(), saved = vi.fn();
  render(wrap(<CreateClientDialog open onOpenChange={() => {}} onCreated={saved} />));
  await screen.findByRole("option", { name: "الفنطاس" });
  for (const [label, value] of [["اسم العميل", "مريم"], ["رقم الهاتف", "50000001"], ["القطعة", "1"], ["الشارع", "2"], ["رقم المنزل", "3"]]) await userEvent.type(screen.getByLabelText(label!), value!);
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "المنطقة" }), "الفنطاس");
  await userEvent.click(screen.getByRole("button", { name: "إضافة العميل" }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ name: "مريم" })));
  const call = fetch.mock.calls.find(([url, init]) => String(url) === "/api/clients" && init?.method === "POST")!;
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ phone: "+96550000001", address: { area: "الفنطاس", areaId: id } });
  expect(new Headers(call[1]?.headers).get("X-CSRF-Token")).toBe("csrf");
});
