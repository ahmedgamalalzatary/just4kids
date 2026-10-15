import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { AddressFields } from "@/components/address-fields";
import { emptyAddress, type AddressForm } from "@/lib/forms";

const names = ["الفنطاس", "حولي"];
function mount(originalArea = "", fail = false) {
  vi.stubGlobal("fetch", vi.fn(async () => fail ? new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "تعذر تحميل Areas" } }), { status: 500 }) : new Response(JSON.stringify({ areas: names.map((name, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, name, enabled: true, createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z" })) }))));
  function Form() {
    const form = useForm<AddressForm>({ defaultValues: { ...emptyAddress, area: originalArea } });
    const areaValue = useWatch({ control: form.control, name: "area" });
    return <AddressFields register={form.register} errors={{}} areaValue={areaValue} originalArea={originalArea} />;
  }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Form /></QueryClientProvider>);
}
afterEach(() => vi.unstubAllGlobals());
it("searches active Arabic areas and selects an actual saved area", async () => {
  mount();
  const picker = await screen.findByRole("combobox", { name: "Area" });
  await screen.findByRole("option", { name: "الفنطاس" });
  await userEvent.type(screen.getByRole("searchbox", { name: "Search areas" }), "فنط");
  expect(screen.queryByRole("option", { name: "حولي" })).not.toBeInTheDocument();
  await userEvent.selectOptions(picker, "الفنطاس");
  expect(picker).toHaveValue("الفنطاس");
});
it("retains an old free-text or stopped area while allowing a new active choice", async () => {
  mount("منطقة قديمة");
  const picker = await screen.findByRole("combobox", { name: "Area" });
  expect(picker).toHaveValue("منطقة قديمة");
  await screen.findByRole("option", { name: "حولي" });
  await userEvent.selectOptions(picker, "حولي");
  expect(picker).toHaveValue("حولي");
});
it("shows a recoverable catalogue error instead of silently permitting free text", async () => {
  mount("", true);
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل Areas");
  expect(screen.getByRole("combobox", { name: "Area" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reload areas" })).toBeInTheDocument();
});
