import type { createDatabase } from "@just4kids/db";
import type { AuthModule } from "../auth/index.js";
import { createClientController } from "./client.controller.js";
import { createClientRepository } from "./client.repository.js";
import { createClientRouter } from "./client.routes.js";
import { createClientService } from "./client.service.js";

export function createClients(connection: ReturnType<typeof createDatabase>, auth: AuthModule) {
  return createClientRouter(auth, createClientController(createClientService(createClientRepository(connection))));
}
