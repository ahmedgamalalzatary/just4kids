import { Router } from "express";
import { ZodError } from "zod";
import { areaCreateSchema, areaResponseSchema, areaSearchSchema, areaUpdateSchema } from "@just4kids/contracts";
import type { createDatabase } from "@just4kids/db";
import type { AuthModule } from "../auth/index.js";
import { deny } from "../../lib/security.js";
import { HttpError } from "../../lib/http-error.js";
import { createAreaRepository } from "./area.repository.js";

function requestError(error: unknown) {
  if (error instanceof ZodError) return new HttpError(400, "INVALID_INPUT", "Invalid area details");
  const underlying = typeof error === "object" && error !== null && "cause" in error ? error.cause : error;
  if (typeof underlying === "object" && underlying !== null && "code" in underlying && underlying.code === "ER_DUP_ENTRY") return new HttpError(409, "AREA_NAME_EXISTS", "Area name already exists");
  return error;
}
export function createAreas(connection: ReturnType<typeof createDatabase>, auth: AuthModule) {
  const repository = createAreaRepository(connection);
  type Row = NonNullable<Awaited<ReturnType<typeof repository.create>>>;
  const serialize = (row: Row) => areaResponseSchema.parse({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  const router = Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(auth.requireAuth, auth.requireAdmin);
  router.get("/", async (request, response, next) => {
    try { response.json({ areas: (await repository.list(areaSearchSchema.parse(request.query))).map(serialize) }); } catch (error) { next(requestError(error)); }
  });
  router.post("/", auth.requireCsrf, async (request, response, next) => {
    try {
      const row = await repository.create(areaCreateSchema.parse(request.body));
      if (!row) throw new Error("Created area missing from database");
      response.status(201).json(serialize(row));
    } catch (error) { next(requestError(error)); }
  });
  router.patch("/:id", auth.requireCsrf, async (request, response, next) => {
    try {
      const row = await repository.update(String(request.params.id), areaUpdateSchema.parse(request.body));
      if (!row) { deny(response, 404, "NOT_FOUND", "Area not found"); return; }
      response.json(serialize(row));
    } catch (error) { next(requestError(error)); }
  });
  return router;
}
