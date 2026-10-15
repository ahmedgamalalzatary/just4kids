import { z } from "zod";
import { phoneSchema } from "./auth.js";

const addressPart = z.string().trim().min(1).max(120);
const optionalPart = addressPart.nullable().optional();
const googleMapsUrl = z.url().max(2048).refine(value => {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && !url.username && !url.password && (
    host === "maps.app.goo.gl" ||
    ((host === "google.com" || host === "www.google.com") && (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))) ||
    host === "maps.google.com"
  );
});

const addressFields = z.strictObject({
  areaId: z.uuid().optional(),
  area: addressPart,
  block: addressPart,
  street: z.string().trim().min(1).max(200),
  houseNumber: optionalPart,
  buildingName: optionalPart,
  avenue: optionalPart,
  gate: optionalPart,
  blueNumber: optionalPart,
  floor: optionalPart,
  apartment: optionalPart,
  mapsUrl: googleMapsUrl.nullable().optional(),
});

export const addressCreateSchema = addressFields.superRefine((address, context) => {
  if (!address.houseNumber && !address.buildingName) context.addIssue({ code: "custom", path: ["houseNumber"], message: "House number or building name is required" });
});
export const addressUpdateSchema = addressFields.partial().refine(value => Object.keys(value).length > 0);
export const addressResponseSchema = z.strictObject({
  id: z.uuid(),
  clientId: z.uuid(),
  area: addressPart,
  block: addressPart,
  street: z.string().trim().min(1).max(200),
  houseNumber: addressPart.nullable(),
  buildingName: addressPart.nullable(),
  avenue: addressPart.nullable(),
  gate: addressPart.nullable(),
  blueNumber: addressPart.nullable(),
  floor: addressPart.nullable(),
  apartment: addressPart.nullable(),
  mapsUrl: googleMapsUrl.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const clientCreateSchema = z.strictObject({ phone: phoneSchema, address: addressCreateSchema });
export const clientUpdateSchema = z.strictObject({ phone: phoneSchema.optional() }).refine(value => Object.keys(value).length > 0);
export const clientSummarySchema = z.strictObject({ id: z.uuid(), phone: phoneSchema, enabled: z.boolean(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export const clientResponseSchema = clientSummarySchema.extend({ addresses: z.array(addressResponseSchema) });
export const clientLookupResponseSchema = clientResponseSchema.extend({ lastUsedAddressId: z.uuid().nullable() });
export const clientSearchSchema = z.strictObject({
  q: z.string().trim().max(120).default(""),
  status: z.enum(["all", "active", "stopped"]).default("all"),
  limit: z.string().regex(/^[0-9]+$/).default("20").transform(Number).pipe(z.number().int().min(1).max(100)),
  offset: z.string().regex(/^[0-9]+$/).default("0").transform(Number).pipe(z.number().int().min(0).max(1000000)),
});
const statusReason = z.string().trim().min(1).max(1000);
export const clientStatusUpdateSchema = z.strictObject({ enabled: z.boolean(), reason: statusReason });
export const clientStatusEventSchema = z.strictObject({
  id: z.uuid(), clientId: z.uuid(), enabled: z.boolean(), previousEnabled: z.boolean(), reason: statusReason, actorAccountId: z.uuid(), occurredAt: z.iso.datetime(),
});

export type AddressCreate = z.infer<typeof addressCreateSchema>;
export type AddressUpdate = z.infer<typeof addressUpdateSchema>;
export type ClientCreate = z.infer<typeof clientCreateSchema>;
export type ClientUpdate = z.infer<typeof clientUpdateSchema>;
export type ClientSearch = z.infer<typeof clientSearchSchema>;
