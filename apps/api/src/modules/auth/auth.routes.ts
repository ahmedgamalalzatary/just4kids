import { Router } from "express";
import type { RequestHandler } from "express";
import type { createAuthController } from "./auth.controller.js";

export function createAuthRouter(controller: ReturnType<typeof createAuthController>, requireAuth: RequestHandler) {
  const router = Router();
  router.get("/csrf", controller.challenge);
  router.post("/login", controller.login);
  router.get("/session", requireAuth, controller.session);
  router.post("/logout", requireAuth, controller.logout);
  return router;
}
