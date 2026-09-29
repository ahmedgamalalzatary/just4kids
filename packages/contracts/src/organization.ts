import { z } from "zod";
import { passwordSchema, phoneSchema } from "./auth.js";

const label = z.string().trim().min(1).max(120);
const location = z.string().trim().min(1).max(500);
const minutes = z.number().int().min(1).max(1440);

export const kwdPriceSchema = z.string().regex(/^(0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$/).transform(value => {
  const [dinars, fils = ""] = value.split(".");
  return `${dinars}.${fils.padEnd(3, "0")}`;
});

export const branchCreateSchema = z.strictObject({
  name: label,
  location,
  adultPrice: kwdPriceSchema,
  childPrice: kwdPriceSchema,
  adultDurationMinutes: minutes,
  childDurationMinutes: minutes,
});
export const branchUpdateSchema = branchCreateSchema.partial().refine(value => Object.keys(value).length > 0);
export const branchResponseSchema = branchCreateSchema.extend({ id: z.uuid(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });

export const employeeCreateSchema = z.strictObject({
  displayName: label,
  phone: phoneSchema,
  branchId: z.uuid(),
  password: passwordSchema,
});
export const employeeAdminUpdateSchema = z.strictObject({
  displayName: label.optional(),
  phone: phoneSchema.optional(),
  branchId: z.uuid().optional(),
  enabled: z.boolean().optional(),
}).refine(value => Object.keys(value).length > 0);
export const employeeSelfUpdateSchema = z.strictObject({ displayName: label });
export const employeePasswordResetSchema = z.strictObject({ password: passwordSchema });
export const employeeResponseSchema = z.strictObject({
  id: z.uuid(),
  displayName: label,
  phone: phoneSchema,
  branchId: z.uuid(),
  branch: z.strictObject({ id: z.uuid(), name: label, location }),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BranchCreate = z.infer<typeof branchCreateSchema>;
export type BranchUpdate = z.infer<typeof branchUpdateSchema>;
export type EmployeeCreate = z.infer<typeof employeeCreateSchema>;
export type EmployeeAdminUpdate = z.infer<typeof employeeAdminUpdateSchema>;
