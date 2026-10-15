import { Router } from "express";
import type { RequestHandler } from "express";
import { ZodError } from "zod";
import type { createDatabase } from "@just4kids/db";
import type { AuthModule } from "../auth/index.js";
import type { Authenticated } from "../auth/auth.service.js";
import { deny } from "../../lib/security.js";
import { createSalonRepository } from "./salon.repository.js";
import { createSalonService } from "./salon.service.js";

export function createSalon(connection: ReturnType<typeof createDatabase>, auth: AuthModule) {
  const service = createSalonService(createSalonRepository(connection));
  const router = Router();
  const handle = (action: RequestHandler): RequestHandler => async (request, response, next) => {
    try { await action(request, response, next); }
    catch (error) { if (error instanceof ZodError) { deny(response, 400, "INVALID_INPUT", "Invalid salon entry details"); return; } next(error); }
  };
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(auth.requireAuth, auth.requireAdmin);
  router.get("/", handle(async (request, response) => { response.json(await service.report(request.query)); }));
  router.post("/", auth.requireCsrf, handle(async (request, response) => { response.status(201).json(await service.create(request.body, (response.locals.auth as Authenticated).account.id)); }));
  router.get("/:id/history", handle(async (request, response) => {
    const result = await service.history(String(request.params.id));
    if (!result) { deny(response, 404, "NOT_FOUND", "Salon entry not found"); return; }
    response.json(result);
  }));
  router.patch("/:id", auth.requireCsrf, handle(async (request, response) => {
    const entry = await service.update(String(request.params.id), request.body, (response.locals.auth as Authenticated).account.id);
    if (!entry) { deny(response, 404, "NOT_FOUND", "Salon entry not found"); return; }
    response.json(entry);
  }));
  return router;
}
