import { describe, expect, it } from "vitest";
import { employeeCreateFormSchema, employeeEditFormSchema } from "@/lib/forms";

const base = { displayName: "Salem", gender: "male", phone: "+96555550001", enabled: true };
// An empty Arabic name is sent as null, like the API stores it.
const input = { ...base, displayNameAr: "" }, output = { ...base, displayNameAr: null };

describe("employee edit form", () => {
  it("turns an empty expiry into null and keeps a valid day", () => {
    expect(employeeEditFormSchema.parse({ ...input, accessUntil: "" })).toEqual({ ...output, accessUntil: null });
    expect(employeeEditFormSchema.parse({ ...input, accessUntil: "2026-12-31" })).toEqual({ ...output, accessUntil: "2026-12-31" });
  });

  it("has no branch field", () => {
    expect(employeeEditFormSchema.parse({ ...input, branchId: "3a4f26b1-b76a-47c0-976c-0d4618d9236b", accessUntil: "" })).toEqual({ ...output, accessUntil: null });
  });

  it("keeps a typed Arabic name", () => {
    expect(employeeEditFormSchema.parse({ ...input, displayNameAr: " سالم ", accessUntil: "" })).toEqual({ ...output, displayNameAr: "سالم", accessUntil: null });
  });

  it("rejects a malformed expiry day", () => {
    expect(employeeEditFormSchema.safeParse({ ...input, accessUntil: "31/12/2026" }).success).toBe(false);
  });

  it("requires male or female, including for a barber saved without a gender", () => {
    expect(employeeEditFormSchema.safeParse({ ...input, gender: "", accessUntil: "" }).success).toBe(false);
    expect(employeeEditFormSchema.parse({ ...input, gender: "female", accessUntil: "" })).toEqual({ ...output, gender: "female", accessUntil: null });
  });
});

describe("employee create form", () => {
  const create = { displayName: "Salem", displayNameAr: "", phone: "+96555550001", password: "employee-password-123" };
  it("requires male or female", () => {
    expect(employeeCreateFormSchema.safeParse({ ...create, gender: "" }).error?.issues[0]?.message).toBe("Select male or female");
    expect(employeeCreateFormSchema.parse({ ...create, gender: "male" }).gender).toBe("male");
  });
});
