import { Router } from "express";
import type { RequestHandler } from "express";
import { ZodError } from "zod";
import type { createDatabase } from "@just4kids/db";
import type { AuthModule } from "../auth/index.js";
import type { Authenticated } from "../auth/auth.service.js";
import { deny } from "../../lib/security.js";
import { createBookingRepository } from "./booking.repository.js";
import { createBookingService } from "./booking.service.js";

export function createBookings(connection: ReturnType<typeof createDatabase>, auth: AuthModule) {
  const service = createBookingService(createBookingRepository(connection));
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
  const detail = (invoiceOnly: boolean): RequestHandler => handle(async (request, response) => {
    const booking = await service.get(String(request.params.id), (response.locals.auth as Authenticated).account);
    if (!booking) { deny(response, 404, "NOT_FOUND", "الحجز غير موجود"); return; }
    response.json(invoiceOnly ? booking.invoice : booking);
  });
  router.get("/:id/invoice", detail(true));
  router.get("/:id", detail(false));
  return router;
}
