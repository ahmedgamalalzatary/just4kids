import { describe, expect, it } from "vitest";
import { specialChildrenProblem, windowProblem } from "@/lib/booking";

const now = new Date("2026-10-10T07:00:00.000Z"); // 10:00 in Kuwait

describe("booking window", () => {
  it("accepts 20 minutes up to 4 hours that start in the future", () => {
    expect(windowProblem({ date: "2026-10-10", startTime: "10:01", endTime: "10:21" }, now)).toBeNull();
    expect(windowProblem({ date: "2026-10-11", startTime: "08:00", endTime: "12:00" }, now)).toBeNull();
  });

  it("explains each problem", () => {
    expect(windowProblem({ date: "", startTime: "10:00", endTime: "11:00" }, now)).toBe("اختر التاريخ");
    expect(windowProblem({ date: "2026-10-11", startTime: "11:00", endTime: "10:00" }, now)).toBe("يجب أن ينتهي الموعد بعد بدايته في اليوم نفسه");
    expect(windowProblem({ date: "2026-10-11", startTime: "10:00", endTime: "10:19" }, now)).toBe("أقل مدة للموعد 20 دقيقة");
    expect(windowProblem({ date: "2026-10-11", startTime: "08:00", endTime: "12:01" }, now)).toBe("أطول مدة للموعد 4 ساعات");
    expect(windowProblem({ date: "2026-10-10", startTime: "10:00", endTime: "11:00" }, now)).toBe("يجب أن يبدأ الموعد بعد الوقت الحالي بتوقيت الكويت");
  });

  it("skips the future rule for a correction, which may sit in the past", () => {
    expect(windowProblem({ date: "2026-10-09", startTime: "10:00", endTime: "10:20" }, now, false)).toBeNull();
    expect(windowProblem({ date: "2026-10-09", startTime: "10:00", endTime: "10:19" }, now, false)).toBe("أقل مدة للموعد 20 دقيقة");
    expect(windowProblem({ date: "2026-10-09", startTime: "10:00", endTime: "10:20" }, now)).toBe("يجب أن يبدأ الموعد بعد الوقت الحالي بتوقيت الكويت");
  });
});

describe("special-needs child count", () => {
  it("allows zero up to the child count and explains the bound", () => {
    expect(specialChildrenProblem(3, 2)).toBeNull();
    expect(specialChildrenProblem(0, 0)).toBeNull();
    expect(specialChildrenProblem(1, 0)).toBeNull();
    expect(specialChildrenProblem(1, 2)).toBe("عدد الأطفال ذوي الاحتياجات الخاصة لا يزيد عن عدد الأطفال");
  });
});
