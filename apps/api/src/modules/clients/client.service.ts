import { addressCreateSchema, addressResponseSchema, addressUpdateSchema, clientCreateSchema, clientResponseSchema, clientSearchSchema, clientSummarySchema, clientUpdateSchema, phoneSchema } from "@just4kids/contracts";
import { HttpError } from "../../lib/http-error.js";
import type { ClientRepository } from "./client.repository.js";

type ClientRow = NonNullable<Awaited<ReturnType<ClientRepository["get"]>>>;
type AddressRow = NonNullable<Awaited<ReturnType<ClientRepository["getAddress"]>>>;

function serializeAddress(address: AddressRow) {
  return addressResponseSchema.parse({ ...address, createdAt: address.createdAt.toISOString(), updatedAt: address.updatedAt.toISOString() });
}

function serializeClient(row: ClientRow) {
  return clientResponseSchema.parse({ ...row.client, createdAt: row.client.createdAt.toISOString(), updatedAt: row.client.updatedAt.toISOString(), addresses: row.addresses.map(serializeAddress) });
}

function duplicatePhone(error: unknown): never {
  const underlying = typeof error === "object" && error !== null && "cause" in error ? error.cause : error;
  if (typeof underlying === "object" && underlying !== null && "code" in underlying && underlying.code === "ER_DUP_ENTRY") {
    throw new HttpError(409, "PHONE_ALREADY_USED", "رقم الهاتف مستخدم بالفعل");
  }
  throw error;
}

export function createClientService(repository: ClientRepository) {
  return {
    async list(query: unknown) {
      const search = clientSearchSchema.parse(query);
      const result = await repository.list(search);
      return { clients: result.rows.map(row => clientSummarySchema.parse({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })), total: result.total, limit: search.limit, offset: search.offset };
    },
    async get(id: string) { const row = await repository.get(id); return row ? serializeClient(row) : undefined; },
    async findByPhone(phoneInput: unknown) {
      const phone = phoneSchema.parse(phoneInput);
      const row = await repository.findByPhone(phone);
      return row ? serializeClient(row) : undefined;
    },
    async create(body: unknown) {
      const input = clientCreateSchema.parse(body);
      try {
        const row = await repository.create(input);
        if (!row) throw new Error("Created client missing from database");
        return serializeClient(row);
      } catch (error) { duplicatePhone(error); }
    },
    async update(id: string, body: unknown) {
      const input = clientUpdateSchema.parse(body);
      try { const row = await repository.update(id, input); return row ? serializeClient(row) : undefined; }
      catch (error) { duplicatePhone(error); }
    },
    async addAddress(clientId: string, body: unknown) {
      const input = addressCreateSchema.parse(body);
      const row = await repository.addAddress(clientId, input);
      return row ? serializeAddress(row) : undefined;
    },
    async updateAddress(clientId: string, addressId: string, body: unknown) {
      const input = addressUpdateSchema.parse(body);
      const row = await repository.updateAddress(clientId, addressId, input);
      return row ? serializeAddress(row) : undefined;
    },
  };
}

export type ClientService = ReturnType<typeof createClientService>;
