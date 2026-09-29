import type { RequestHandler } from "express";
import { ZodError } from "zod";
import { deny } from "../../lib/security.js";
import type { BranchService } from "./branch.service.js";

export function createBranchController(service: BranchService) {
  const list: RequestHandler = async (_request, response, next) => {
    try { response.set("Cache-Control", "no-store").json({ branches: await service.list() }); } catch (error) { next(error); }
  };
  const get: RequestHandler = async (request, response, next) => {
    try {
      const branch = await service.get(String(request.params.id));
      if (!branch) { deny(response, 404, "NOT_FOUND", "الفرع غير موجود"); return; }
      response.set("Cache-Control", "no-store").json(branch);
    } catch (error) { next(error); }
  };
  const create: RequestHandler = async (request, response, next) => {
    try { response.status(201).json(await service.create(request.body)); }
    catch (error) { if (error instanceof ZodError) { deny(response, 400, "INVALID_INPUT", "بيانات الفرع غير صالحة"); return; } next(error); }
  };
  const update: RequestHandler = async (request, response, next) => {
    try {
      const branch = await service.update(String(request.params.id), request.body);
      if (!branch) { deny(response, 404, "NOT_FOUND", "الفرع غير موجود"); return; }
      response.json(branch);
    } catch (error) { if (error instanceof ZodError) { deny(response, 400, "INVALID_INPUT", "بيانات الفرع غير صالحة"); return; } next(error); }
  };
  return { list, get, create, update };
}
