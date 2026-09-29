import { healthResponseSchema } from "@just4kids/contracts";
import express from "express";
import type { ErrorRequestHandler } from "express";
import helmet from "helmet";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json(healthResponseSchema.parse({ status: "ok", service: "api" }));
  });

  app.use((_request, response) => {
    response.status(404).json({ error: { code: "NOT_FOUND", message: "المسار غير موجود" } });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    const errorStatus = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    const status = typeof errorStatus === "number" && errorStatus >= 400 && errorStatus < 500 ? errorStatus : 500;
    const code = status === 400 ? "INVALID_JSON" : status === 413 ? "REQUEST_TOO_LARGE" : "INTERNAL_ERROR";
    response.status(status).json({ error: { code, message: "تعذر معالجة الطلب" } });
  };

  app.use(errorHandler);
  return app;
}
