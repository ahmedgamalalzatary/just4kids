import type { createDatabase } from "@just4kids/db";
import type { ApiEnv } from "../../configs/env.js";
import type { AuthModule } from "../auth/index.js";
import { createEmployeeController } from "./employee.controller.js";
import { createEmployeeRepository } from "./employee.repository.js";
import { createEmployeeRouter } from "./employee.routes.js";
import { createEmployeeService } from "./employee.service.js";

export function createEmployees(connection: ReturnType<typeof createDatabase>, auth: AuthModule, env: ApiEnv) {
  const service = createEmployeeService(createEmployeeRepository(connection), env);
  return createEmployeeRouter(auth, createEmployeeController(service, auth));
}
