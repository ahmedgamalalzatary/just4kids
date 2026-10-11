import type { createDatabase } from "@just4kids/db";
import type { AuthModule } from "../auth/index.js";
import { createEmployeeController } from "./employee.controller.js";
import { createEmployeeRepository } from "./employee.repository.js";
import { createEmployeeRouter } from "./employee.routes.js";
import { createEmployeeService } from "./employee.service.js";

export function createEmployees(connection: ReturnType<typeof createDatabase>, auth: AuthModule) {
  const service = createEmployeeService(createEmployeeRepository(connection));
  return createEmployeeRouter(auth, createEmployeeController(service, auth));
}
