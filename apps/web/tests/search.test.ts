import { expect, it } from "vitest";
import { matchesSearch } from "@/lib/search";

it("matches part of a name ignoring capital letters and surrounding spaces", () => {
  expect(matchesSearch("Adailya", " ada ")).toBe(true);
  expect(matchesSearch("Shuhada", "ADA")).toBe(true);
  expect(matchesSearch("الفنطاس", "فنط")).toBe(true);
  expect(matchesSearch("Hawally", "ada")).toBe(false);
  expect(matchesSearch("Hawally", "")).toBe(true);
});
