import type { NextFunction, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import type { AuthModule } from "../auth/index.js";
import type { Authenticated } from "../auth/auth.service.js";
import { deny } from "../../lib/security.js";
import type { EmployeeService } from "./employee.service.js";
import type { EmployeePhotoService } from "./employee-photo.service.js";

function handleError(error: unknown, response: Response, next: NextFunction) {
  if (error instanceof ZodError) { deny(response, 400, "INVALID_INPUT", "بيانات الموظف غير صالحة"); return; }
  next(error);
}

export function createEmployeeController(service: EmployeeService, auth: AuthModule, photos: EmployeePhotoService) {
  const list: RequestHandler = async (_request, response, next) => {
    try { response.json({ employees: await service.list() }); } catch (error) { next(error); }
  };
  const get: RequestHandler = async (request, response, next) => {
    try {
      const actor = (response.locals.auth as Authenticated).account;
      const id = String(request.params.id);
      auth.assertCanAccessAccount(actor, id);
      const employee = await service.get(id);
      if (!employee) { deny(response, 404, "NOT_FOUND", "الموظف غير موجود"); return; }
      response.json(employee);
    } catch (error) { next(error); }
  };
  const me: RequestHandler = async (_request, response, next) => {
    try {
      const actor = (response.locals.auth as Authenticated).account;
      const employee = await service.get(actor.id);
      if (!employee) { deny(response, 404, "NOT_FOUND", "الموظف غير موجود"); return; }
      response.json(employee);
    } catch (error) { next(error); }
  };
  const create: RequestHandler = async (request, response, next) => {
    try { response.status(201).json(await service.create(request.body)); }
    catch (error) { handleError(error, response, next); }
  };
  const updateOwn: RequestHandler = async (request, response, next) => {
    try {
      const actor = (response.locals.auth as Authenticated).account;
      const employee = await service.updateOwnDisplayName(actor.id, request.body);
      if (!employee) { deny(response, 404, "NOT_FOUND", "الموظف غير موجود"); return; }
      response.json(employee);
    } catch (error) { handleError(error, response, next); }
  };
  const updateByAdministrator: RequestHandler = async (request, response, next) => {
    try {
      const employee = await service.updateByAdministrator(String(request.params.id), request.body);
      if (!employee) { deny(response, 404, "NOT_FOUND", "الموظف غير موجود"); return; }
      response.json(employee);
    } catch (error) { handleError(error, response, next); }
  };
  const resetPassword: RequestHandler = async (request, response, next) => {
    try {
      const found = await service.resetPassword(String(request.params.id), request.body);
      if (!found) { deny(response, 404, "NOT_FOUND", "الموظف غير موجود"); return; }
      response.status(204).end();
    } catch (error) { handleError(error, response, next); }
  };
  const getPhoto: RequestHandler = async (request, response, next) => {
    try {
      const path = await photos.read(String(request.params.id));
      if (!path) { deny(response, 404, "PHOTO_NOT_FOUND", "لا توجد صورة لهذا الحلاق"); return; }
      response.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
      response.sendFile(path, { cacheControl: false, dotfiles: "deny" }, error => { if (error && !response.headersSent) next(error); });
    } catch (error) { next(error); }
  };
  const uploadPhoto: RequestHandler = async (request, response, next) => {
    try { await photos.save(String(request.params.id), request.body); response.status(204).end(); }
    catch (error) { next(error); }
  };
  const removePhoto: RequestHandler = async (request, response, next) => {
    try { await photos.remove(String(request.params.id)); response.status(204).end(); }
    catch (error) { next(error); }
  };
  return { list, get, me, create, updateOwn, updateByAdministrator, resetPassword, getPhoto, uploadPhoto, removePhoto };
}
