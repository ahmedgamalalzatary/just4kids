import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmployeeAvatar } from "@/components/avatar";

describe("EmployeeAvatar", () => {
  it("shows the initial and skips the request when the version is null", () => {
    const { container } = render(<EmployeeAvatar employeeId="e1" name="سالم" version={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("س")).toBeInTheDocument();
  });

  it("loads a versioned photo and retries after a later upload instead of staying on the initial", () => {
    const { container, rerender } = render(<EmployeeAvatar employeeId="e1" name="سالم" version="v1" />);
    const first = container.querySelector("img");
    expect(first?.getAttribute("src")).toContain("?v=v1");
    fireEvent.error(first!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("س")).toBeInTheDocument();
    rerender(<EmployeeAvatar employeeId="e1" name="سالم" version="v2" />);
    expect(container.querySelector("img")?.getAttribute("src")).toContain("?v=v2");
  });
});
