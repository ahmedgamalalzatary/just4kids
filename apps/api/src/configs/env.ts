import { z } from "zod";
import { passwordSchema, phoneSchema } from "@just4kids/contracts";

// Empty values in an env file count as unset, so an unfilled template leaves the WhatsApp intake off.
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(value => value === "" ? undefined : value, schema.optional());
const baseUrl = z.url({ protocol: /^https?$/ }).transform(value => value.replace(/\/+$/, ""));
const whatsappKeys = ["OPENWA_BASE_URL", "OPENWA_API_KEY", "OPENWA_SESSION_ID", "OPENWA_WEBHOOK_SECRET", "STAFF_WHATSAPP_NUMBER", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL"] as const;

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url().refine(value => { const url = new URL(value); return url.protocol === "mysql:" && url.pathname.length > 1; }, "DATABASE_URL must select a MySQL database"),
  ADMIN_PHONE: phoneSchema,
  ADMIN_PASSWORD: passwordSchema,
  AUTH_SECRET: z.string().regex(/^[a-f0-9]{64}$/, "AUTH_SECRET must contain 32 random bytes encoded as hex"),
  UPLOADS_DIR: z.string().trim().min(1).default("uploads"),
  APP_ORIGIN: z.url().default("http://localhost:3000").refine(value => new URL(value).origin === value, "APP_ORIGIN must be an origin without path, credentials, or trailing slash"),
  OPENWA_BASE_URL: optional(baseUrl),
  OPENWA_API_KEY: optional(z.string().trim().min(1)),
  // The session id (a UUID) OpenWA returns when the session is created, not its name; webhooks and send routes both use it.
  OPENWA_SESSION_ID: optional(z.uuid("OPENWA_SESSION_ID must be the OpenWA session id (a UUID), not its name")),
  // OpenWA requires a webhook secret of at least 16 characters.
  OPENWA_WEBHOOK_SECRET: optional(z.string().min(16, "OPENWA_WEBHOOK_SECRET must contain at least 16 characters").max(255)),
  // One or more numbers separated by commas; each receives the requests and can decide them.
  STAFF_WHATSAPP_NUMBER: optional(z.string().transform(value => [...new Set(value.split(",").map(item => item.trim()))]).pipe(z.array(phoneSchema).min(1))),
  AI_BASE_URL: optional(baseUrl),
  AI_API_KEY: optional(z.string().trim().min(1)),
  AI_MODEL: optional(z.string().trim().min(1).max(200)),
  // Not part of the required set: only some providers accept this field. MiMo thinks unless told not to, which delays replies.
  AI_THINKING: optional(z.enum(["enabled", "disabled"])),
}).superRefine((env, context) => {
  if (env.NODE_ENV === "production") {
    if (!env.APP_ORIGIN.startsWith("https://")) context.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "Production requires an HTTPS APP_ORIGIN" });
    if (env.ADMIN_PASSWORD.startsWith("REPLACE_")) context.addIssue({ code: "custom", path: ["ADMIN_PASSWORD"], message: "Production requires a unique administrator password, not the template value" });
  }
  // The intake runs with every setting or none; a partial set is a configuration mistake.
  const missing = whatsappKeys.filter(key => env[key] === undefined);
  if (missing.length && missing.length < whatsappKeys.length) for (const key of missing) context.addIssue({ code: "custom", path: [key], message: `${key} is required when the WhatsApp intake is configured` });
}).transform(({ OPENWA_BASE_URL, OPENWA_API_KEY, OPENWA_SESSION_ID, OPENWA_WEBHOOK_SECRET, STAFF_WHATSAPP_NUMBER, AI_BASE_URL, AI_API_KEY, AI_MODEL, AI_THINKING, ...env }) => ({
  ...env,
  whatsapp: OPENWA_BASE_URL && OPENWA_API_KEY && OPENWA_SESSION_ID && OPENWA_WEBHOOK_SECRET && STAFF_WHATSAPP_NUMBER && AI_BASE_URL && AI_API_KEY && AI_MODEL ? {
    openwa: { baseUrl: OPENWA_BASE_URL, apiKey: OPENWA_API_KEY, sessionId: OPENWA_SESSION_ID, webhookSecret: OPENWA_WEBHOOK_SECRET },
    staffPhones: STAFF_WHATSAPP_NUMBER,
    ai: { baseUrl: AI_BASE_URL, apiKey: AI_API_KEY, model: AI_MODEL, ...(AI_THINKING && { thinking: AI_THINKING }) },
  } : null,
}));

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WhatsAppSettings = NonNullable<ApiEnv["whatsapp"]>;
