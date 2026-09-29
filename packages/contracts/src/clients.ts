import { z } from "zod";
import { phoneSchema } from "./auth.js";

const name = z.string().trim().min(1).max(120);
const addressPart = z.string().trim().min(1).max(120);
const optionalPart = addressPart.nullable().optional();
const coordinate = (limit: number) => z.string().regex(/^-?(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,7})?$/)
  .refine(value => Math.abs(Number(value)) <= limit);
const latitude = coordinate(90);
const longitude = coordinate(180);
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
  area: addressPart,
  block: addressPart,
  street: z.string().trim().min(1).max(200),
  houseNumber: optionalPart,
  buildingName: optionalPart,
  floor: optionalPart,
  apartment: optionalPart,
  instructions: z.string().trim().min(1).max(1000).nullable().optional(),
  mapsUrl: googleMapsUrl.nullable().optional(),
  latitude: latitude.nullable().optional(),
  longitude: longitude.nullable().optional(),
});

export const addressCreateSchema = addressFields.superRefine((address, context) => {
  if (!address.houseNumber && !address.buildingName) context.addIssue({ code: "custom", path: ["houseNumber"], message: "House number or building name is required" });
  if (Boolean(address.latitude) !== Boolean(address.longitude)) context.addIssue({ code: "custom", path: ["longitude"], message: "Both location coordinates are required" });
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
  floor: addressPart.nullable(),
  apartment: addressPart.nullable(),
  instructions: z.string().trim().min(1).max(1000).nullable(),
  mapsUrl: googleMapsUrl.nullable(),
  latitude: latitude.nullable(),
  longitude: longitude.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const clientCreateSchema = z.strictObject({ name, phone: phoneSchema, address: addressCreateSchema });
export const clientUpdateSchema = z.strictObject({ name: name.optional(), phone: phoneSchema.optional() }).refine(value => Object.keys(value).length > 0);
export const clientSummarySchema = z.strictObject({ id: z.uuid(), name, phone: phoneSchema, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export const clientResponseSchema = clientSummarySchema.extend({ addresses: z.array(addressResponseSchema) });
export const clientSearchSchema = z.strictObject({
  q: z.string().trim().max(120).default(""),
  limit: z.string().regex(/^[0-9]+$/).default("20").transform(Number).pipe(z.number().int().min(1).max(100)),
  offset: z.string().regex(/^[0-9]+$/).default("0").transform(Number).pipe(z.number().int().min(0).max(1000000)),
});

export type AddressCreate = z.infer<typeof addressCreateSchema>;
export type AddressUpdate = z.infer<typeof addressUpdateSchema>;
export type ClientCreate = z.infer<typeof clientCreateSchema>;
export type ClientUpdate = z.infer<typeof clientUpdateSchema>;
export type ClientSearch = z.infer<typeof clientSearchSchema>;
