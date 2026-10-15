import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OptionSelect } from "@/components/reports";

// Radix Select uses pointer capture and scrolling that jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

describe("option select", () => {
  it("returns to the whole list through the 'all' option", async () => {
    const onChange = vi.fn();
    render(<OptionSelect value="b1" onChange={onChange} all="All barbers" options={[{ value: "b1", label: "أحمد" }, { value: "b2", label: "سالم" }]} />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "All barbers" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
