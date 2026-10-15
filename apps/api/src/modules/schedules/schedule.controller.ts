import type { NextFunction, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import type { AuthModule } from "../auth/index.js";
import type { Authenticated } from "../auth/auth.service.js";
import { deny } from "../../lib/security.js";
import type { ScheduleService } from "./schedule.service.js";

function handleError(error: unknown, response: Response, next: NextFunction) {
  if (error instanceof ZodError) { deny(response, 400, "INVALID_INPUT", "Invalid schedule details"); return; }
  next(error);
}

export function createScheduleController(service: ScheduleService, auth: AuthModule) {
  const createBlock: RequestHandler = async (request, response, next) => {
    try {
      const block = await service.createBlock(String(request.params.id), request.body, (response.locals.auth as Authenticated).account);
      response.status(201).json(block);
    } catch (error) { handleError(error, response, next); }
  };
  const deleteBlock: RequestHandler = async (request, response, next) => {
    try {
      const found = await service.deleteBlock(String(request.params.id), String(request.params.blockId), (response.locals.auth as Authenticated).account);
      if (!found) { deny(response, 404, "NOT_FOUND", "Lock not found for this barber. Reload the times"); return; }
      response.status(204).end();
    } catch (error) { handleError(error, response, next); }
  };
  const get: RequestHandler = async (request, response, next) => {
    try {
      const id = String(request.params.id);
      auth.assertCanAccessAccount((response.locals.auth as Authenticated).account, id);
      const schedule = await service.get(id);
      if (!schedule) { deny(response, 404, "NOT_FOUND", "Employee not found"); return; }
      response.json(schedule);
    } catch (error) { next(error); }
  };
  const me: RequestHandler = async (_request, response, next) => {
    try {
      const id = (response.locals.auth as Authenticated).account.id;
      const schedule = await service.get(id);
      if (!schedule) { deny(response, 404, "NOT_FOUND", "Employee not found"); return; }
      response.json(schedule);
    } catch (error) { next(error); }
  };
  const replaceWeekly: RequestHandler = async (request, response, next) => {
    try {
      const schedule = await service.replaceWeekly(String(request.params.id), request.body);
      if (!schedule) { deny(response, 404, "NOT_FOUND", "Employee not found"); return; }
      response.json(schedule);
    } catch (error) { handleError(error, response, next); }
  };
  const replaceException: RequestHandler = async (request, response, next) => {
    try {
      const schedule = await service.replaceException(String(request.params.id), request.params.date, request.body);
      if (!schedule) { deny(response, 404, "NOT_FOUND", "Employee not found"); return; }
      response.json(schedule);
    } catch (error) { handleError(error, response, next); }
  };
  const deleteException: RequestHandler = async (request, response, next) => {
    try {
      const found = await service.deleteException(String(request.params.id), request.params.date);
      if (!found) { deny(response, 404, "NOT_FOUND", "Employee not found"); return; }
      response.status(204).end();
    } catch (error) { handleError(error, response, next); }
  };
  const eligible: RequestHandler = async (request, response, next) => {
    try { response.json(await service.eligible(request.query)); }
    catch (error) { handleError(error, response, next); }
  };
  return { get, me, replaceWeekly, replaceException, deleteException, eligible, createBlock, deleteBlock };
}
