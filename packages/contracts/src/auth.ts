import { z } from "zod";

export const phoneSchema = z.string().regex(/^\+[1-9][0-9]{7,14}$/, "استخدم رقم الهاتف بالصيغة الدولية");
export const passwordSchema = z.string().min(8).max(128);
export const loginRequestSchema = z.strictObject({ phone: phoneSchema, password: z.string().min(1).max(128) });
export const accountSchema = z.strictObject({ id: z.uuid(), phone: phoneSchema, role: z.enum(["admin", "employee"]) });
export const csrfResponseSchema = z.strictObject({ csrfToken: z.string().regex(/^[a-f0-9]{64}$/) });
export const sessionResponseSchema = z.strictObject({
  account: accountSchema,
  expiresAt: z.iso.datetime(),
  csrfToken: csrfResponseSchema.shape.csrfToken,
});
export type Account = z.infer<typeof accountSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
