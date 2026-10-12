import { Router } from "express";
import type { RequestHandler } from "express";
import { ZodError } from "zod";
import type { createDatabase } from "@just4kids/db";
import type { AuthModule } from "../auth/index.js";
import type { Authenticated } from "../auth/auth.service.js";
import { deny } from "../../lib/security.js";
import { createCollectionRepository } from "./collection.repository.js";
import { createCollectionService } from "./collection.service.js";

export function createCollections(connection: ReturnType<typeof createDatabase>, auth: AuthModule) {
  const service = createCollectionService(createCollectionRepository(connection));
  const router = Router();
  const handle = (action: RequestHandler): RequestHandler => async (request, response, next) => {
    try { await action(request, response, next); }
    catch (error) { if (error instanceof ZodError) { deny(response, 400, "INVALID_INPUT", "بيانات تحصيلات الحلاقين غير صالحة"); return; } next(error); }
  };
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(auth.requireAuth);
  // A barber reads only their own collections; every write is administrator-only.
  router.get("/", handle(async (request, response) => { response.json(await service.report(request.query, (response.locals.auth as Authenticated).account)); }));
  router.use(auth.requireAdmin);
  router.post("/", auth.requireCsrf, handle(async (request, response) => { response.status(201).json(await service.create(request.body, (response.locals.auth as Authenticated).account.id)); }));
  router.get("/:id/history", handle(async (request, response) => {
    const result = await service.history(String(request.params.id));
    if (!result) { deny(response, 404, "NOT_FOUND", "إدخال التحصيل غير موجود"); return; }
    response.json(result);
  }));
  router.patch("/:id", auth.requireCsrf, handle(async (request, response) => {
    const entry = await service.update(String(request.params.id), request.body, (response.locals.auth as Authenticated).account.id);
    if (!entry) { deny(response, 404, "NOT_FOUND", "إدخال التحصيل غير موجود"); return; }
    response.json(entry);
  }));
  return router;
}
