import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "@/components/ui/input";

const original = HTMLInputElement.prototype.showPicker;
afterEach(() => { HTMLInputElement.prototype.showPicker = original; });

describe("Input pickers", () => {
  it("opens the native date and time pickers when the field itself is clicked, not only its small icon", async () => {
    const showPicker = vi.fn();
    HTMLInputElement.prototype.showPicker = showPicker;
    render(<><Input type="date" aria-label="date" /><Input type="time" aria-label="time" /></>);
    await userEvent.click(screen.getByLabelText("date"));
    await userEvent.click(screen.getByLabelText("time"));
    expect(showPicker).toHaveBeenCalledTimes(2);
  });

  it("leaves other fields and disabled pickers alone and keeps the caller's click handler", async () => {
    const showPicker = vi.fn();
    const onClick = vi.fn();
    HTMLInputElement.prototype.showPicker = showPicker;
    render(<><Input aria-label="name" onClick={onClick} /><Input type="date" aria-label="locked" readOnly /></>);
    await userEvent.click(screen.getByLabelText("name"));
    await userEvent.click(screen.getByLabelText("locked"));
    expect(onClick).toHaveBeenCalledOnce();
    expect(showPicker).not.toHaveBeenCalled();
  });

  it("ignores browsers that refuse to open the picker", async () => {
    HTMLInputElement.prototype.showPicker = () => { throw new DOMException("not allowed", "NotAllowedError"); };
    render(<Input type="date" aria-label="date" />);
    await expect(userEvent.click(screen.getByLabelText("date"))).resolves.toBeUndefined();
  });
});
