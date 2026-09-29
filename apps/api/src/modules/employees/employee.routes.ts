import { Router } from "express";
import type { AuthModule } from "../auth/index.js";
import type { createEmployeeController } from "./employee.controller.js";

export function createEmployeeRouter(auth: AuthModule, controller: ReturnType<typeof createEmployeeController>) {
  const router = Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(auth.requireAuth);
  router.get("/", auth.requireAdmin, controller.list);
  router.post("/", auth.requireAdmin, auth.requireCsrf, controller.create);
  router.get("/me", controller.me);
  router.patch("/me", auth.requireCsrf, controller.updateOwn);
  router.get("/:id", controller.get);
  router.patch("/:id", auth.requireAdmin, auth.requireCsrf, controller.updateByAdministrator);
  router.post("/:id/reset-password", auth.requireAdmin, auth.requireCsrf, controller.resetPassword);
  return router;
}
