import { describe, expect, it } from "vitest";
import { bookingCreateSchema, bookingEditSchema, visitTransitionSchema, visitCorrectionSchema } from "../src/index.js";

const input = { clientId: "11111111-1111-4111-8111-111111111111", addressId: "22222222-2222-4222-8222-222222222222", employeeId: "33333333-3333-4333-8333-333333333333", date: "2030-01-07", startTime: "09:00", endTime: "09:20", adultCount: 3, childCount: 0 };
describe("booking contracts", () => {
  it("accepts partial booking edits with a required version", () => {
    expect(bookingEditSchema).toBeDefined();
    expect(bookingEditSchema.parse({ expectedVersion: 0, childCount: 2, reason: "  تعديل  " })).toEqual({ expectedVersion: 0, childCount: 2, reason: "تعديل" });
  });
  it.each([{ adultCount: 1 }, { expectedVersion: 0 }, { expectedVersion: -1, adultCount: 1 }, { expectedVersion: 0, adultCount: -1 }, { expectedVersion: 0, adultCount: 0, childCount: 0 }, { expectedVersion: 0, employeeId: "invalid" }, { expectedVersion: 0, adultCount: 1, total: "1.000" }, { expectedVersion: 0, clientId: input.clientId }, { expectedVersion: 0, adultCount: 1, reason: " " }])("rejects invalid or caller-controlled booking edits: %j", body => {
    expect(bookingEditSchema).toBeDefined();
    expect(bookingEditSchema.safeParse(body).success).toBe(false);
  });
  it("requires a version for visit writes and a nonempty reason for corrections", () => {
    expect(visitTransitionSchema).toBeDefined();
    expect(visitTransitionSchema.safeParse({ status: "arrived", expectedVersion: 0 }).success).toBe(true);
    expect(visitTransitionSchema.safeParse({ status: "arrived" }).success).toBe(false);
    expect(visitTransitionSchema.safeParse({ status: "booked", expectedVersion: 0 }).success).toBe(false);
    expect(visitCorrectionSchema.safeParse({ status: "booked", expectedVersion: 1, reason: " " }).success).toBe(false);
    expect(visitCorrectionSchema.safeParse({ status: "booked", expectedVersion: 1, reason: "تصحيح" }).success).toBe(true);
    expect(visitTransitionSchema.safeParse({ status: "cancelled", expectedVersion: 0, actorAccountId: input.employeeId }).success).toBe(false);
  });
  it("accepts three haircuts in one 20-minute window independently of durations", () => {
    expect(bookingCreateSchema.parse(input)).toEqual(input);
  });
  it.each([{ adultCount: 0, childCount: 0 }, { adultCount: -1 }, { childCount: 0.5 }, { endTime: "09:19" }, { endTime: "13:01" }, { employeeId: "invalid" }, { source: "ai" }, { unitPrice: "0.001" }])("rejects invalid counts/windows or caller-controlled pricing/source: %j", patch => {
    expect(bookingCreateSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("accepts the inclusive four-hour upper boundary", () => {
    expect(bookingCreateSchema.safeParse({ ...input, endTime: "13:00" }).success).toBe(true);
  });
});
