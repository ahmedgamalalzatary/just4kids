import express, { Router } from "express";
import type { AuthModule } from "../auth/index.js";
import type { createEmployeeController } from "./employee.controller.js";
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from "./employee-photo.service.js";

export function createEmployeeRouter(auth: AuthModule, controller: ReturnType<typeof createEmployeeController>) {
  const router = Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(auth.requireAuth);
  router.get("/", auth.requireAdmin, controller.list);
  router.post("/", auth.requireAdmin, auth.requireCsrf, controller.create);
  router.get("/me", controller.me);
  router.patch("/me", auth.requireCsrf, controller.updateOwn);
  router.get("/:id/photo", controller.getPhoto);
  router.put("/:id/photo", auth.requireAdmin, auth.requireCsrf, express.raw({ type: [...PHOTO_MIME_TYPES], limit: MAX_PHOTO_BYTES }), controller.uploadPhoto);
  router.delete("/:id/photo", auth.requireAdmin, auth.requireCsrf, controller.removePhoto);
  router.get("/:id", controller.get);
  router.patch("/:id", auth.requireAdmin, auth.requireCsrf, controller.updateByAdministrator);
  router.post("/:id/reset-password", auth.requireAdmin, auth.requireCsrf, controller.resetPassword);
  return router;
}
