import { randomUUID } from "node:crypto";
import { and, asc, count, eq, or, sql } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { clientAddresses, clients, clientStatusEvents } from "@just4kids/db/schema";
import { addressCreateSchema } from "@just4kids/contracts";
import type { AddressCreate, AddressUpdate, ClientCreate, ClientSearch, ClientUpdate } from "@just4kids/contracts";
import { HttpError } from "../../lib/http-error.js";
import { verifyAddressArea } from "../areas/area.repository.js";

function addressValues(address: AddressCreate) {
  return {
    area: address.area,
    block: address.block,
    street: address.street,
    houseNumber: address.houseNumber ?? null,
    buildingName: address.buildingName ?? null,
    avenue: address.avenue ?? null,
    gate: address.gate ?? null,
    blueNumber: address.blueNumber ?? null,
    floor: address.floor ?? null,
    apartment: address.apartment ?? null,
    instructions: address.instructions ?? null,
    mapsUrl: address.mapsUrl ?? null,
    latitude: address.latitude ?? null,
    longitude: address.longitude ?? null,
  };
}

export function createClientRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  async function get(id: string) {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    if (!client) return undefined;
    const addresses = await db.select().from(clientAddresses).where(eq(clientAddresses.clientId, id))
      .orderBy(asc(clientAddresses.createdAt), asc(clientAddresses.id));
    return { client, addresses };
  }
  async function getAddress(clientId: string, addressId: string) {
    const [address] = await db.select().from(clientAddresses).where(and(eq(clientAddresses.clientId, clientId), eq(clientAddresses.id, addressId)));
    return address;
  }
  return {
    get,
    getAddress,
    async findByPhone(phone: string) {
      const [row] = await db.select({ id: clients.id }).from(clients).where(eq(clients.phone, phone));
      return row ? get(row.id) : undefined;
    },
    async list(search: ClientSearch) {
      const pattern = `%${search.q.replace(/[!%_]/g, character => `!${character}`)}%`;
      const filter = and(
        search.q ? or(sql`${clients.name} LIKE ${pattern} ESCAPE '!'`, sql`${clients.phone} LIKE ${pattern} ESCAPE '!'`) : undefined,
        search.status === "all" ? undefined : eq(clients.enabled, search.status === "active"),
      );
      const rows = await db.select().from(clients).where(filter).orderBy(asc(clients.name), asc(clients.id)).limit(search.limit).offset(search.offset);
      const [total] = await db.select({ count: count() }).from(clients).where(filter);
      return { rows, total: total?.count ?? 0 };
    },
    async setEnabled(id: string, enabled: boolean, reason: string, actorAccountId: string) {
      const found = await db.transaction(async transaction => {
        const [client] = await transaction.select().from(clients).where(eq(clients.id, id)).for("update");
        if (!client) return false;
        if (client.enabled === enabled) throw new HttpError(409, "CLIENT_STATUS_UNCHANGED", "حالة العميل لم تتغير");
        const now = new Date();
        await transaction.update(clients).set({ enabled, updatedAt: now }).where(eq(clients.id, id));
        await transaction.insert(clientStatusEvents).values({ id: randomUUID(), clientId: id, enabled, previousEnabled: client.enabled, reason, actorAccountId, occurredAt: now });
        return true;
      });
      return found ? get(id) : undefined;
    },
    async statusEvents(id: string) {
      return db.select().from(clientStatusEvents).where(eq(clientStatusEvents.clientId, id)).orderBy(asc(clientStatusEvents.occurredAt), asc(clientStatusEvents.id));
    },
    async create(input: ClientCreate) {
      const id = randomUUID();
      const now = new Date();
      await db.transaction(async transaction => {
        await verifyAddressArea(transaction, input.address);
        await transaction.insert(clients).values({ id, name: input.name, phone: input.phone, createdAt: now, updatedAt: now });
        await transaction.insert(clientAddresses).values({ id: randomUUID(), clientId: id, ...addressValues(input.address), createdAt: now, updatedAt: now });
      });
      return get(id);
    },
    async update(id: string, input: ClientUpdate) {
      const found = await db.transaction(async transaction => {
        const [client] = await transaction.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).for("update");
        if (!client) return false;
        await transaction.update(clients).set({ ...input, updatedAt: new Date() }).where(eq(clients.id, id));
        return true;
      });
      return found ? get(id) : undefined;
    },
    async addAddress(clientId: string, input: AddressCreate) {
      const id = randomUUID();
      const found = await db.transaction(async transaction => {
        const [client] = await transaction.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).for("update");
        if (!client) return false;
        await verifyAddressArea(transaction, input);
        const now = new Date();
        await transaction.insert(clientAddresses).values({ id, clientId, ...addressValues(input), createdAt: now, updatedAt: now });
        return true;
      });
      return found ? getAddress(clientId, id) : undefined;
    },
    async updateAddress(clientId: string, addressId: string, patch: AddressUpdate) {
      const found = await db.transaction(async transaction => {
        const [client] = await transaction.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).for("update");
        if (!client) return false;
        const [current] = await transaction.select().from(clientAddresses)
          .where(and(eq(clientAddresses.clientId, clientId), eq(clientAddresses.id, addressId))).for("update");
        if (!current) return false;
        const validated = addressCreateSchema.parse({ ...addressValues(current), ...patch });
        await verifyAddressArea(transaction, validated);
        await transaction.update(clientAddresses).set({ ...addressValues(validated), updatedAt: new Date() })
          .where(and(eq(clientAddresses.clientId, clientId), eq(clientAddresses.id, addressId)));
        return true;
      });
      return found ? getAddress(clientId, addressId) : undefined;
    },
  };
}

export type ClientRepository = ReturnType<typeof createClientRepository>;
