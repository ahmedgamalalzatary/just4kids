import { describe, expect, it } from "vitest";
import { branchCreateSchema, employeeCreateSchema, employeeSelfUpdateSchema } from "../src/index.js";

describe("branch and employee contracts", () => {
  it("normalizes KWD prices exactly to three decimal places without floating-point conversion", () => {
    expect(branchCreateSchema.parse({ name: " حولي ", location: "شارع 1", adultPrice: "5.125", childPrice: "0.5", adultDurationMinutes: 20, childDurationMinutes: 20 })).toEqual({
      name: "حولي", location: "شارع 1", adultPrice: "5.125", childPrice: "0.500", adultDurationMinutes: 20, childDurationMinutes: 20,
    });
  });

  it.each(["-1", "1.2345", "1e3", "1,000", 1.25])("rejects an inexact or nondecimal price %j", adultPrice => {
    const input = { name: "حولي", location: "شارع 1", adultPrice, childPrice: "3.000", adultDurationMinutes: 20, childDurationMinutes: 20 };
    expect(branchCreateSchema.safeParse(input).success).toBe(false);
  });

  it("requires a named employee in one branch without accepting an injected role", () => {
    const input = { displayName: "سالم", phone: "+96555550001", branchId: "3a4f26b1-b76a-47c0-976c-0d4618d9236b", password: "employee1234" };
    expect(employeeCreateSchema.safeParse(input).success).toBe(true);
    expect(employeeCreateSchema.safeParse({ ...input, role: "admin" }).success).toBe(false);
  });

  it("limits employee self-editing to display name", () => {
    expect(employeeSelfUpdateSchema.parse({ displayName: " سالم " })).toEqual({ displayName: "سالم" });
    expect(employeeSelfUpdateSchema.safeParse({ displayName: "سالم", phone: "+96555550009" }).success).toBe(false);
    expect(employeeSelfUpdateSchema.safeParse({ branchId: "3a4f26b1-b76a-47c0-976c-0d4618d9236b" }).success).toBe(false);
  });
});
