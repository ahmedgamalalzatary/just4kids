import type { createDatabase } from "@just4kids/db";
import type { AuthModule } from "../auth/index.js";
import { createBranchController } from "./branch.controller.js";
import { createBranchRepository } from "./branch.repository.js";
import { createBranchRouter } from "./branch.routes.js";
import { createBranchService } from "./branch.service.js";

export function createBranches(connection: ReturnType<typeof createDatabase>, auth: AuthModule) {
  return createBranchRouter(auth, createBranchController(createBranchService(createBranchRepository(connection))));
}
