import type { RequestHandler } from "express";
import type { ApiEnv } from "../configs/env.js";
import { deny, equalHex, readCookie } from "../lib/security.js";
import type { AuthService, Authenticated } from "../modules/auth/auth.service.js";

export function createAuthMiddlewares(service: AuthService, env: ApiEnv, sessionCookieName: string) {
  const requireAuth: RequestHandler = async (request, response, next) => {
    try {
      const authenticated = await service.loadSession(readCookie(request, sessionCookieName));
      if (!authenticated) { deny(response, 401, "UNAUTHENTICATED", "Log in to continue"); return; }
      response.locals.auth = authenticated;
      next();
    } catch (error) { next(error); }
  };

  const requireAdmin: RequestHandler = (_request, response, next) => {
    const authenticated = response.locals.auth as Authenticated | undefined;
    if (authenticated?.account.role !== "admin") { deny(response, 403, "FORBIDDEN", "This action is not allowed"); return; }
    next();
  };

  const guardOrigin: RequestHandler = (request, response, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method) || request.get("Origin") === env.APP_ORIGIN) { next(); return; }
    deny(response, 403, "INVALID_ORIGIN", "Request origin is not allowed");
  };

  const requireCsrf: RequestHandler = (request, response, next) => {
    const authenticated = response.locals.auth as Authenticated | undefined;
    if (!authenticated || !equalHex(request.get("X-CSRF-Token") ?? "", service.csrf(authenticated.token))) {
      deny(response, 403, "INVALID_CSRF", "Invalid request security token"); return;
    }
    next();
  };

  return { requireAuth, requireAdmin, guardOrigin, requireCsrf };
}
