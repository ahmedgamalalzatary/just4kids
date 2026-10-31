import { describe, expect, it } from "vitest";
import { specialChildrenProblem, windowProblem } from "@/lib/booking";

const now = new Date("2026-10-10T07:00:00.000Z"); // 10:00 in Kuwait

describe("booking window", () => {
  it("accepts 1 to 4 whole hours that start in the future", () => {
    expect(windowProblem({ date: "2026-10-10", startTime: "11:00", endTime: "12:00" }, now)).toBeNull();
    expect(windowProblem({ date: "2026-10-11", startTime: "08:00", endTime: "12:00" }, now)).toBeNull();
  });

  it("explains each problem", () => {
    expect(windowProblem({ date: "", startTime: "10:00", endTime: "11:00" }, now)).toBe("Select date");
    expect(windowProblem({ date: "2026-10-11", startTime: "11:00", endTime: "10:00" }, now)).toBe("The appointment must end after it starts on the same day");
    expect(windowProblem({ date: "2026-10-11", startTime: "10:00", endTime: "10:19" }, now)).toBe("Appointments must be at least 20 minutes");
    expect(windowProblem({ date: "2026-10-11", startTime: "08:00", endTime: "12:01" }, now)).toBe("Appointments cannot exceed 4 hours");
    expect(windowProblem({ date: "2026-10-10", startTime: "10:00", endTime: "11:00" }, now)).toBe("The appointment must start after the current Kuwait time");
  });

  it("skips the future rule for a correction, which may sit in the past", () => {
    expect(windowProblem({ date: "2026-10-09", startTime: "10:00", endTime: "10:20" }, now, false)).toBeNull();
    expect(windowProblem({ date: "2026-10-09", startTime: "10:00", endTime: "10:19" }, now, false)).toBe("Appointments must be at least 20 minutes");
    expect(windowProblem({ date: "2026-10-09", startTime: "10:00", endTime: "11:00" }, now)).toBe("The appointment must start after the current Kuwait time");
  });
});

describe("special-needs child count", () => {
  it("allows zero up to the child count and explains the bound", () => {
    expect(specialChildrenProblem(3, 2)).toBeNull();
    expect(specialChildrenProblem(0, 0)).toBeNull();
    expect(specialChildrenProblem(1, 0)).toBeNull();
    expect(specialChildrenProblem(1, 2)).toBe("Special-needs children cannot exceed the child count");
  });
});
