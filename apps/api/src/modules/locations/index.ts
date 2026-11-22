import { Router, type RequestHandler } from "express";
import { ZodError } from "zod";
import type { createDatabase } from "@just4kids/db";
import { deny } from "../../lib/security.js";
import type { AuthModule } from "../auth/index.js";
import type { Authenticated } from "../auth/auth.service.js";
import { createLocationRepository } from "./location.repository.js";
import { createLocationService } from "./location.service.js";

export function createLocations(connection: ReturnType<typeof createDatabase>, auth: AuthModule) {
  const service = createLocationService(createLocationRepository(connection));
  const requireEmployee: RequestHandler = (_request, response, next) => {
    if ((response.locals.auth as Authenticated | undefined)?.account.role !== "employee") { deny(response, 403, "FORBIDDEN", "This action is not allowed"); return; }
    next();
  };
  const router = Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(auth.requireAuth);
  router.get("/", auth.requireAdmin, async (_request, response, next) => {
    try { response.json(await service.list()); } catch (error) { next(error); }
  });
  router.put("/me", requireEmployee, auth.requireCsrf, async (request, response, next) => {
    try {
      await service.report((response.locals.auth as Authenticated).account.id, request.body);
      response.status(204).end();
    } catch (error) { if (error instanceof ZodError) { deny(response, 400, "INVALID_INPUT", "Invalid location"); return; } next(error); }
  });
  return router;
}
