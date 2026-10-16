import { z } from "zod";
import { addressCreateSchema, kwdPriceSchema, phoneSchema } from "@just4kids/contracts";
import { normalizePhone } from "@/lib/phone";

// Form schemas mirror the shared API contracts with English messages written for the people using the forms.
// The API stays authoritative; these give immediate, readable feedback before submitting.

export const requiredText = (max: number, message = "This field is required") =>
  z.string().trim().min(1, message).max(max, `Maximum ${max} characters`);

/** Optional text field: empty input becomes `null`, matching the API's nullable fields. */
export const optionalText = (max: number) =>
  z.string().trim().max(max, `Maximum ${max} characters`).transform(value => (value === "" ? null : value));

export const phoneField = z.string().trim().transform(normalizePhone).refine(value => phoneSchema.safeParse(value).success, "Enter an international number, e.g. +96550000000");

export const passwordField = z.string().min(8, "At least 8 characters").max(128, "Maximum 128 characters");

export const priceField = z.string().trim().refine(value => kwdPriceSchema.safeParse(value).success, "Enter a KWD price with up to 3 decimal places, e.g. 7.500")
  .transform(value => kwdPriceSchema.parse(value));

export const minutesField = z.string().trim().regex(/^[0-9]+$/, "Enter the number of minutes").transform(Number)
  .pipe(z.number().int().min(1, "At least one minute").max(1440, "Maximum 1440 minutes"));

export const countField = z.string().trim().regex(/^[0-9]+$/, "Enter a whole number").transform(Number).pipe(z.number().int().min(0).max(99, "Maximum 99"));

export const branchFormSchema = z.object({
  name: requiredText(120),
  address: requiredText(500),
});

export const employeeCreateFormSchema = z.object({
  displayName: requiredText(120),
  phone: phoneField,
  password: passwordField,
});

export const employeeEditFormSchema = z.object({
  displayName: requiredText(120),
  phone: phoneField,
  enabled: z.boolean(),
  accessUntil: z.string().trim().transform(value => (value === "" ? null : value)).refine(value => value === null || z.iso.date().safeParse(value).success, "Enter a valid date"),
});

export const passwordResetFormSchema = z.object({ password: passwordField, confirm: z.string() })
  .refine(value => value.password === value.confirm, { path: ["confirm"], message: "Passwords do not match" });

export const addressFormSchema = z.object({
  area: requiredText(120, "Enter the area"),
  block: requiredText(120, "Enter the block number"),
  street: requiredText(200, "Enter the street"),
  houseNumber: optionalText(120),
  buildingName: optionalText(120),
  avenue: optionalText(120),
  gate: optionalText(120),
  blueNumber: optionalText(120),
  floor: optionalText(120),
  apartment: optionalText(120),
  mapsUrl: z.string().trim().transform(value => (value === "" ? null : value)),
}).superRefine((value, context) => {
  if (!value.houseNumber && !value.buildingName) context.addIssue({ code: "custom", path: ["houseNumber"], message: "Enter a house number or building name" });
  if (value.mapsUrl && !addressCreateSchema.shape.mapsUrl.safeParse(value.mapsUrl).success) context.addIssue({ code: "custom", path: ["mapsUrl"], message: "Use an HTTPS Google Maps link" });
});

export const emptyAddress = { area: "", block: "", street: "", houseNumber: "", buildingName: "", avenue: "", gate: "", blueNumber: "", floor: "", apartment: "", mapsUrl: "" };

export const clientFormSchema = z.object({ phone: phoneField });

export const reasonField = requiredText(1000, "Enter a reason");

export type BranchForm = z.input<typeof branchFormSchema>;
export type AddressForm = z.input<typeof addressFormSchema>;
