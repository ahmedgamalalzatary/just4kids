import { z } from "zod";
import { addressCreateSchema, kwdPriceSchema, phoneSchema } from "@just4kids/contracts";

// Form schemas mirror the shared API contracts with Arabic messages written for the people using the forms.
// The API stays authoritative; these give immediate, readable feedback before submitting.

export const requiredText = (max: number, message = "هذا الحقل مطلوب") =>
  z.string().trim().min(1, message).max(max, `الحد الأقصى ${max} حرفاً`);

/** Optional text field: empty input becomes `null`, matching the API's nullable fields. */
export const optionalText = (max: number) =>
  z.string().trim().max(max, `الحد الأقصى ${max} حرفاً`).transform(value => (value === "" ? null : value));

export const phoneField = z.string().trim().refine(value => phoneSchema.safeParse(value).success, "اكتب الرقم بالصيغة الدولية مثل ‎+96550000000");

export const passwordField = z.string().min(8, "8 أحرف على الأقل").max(128, "الحد الأقصى 128 حرفاً");

export const priceField = z.string().trim().refine(value => kwdPriceSchema.safeParse(value).success, "اكتب السعر بالدينار، حتى 3 خانات عشرية مثل 7.500")
  .transform(value => kwdPriceSchema.parse(value));

export const minutesField = z.string().trim().regex(/^[0-9]+$/, "اكتب عدد الدقائق").transform(Number)
  .pipe(z.number().int().min(1, "دقيقة واحدة على الأقل").max(1440, "الحد الأقصى 1440 دقيقة"));

export const countField = z.string().trim().regex(/^[0-9]+$/, "اكتب رقماً صحيحاً").transform(Number).pipe(z.number().int().min(0).max(99, "الحد الأقصى 99"));

export const branchFormSchema = z.object({
  name: requiredText(120),
  location: requiredText(500),
  adultPrice: priceField,
  childPrice: priceField,
  adultDurationMinutes: minutesField,
  childDurationMinutes: minutesField,
});

export const employeeCreateFormSchema = z.object({
  displayName: requiredText(120),
  phone: phoneField,
  branchId: z.string().min(1, "اختر الفرع"),
  password: passwordField,
});

export const employeeEditFormSchema = z.object({
  displayName: requiredText(120),
  phone: phoneField,
  branchId: z.string().min(1, "اختر الفرع"),
  enabled: z.boolean(),
});

export const passwordResetFormSchema = z.object({ password: passwordField, confirm: z.string() })
  .refine(value => value.password === value.confirm, { path: ["confirm"], message: "كلمتا المرور غير متطابقتين" });

const coordinateField = z.string().trim().refine(value => value === "" || /^-?(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,7})?$/.test(value), "اكتب رقماً مثل 29.3759")
  .transform(value => (value === "" ? null : value));

export const addressFormSchema = z.object({
  area: requiredText(120, "اكتب المنطقة"),
  block: requiredText(120, "اكتب رقم القطعة"),
  street: requiredText(200, "اكتب الشارع"),
  houseNumber: optionalText(120),
  buildingName: optionalText(120),
  floor: optionalText(120),
  apartment: optionalText(120),
  instructions: optionalText(1000),
  mapsUrl: z.string().trim().transform(value => (value === "" ? null : value)),
  latitude: coordinateField,
  longitude: coordinateField,
}).superRefine((value, context) => {
  if (!value.houseNumber && !value.buildingName) context.addIssue({ code: "custom", path: ["houseNumber"], message: "اكتب رقم المنزل أو اسم المبنى" });
  if (Boolean(value.latitude) !== Boolean(value.longitude)) context.addIssue({ code: "custom", path: [value.latitude ? "longitude" : "latitude"], message: "أدخل خط العرض وخط الطول معاً" });
  if (value.latitude && Math.abs(Number(value.latitude)) > 90) context.addIssue({ code: "custom", path: ["latitude"], message: "خط العرض بين ‎-90 و 90" });
  if (value.longitude && Math.abs(Number(value.longitude)) > 180) context.addIssue({ code: "custom", path: ["longitude"], message: "خط الطول بين ‎-180 و 180" });
  if (value.mapsUrl && !addressCreateSchema.shape.mapsUrl.safeParse(value.mapsUrl).success) context.addIssue({ code: "custom", path: ["mapsUrl"], message: "استخدم رابط خرائط Google يبدأ بـ https" });
});

export const emptyAddress = { area: "", block: "", street: "", houseNumber: "", buildingName: "", floor: "", apartment: "", instructions: "", mapsUrl: "", latitude: "", longitude: "" };

export const clientFormSchema = z.object({ name: requiredText(120, "اكتب اسم العميل"), phone: phoneField });

export const reasonField = requiredText(1000, "اكتب السبب");

export type BranchForm = z.input<typeof branchFormSchema>;
export type AddressForm = z.input<typeof addressFormSchema>;
