import { Router } from "express";
import type { AuthModule } from "../auth/index.js";
import type { createBranchController } from "./branch.controller.js";

export function createBranchRouter(auth: AuthModule, controller: ReturnType<typeof createBranchController>) {
  const router = Router();
  router.use(auth.requireAuth, auth.requireAdmin);
  router.get("/", controller.list);
  router.post("/", auth.requireCsrf, controller.create);
  router.get("/:id", controller.get);
  router.patch("/:id", auth.requireCsrf, controller.update);
  return router;
}
