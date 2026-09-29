import { healthResponseSchema } from "@just4kids/contracts";
import express from "express";
import type { ErrorRequestHandler } from "express";
import helmet from "helmet";
import type { AuthModule } from "./modules/auth/index.js";
import { HttpError } from "./lib/http-error.js";
import type { createDatabase } from "@just4kids/db";
import type { ApiEnv } from "./configs/env.js";
import { createBranches } from "./modules/branches/index.js";
import { createEmployees } from "./modules/employees/index.js";
import { createSchedules } from "./modules/schedules/index.js";

export function createApp(options?: { auth: AuthModule; connection?: ReturnType<typeof createDatabase>; env?: ApiEnv }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json());

  if (options?.auth) {
    app.use("/auth", (_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
    app.use(options.auth.guardOrigin);
    app.use("/auth", options.auth.router);
    if (options.connection) app.use("/branches", createBranches(options.connection, options.auth));
    if (options.connection && options.env) app.use("/employees", createEmployees(options.connection, options.auth, options.env));
    if (options.connection) {
      const schedules = createSchedules(options.connection, options.auth);
      app.use("/schedules", schedules.router);
      app.use("/availability", schedules.eligibleRouter);
    }
  }

  app.get("/health", (_request, response) => {
    response.json(healthResponseSchema.parse({ status: "ok", service: "api" }));
  });

  app.use((_request, response) => {
    response.status(404).json({ error: { code: "NOT_FOUND", message: "المسار غير موجود" } });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof HttpError) { response.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
    const errorStatus = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    const status = typeof errorStatus === "number" && errorStatus >= 400 && errorStatus < 500 ? errorStatus : 500;
    const code = status === 400 ? "INVALID_JSON" : status === 413 ? "REQUEST_TOO_LARGE" : "INTERNAL_ERROR";
    response.status(status).json({ error: { code, message: "تعذر معالجة الطلب" } });
  };

  app.use(errorHandler);
  return app;
}
