import { z } from "zod";
import { passwordSchema, phoneSchema } from "@just4kids/contracts";

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url().refine(value => { const url = new URL(value); return url.protocol === "mysql:" && url.pathname.length > 1; }, "DATABASE_URL must select a MySQL database"),
  ADMIN_PHONE: phoneSchema,
  ADMIN_PASSWORD: passwordSchema,
  AUTH_SECRET: z.string().regex(/^[a-f0-9]{64}$/, "AUTH_SECRET must contain 32 random bytes encoded as hex"),
  APP_ORIGIN: z.url().default("http://localhost:3000").refine(value => new URL(value).origin === value, "APP_ORIGIN must be an origin without path, credentials, or trailing slash"),
}).superRefine((env, context) => {
  if (env.NODE_ENV === "production") {
    if (!env.APP_ORIGIN.startsWith("https://")) context.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "Production requires an HTTPS APP_ORIGIN" });
    if (env.ADMIN_PASSWORD.length < 12 || env.ADMIN_PASSWORD.startsWith("REPLACE_")) context.addIssue({ code: "custom", path: ["ADMIN_PASSWORD"], message: "Production requires a unique administrator password of at least 12 characters" });
  }
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
