import { describe, expect, it } from "vitest";
import { bookingCreateSchema } from "../src/index.js";

const input = { clientId: "11111111-1111-4111-8111-111111111111", addressId: "22222222-2222-4222-8222-222222222222", employeeId: "33333333-3333-4333-8333-333333333333", date: "2030-01-07", startTime: "09:00", endTime: "09:20", adultCount: 3, childCount: 0 };
describe("booking contracts", () => {
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
