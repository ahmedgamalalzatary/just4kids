import type { RequestHandler } from "express";
import { csrfResponseSchema, loginRequestSchema, sessionResponseSchema } from "@just4kids/contracts";
import type { ApiEnv } from "../../configs/env.js";
import { deny, equalHex, readCookie } from "../../lib/security.js";
import type { AuthService, Authenticated } from "./auth.service.js";

const sessionLengthMs = 7 * 24 * 60 * 60 * 1000;

export function createAuthController(service: AuthService, env: ApiEnv) {
  const production = env.NODE_ENV === "production";
  const sessionCookieName = production ? "__Host-j4k-session" : "j4k_session";
  const preloginCookieName = production ? "__Host-j4k-prelogin" : "j4k_prelogin";
  const cookieOptions = { httpOnly: true, secure: production, sameSite: "strict" as const, path: "/" };

  const challenge: RequestHandler = (_request, response) => {
    const created = service.createChallenge();
    response.cookie(preloginCookieName, created.challenge, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
    response.set("Cache-Control", "no-store").json(csrfResponseSchema.parse({ csrfToken: created.csrfToken }));
  };

  const login: RequestHandler = async (request, response, next) => {
    try {
      if (!service.verifyChallenge(readCookie(request, preloginCookieName), request.get("X-CSRF-Token"))) {
        deny(response, 403, "INVALID_CSRF", "رمز حماية الطلب غير صالح"); return;
      }
      const parsed = loginRequestSchema.safeParse(request.body);
      if (!parsed.success) { deny(response, 400, "INVALID_INPUT", "بيانات الدخول غير صالحة"); return; }
      const result = await service.authenticate(parsed.data.phone, parsed.data.password, request.ip ?? "unknown", readCookie(request, sessionCookieName));
      if (result.kind === "limited") { response.set("Retry-After", String(result.retryAfter)); deny(response, 429, "LOGIN_RATE_LIMITED", "محاولات كثيرة، حاول لاحقاً"); return; }
      if (result.kind === "invalid") { deny(response, 401, "INVALID_CREDENTIALS", "رقم الهاتف أو كلمة المرور غير صحيحين"); return; }
      response.clearCookie(preloginCookieName, cookieOptions);
      response.cookie(sessionCookieName, result.session.token, { ...cookieOptions, maxAge: sessionLengthMs });
      response.set("Cache-Control", "no-store").json(sessionResponseSchema.parse({ account: result.session.account, expiresAt: result.session.expiresAt.toISOString(), csrfToken: service.csrf(result.session.token) }));
    } catch (error) { next(error); }
  };

  const session: RequestHandler = (_request, response) => {
    const authenticated = response.locals.auth as Authenticated;
    response.set("Cache-Control", "no-store").json(sessionResponseSchema.parse({ account: authenticated.account, expiresAt: authenticated.expiresAt.toISOString(), csrfToken: service.csrf(authenticated.token) }));
  };

  const logout: RequestHandler = async (request, response, next) => {
    try {
      const authenticated = response.locals.auth as Authenticated;
      if (!equalHex(request.get("X-CSRF-Token") ?? "", service.csrf(authenticated.token))) { deny(response, 403, "INVALID_CSRF", "رمز حماية الطلب غير صالح"); return; }
      await service.revokeSession(authenticated.token);
      response.clearCookie(sessionCookieName, cookieOptions).set("Cache-Control", "no-store").status(204).end();
    } catch (error) { next(error); }
  };

  return { challenge, login, session, logout, sessionCookieName };
}
