import { Router } from "express";
import type { AuthModule } from "../auth/index.js";
import type { createScheduleController } from "./schedule.controller.js";

export function createScheduleRouter(auth: AuthModule, controller: ReturnType<typeof createScheduleController>) {
  const router = Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(auth.requireAuth);
  router.get("/me", controller.me);
  router.get("/:id", controller.get);
  router.put("/:id/weekly", auth.requireAdmin, auth.requireCsrf, controller.replaceWeekly);
  router.put("/:id/exceptions/:date", auth.requireAdmin, auth.requireCsrf, controller.replaceException);
  router.delete("/:id/exceptions/:date", auth.requireAdmin, auth.requireCsrf, controller.deleteException);
  return router;
}

export function createEligibilityRouter(auth: AuthModule, controller: ReturnType<typeof createScheduleController>) {
  const router = Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.get("/eligible", auth.requireAuth, auth.requireAdmin, controller.eligible);
  return router;
}
