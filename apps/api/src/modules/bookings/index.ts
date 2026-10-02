import { Router } from "express";
import type { RequestHandler } from "express";
import { ZodError } from "zod";
import type { createDatabase } from "@just4kids/db";
import type { AuthModule } from "../auth/index.js";
import type { Authenticated } from "../auth/auth.service.js";
import { deny } from "../../lib/security.js";
import { createBookingRepository } from "./booking.repository.js";
import { createBookingService } from "./booking.service.js";
import { createVisitService } from "./visit.service.js";
import { createBookingEditService } from "./booking-edit.service.js";

export function createBookings(connection: ReturnType<typeof createDatabase>, auth: AuthModule) {
  const service = createBookingService(createBookingRepository(connection));
  const visits = createVisitService(connection);
  const edits = createBookingEditService(connection);
  const router = Router();
  const handle = (action: RequestHandler): RequestHandler => async (request, response, next) => {
    try { await action(request, response, next); }
    catch (error) { if (error instanceof ZodError) { deny(response, 400, "INVALID_INPUT", "بيانات الحجز غير صالحة"); return; } next(error); }
  };
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(auth.requireAuth);
  router.get("/", handle(async (request, response) => { response.json(await service.list(request.query, (response.locals.auth as Authenticated).account)); }));
  router.post("/", auth.requireAdmin, auth.requireCsrf, handle(async (request, response) => {
    response.status(201).json(await service.create(request.body, { kind: "administrator", accountId: (response.locals.auth as Authenticated).account.id }));
  }));
  router.post("/:id/visit", auth.requireCsrf, handle(async (request, response) => { response.json(await visits.transition(String(request.params.id), request.body, (response.locals.auth as Authenticated).account)); }));
  router.patch("/:id", auth.requireAdmin, auth.requireCsrf, handle(async (request, response) => { response.json(await edits.edit(String(request.params.id), request.body, (response.locals.auth as Authenticated).account)); }));
  router.get("/:id/revisions", handle(async (request, response) => { response.json(await edits.revisions(String(request.params.id), (response.locals.auth as Authenticated).account)); }));
  router.post("/:id/visit/correction", auth.requireAdmin, auth.requireCsrf, handle(async (request, response) => { response.json(await visits.correct(String(request.params.id), request.body, (response.locals.auth as Authenticated).account)); }));
  router.get("/:id/history", handle(async (request, response) => { response.json(await visits.history(String(request.params.id), (response.locals.auth as Authenticated).account)); }));
  const detail = (invoiceOnly: boolean): RequestHandler => handle(async (request, response) => {
    const booking = await service.get(String(request.params.id), (response.locals.auth as Authenticated).account);
    if (!booking) { deny(response, 404, "NOT_FOUND", "الحجز غير موجود"); return; }
    response.json(invoiceOnly ? booking.invoice : booking);
  });
  router.get("/:id/invoice", detail(true));
  router.get("/:id", detail(false));
  return router;
}
