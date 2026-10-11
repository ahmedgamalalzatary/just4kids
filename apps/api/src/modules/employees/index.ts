import type { createDatabase } from "@just4kids/db";
import type { ApiEnv } from "../../configs/env.js";
import type { AuthModule } from "../auth/index.js";
import { createEmployeeController } from "./employee.controller.js";
import { createEmployeePhotoService } from "./employee-photo.service.js";
import { createEmployeeRepository } from "./employee.repository.js";
import { createEmployeeRouter } from "./employee.routes.js";
import { createEmployeeService } from "./employee.service.js";

export function createEmployees(connection: ReturnType<typeof createDatabase>, auth: AuthModule, env: ApiEnv) {
  const repository = createEmployeeRepository(connection);
  const service = createEmployeeService(repository);
  const photos = createEmployeePhotoService({ uploadsDir: env.UPLOADS_DIR, repository });
  return createEmployeeRouter(auth, createEmployeeController(service, auth, photos));
}
