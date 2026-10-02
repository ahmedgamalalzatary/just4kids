import { z } from "zod";
export * from "./auth.js";
export * from "./organization.js";
export * from "./availability.js";
export * from "./clients.js";
export * from "./bookings.js";
export * from "./cash.js";
export * from "./payments.js";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
