import type { RequestHandler, Router } from "express";
import type { Account } from "@just4kids/contracts";
import type { createDatabase } from "@just4kids/db";
import type { ApiEnv } from "../../configs/env.js";
import { createAuthMiddlewares } from "../../middlewares/auth.js";
import { createAuthController } from "./auth.controller.js";
import { createAuthRepository } from "./auth.repository.js";
import { createAuthRouter } from "./auth.routes.js";
import { createAuthService } from "./auth.service.js";

export type AuthModule = {
  router: Router;
  initialize(): Promise<void>;
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  assertCanAccessAccount(actor: Pick<Account, "id" | "role">, accountId: string): void;
  guardOrigin: RequestHandler;
};

export function createAuth(connection: ReturnType<typeof createDatabase>, env: ApiEnv): AuthModule {
  const repository = createAuthRepository(connection);
  const service = createAuthService(repository, env);
  const controller = createAuthController(service, env);
  const middlewares = createAuthMiddlewares(service, env, controller.sessionCookieName);
  const router = createAuthRouter(controller, middlewares.requireAuth);
  return { router, initialize: service.initialize, requireAuth: middlewares.requireAuth, requireAdmin: middlewares.requireAdmin, assertCanAccessAccount: service.assertCanAccessAccount, guardOrigin: middlewares.guardOrigin };
}
