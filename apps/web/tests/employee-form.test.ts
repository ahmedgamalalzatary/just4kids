import { describe, expect, it } from "vitest";
import { employeeEditFormSchema } from "@/lib/forms";

const base = { displayName: "سالم", phone: "+96555550001", branchId: "3a4f26b1-b76a-47c0-976c-0d4618d9236b", enabled: true };

describe("employee edit form", () => {
  it("turns an empty expiry into null and keeps a valid day", () => {
    expect(employeeEditFormSchema.parse({ ...base, accessUntil: "" })).toEqual({ ...base, accessUntil: null });
    expect(employeeEditFormSchema.parse({ ...base, accessUntil: "2026-12-31" })).toEqual({ ...base, accessUntil: "2026-12-31" });
  });

  it("rejects a malformed expiry day", () => {
    expect(employeeEditFormSchema.safeParse({ ...base, accessUntil: "31/12/2026" }).success).toBe(false);
  });
});
