import type { NextFunction, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { deny } from "../../lib/security.js";
import type { ClientService } from "./client.service.js";

function handleError(error: unknown, response: Response, next: NextFunction) {
  if (error instanceof ZodError) { deny(response, 400, "INVALID_INPUT", "بيانات العميل أو العنوان غير صالحة"); return; }
  next(error);
}

export function createClientController(service: ClientService) {
  const list: RequestHandler = async (request, response, next) => {
    try { response.json(await service.list(request.query)); }
    catch (error) { handleError(error, response, next); }
  };
  const get: RequestHandler = async (request, response, next) => {
    try {
      const client = await service.get(String(request.params.id));
      if (!client) { deny(response, 404, "NOT_FOUND", "العميل غير موجود"); return; }
      response.json(client);
    } catch (error) { next(error); }
  };
  const lookup: RequestHandler = async (request, response, next) => {
    try {
      const client = await service.findByPhone(request.query.phone);
      if (!client) { deny(response, 404, "NOT_FOUND", "العميل غير موجود"); return; }
      response.json(client);
    } catch (error) { handleError(error, response, next); }
  };
  const create: RequestHandler = async (request, response, next) => {
    try { response.status(201).json(await service.create(request.body)); }
    catch (error) { handleError(error, response, next); }
  };
  const update: RequestHandler = async (request, response, next) => {
    try {
      const client = await service.update(String(request.params.id), request.body);
      if (!client) { deny(response, 404, "NOT_FOUND", "العميل غير موجود"); return; }
      response.json(client);
    } catch (error) { handleError(error, response, next); }
  };
  const addAddress: RequestHandler = async (request, response, next) => {
    try {
      const address = await service.addAddress(String(request.params.id), request.body);
      if (!address) { deny(response, 404, "NOT_FOUND", "العميل غير موجود"); return; }
      response.status(201).json(address);
    } catch (error) { handleError(error, response, next); }
  };
  const updateAddress: RequestHandler = async (request, response, next) => {
    try {
      const address = await service.updateAddress(String(request.params.id), String(request.params.addressId), request.body);
      if (!address) { deny(response, 404, "NOT_FOUND", "العنوان غير موجود لهذا العميل"); return; }
      response.json(address);
    } catch (error) { handleError(error, response, next); }
  };
  return { list, get, lookup, create, update, addAddress, updateAddress };
}
