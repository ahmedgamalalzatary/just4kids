import { z } from "zod";

const name = z.string().trim().min(1).max(120);
export const areaCreateSchema = z.strictObject({ name });
export const areaUpdateSchema = z.strictObject({ name: name.optional(), enabled: z.boolean().optional() }).refine(value => Object.keys(value).length > 0);
export const areaSearchSchema = z.strictObject({ q: z.string().trim().max(120).default(""), status: z.enum(["all", "active", "stopped"]).default("all") });
export const areaResponseSchema = z.strictObject({ id: z.uuid(), name, enabled: z.boolean(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export type AreaCreate = z.infer<typeof areaCreateSchema>;
export type AreaUpdate = z.infer<typeof areaUpdateSchema>;
