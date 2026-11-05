import { z } from "zod";
import { passwordSchema, phoneSchema } from "./auth.js";

const label = z.string().trim().min(1).max(120);
const address = z.string().trim().min(1).max(500);

export const branchCreateSchema = z.strictObject({
  name: label,
  address,
});
export const branchUpdateSchema = branchCreateSchema.partial().refine(value => Object.keys(value).length > 0);
export const branchResponseSchema = branchCreateSchema.extend({ id: z.uuid(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });

// The Arabic name WhatsApp shows to Arabic chats; empty means the English display name is used.
const arabicName = label.nullable();
export const employeeCreateSchema = z.strictObject({
  displayName: label,
  displayNameAr: arabicName.optional(),
  phone: phoneSchema,
  password: passwordSchema,
});
export const employeeAdminUpdateSchema = z.strictObject({
  displayName: label.optional(),
  displayNameAr: arabicName.optional(),
  phone: phoneSchema.optional(),
  enabled: z.boolean().optional(),
  accessUntil: z.iso.date().nullable().optional(),
}).refine(value => Object.keys(value).length > 0);
export const employeeSelfUpdateSchema = z.strictObject({ displayName: label });
export const employeePasswordResetSchema = z.strictObject({ password: passwordSchema });
export const employeeResponseSchema = z.strictObject({
  id: z.uuid(),
  displayName: label,
  displayNameAr: arabicName,
  phone: phoneSchema,
  enabled: z.boolean(),
  accessUntil: z.iso.date().nullable(),
  photoUpdatedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BranchCreate = z.infer<typeof branchCreateSchema>;
export type BranchUpdate = z.infer<typeof branchUpdateSchema>;
export type EmployeeCreate = z.infer<typeof employeeCreateSchema>;
export type EmployeeAdminUpdate = z.infer<typeof employeeAdminUpdateSchema>;
