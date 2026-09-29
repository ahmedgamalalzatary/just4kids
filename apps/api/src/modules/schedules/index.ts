import type { createDatabase } from "@just4kids/db";
import type { AuthModule } from "../auth/index.js";
import { createScheduleController } from "./schedule.controller.js";
import { createScheduleRepository } from "./schedule.repository.js";
import { createEligibilityRouter, createScheduleRouter } from "./schedule.routes.js";
import { createScheduleService } from "./schedule.service.js";

export function createSchedules(connection: ReturnType<typeof createDatabase>, auth: AuthModule) {
  const service = createScheduleService(createScheduleRepository(connection));
  const controller = createScheduleController(service, auth);
  const router = createScheduleRouter(auth, controller);
  const eligibleRouter = createEligibilityRouter(auth, controller);
  return { router, eligibleRouter, service };
}
