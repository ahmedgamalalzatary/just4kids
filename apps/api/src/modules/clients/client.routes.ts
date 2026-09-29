import { Router } from "express";
import type { AuthModule } from "../auth/index.js";
import type { createClientController } from "./client.controller.js";

export function createClientRouter(auth: AuthModule, controller: ReturnType<typeof createClientController>) {
  const router = Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(auth.requireAuth, auth.requireAdmin);
  router.get("/", controller.list);
  router.post("/", auth.requireCsrf, controller.create);
  router.get("/lookup", controller.lookup);
  router.get("/:id", controller.get);
  router.patch("/:id", auth.requireCsrf, controller.update);
  router.post("/:id/addresses", auth.requireCsrf, controller.addAddress);
  router.patch("/:id/addresses/:addressId", auth.requireCsrf, controller.updateAddress);
  return router;
}
