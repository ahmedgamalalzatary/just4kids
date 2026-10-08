import { Router } from "express";
import type { RequestHandler } from "express";
import { ZodError } from "zod";
import type { createDatabase } from "@just4kids/db";
import type { AuthModule } from "../auth/index.js";
import type { Authenticated } from "../auth/auth.service.js";
import { deny } from "../../lib/security.js";
import { createReportRepository } from "./report.repository.js";
import { createReportService } from "./report.service.js";

export function createReports(connection: ReturnType<typeof createDatabase>, auth: AuthModule) {
  const service = createReportService(createReportRepository(connection));
  const router = Router();
  const handle = (action: RequestHandler): RequestHandler => async (request, response, next) => {
    try { await action(request, response, next); }
    catch (error) { if (error instanceof ZodError) { deny(response, 400, "INVALID_INPUT", "مرشحات التقرير غير صالحة"); return; } next(error); }
  };
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(auth.requireAuth);
  router.get("/reservations", handle(async (request, response) => { response.json(await service.reservations(request.query, (response.locals.auth as Authenticated).account)); }));
  router.get("/haircuts", handle(async (request, response) => { response.json(await service.haircuts(request.query, (response.locals.auth as Authenticated).account)); }));
  router.get("/employees", handle(async (request, response) => { response.json(await service.employees(request.query, (response.locals.auth as Authenticated).account)); }));
  router.get("/branches", handle(async (request, response) => { response.json(await service.branches(request.query, (response.locals.auth as Authenticated).account)); }));
  return router;
}
