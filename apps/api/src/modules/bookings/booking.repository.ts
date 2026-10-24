import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, clients, clientAddresses, bookings, bookingVisitEvents } from "@just4kids/db/schema";
import type { Account, BookingCreate, BookingListQuery, BookingWithClientCreate } from "@just4kids/contracts";
import { bookingAddressSnapshotSchema } from "@just4kids/contracts";
import { ForbiddenError, HttpError } from "../../lib/http-error.js";
import { lockEmployee, readWorkingHours, readBlockingBookings, readTimeBlocks } from "../availability/availability.repository.js";
import { addressValues } from "../clients/client.repository.js";
import { verifyAddressArea } from "../areas/area.repository.js";
import type { Transaction } from "../availability/availability.repository.js";
import { isWindowAvailable } from "../availability/availability.service.js";

export function fils(price: string) { return BigInt(price.replace(".", "")); }
export function money(value: bigint) { return `${value / 1000n}.${(value % 1000n).toString().padStart(3, "0")}`; }
export function assertFutureStart(input: Pick<BookingCreate, "date" | "startTime">) {
  if (new Date(`${input.date}T${input.startTime}:00+03:00`).getTime() <= Date.now()) throw new HttpError(400, "BOOKING_START_NOT_FUTURE", "The reservation must start in the future in Kuwait");
}
export function createBookingRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  async function get(id: string) {
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    return row;
  }
  async function save(input: BookingCreate, accountId: string, transaction: Transaction, newClient?: BookingWithClientCreate["client"]) {
    const [creator] = await transaction.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.role, "admin"), eq(accounts.enabled, true)));
    if (!creator) throw new ForbiddenError();
    const barber = await lockEmployee(transaction, input.employeeId);
    if (!barber) throw new HttpError(404, "EMPLOYEE_NOT_FOUND", "Employee not found");
    if (!barber.account.enabled) throw new HttpError(409, "BARBER_UNAVAILABLE", "Employee unavailable");
    if (newClient) {
      await verifyAddressArea(transaction, newClient.address);
      const createdAt = new Date();
      await transaction.insert(clients).values({ id: input.clientId, phone: newClient.phone, createdAt, updatedAt: createdAt });
      await transaction.insert(clientAddresses).values({ id: input.addressId, clientId: input.clientId, ...addressValues(newClient.address), createdAt, updatedAt: createdAt });
    }
    const [client] = await transaction.select().from(clients).where(eq(clients.id, input.clientId)).for("update");
    if (!client) throw new HttpError(404, "CLIENT_NOT_FOUND", "Client not found");
    if (!client.enabled) throw new HttpError(409, "CLIENT_DISABLED", "This client is stopped. A new reservation cannot be created");
    const [address] = await transaction.select().from(clientAddresses).where(and(eq(clientAddresses.id, input.addressId), eq(clientAddresses.clientId, input.clientId))).for("update");
    if (!address) throw new HttpError(404, "ADDRESS_NOT_FOUND", "Address not found for this client");
    const hours = await readWorkingHours(transaction, input.employeeId, input.date);
    const existing = await readBlockingBookings(transaction, input.employeeId, input.date);
    const blocks = await readTimeBlocks(transaction, input.employeeId, input.date);
    assertFutureStart(input);
    if (!isWindowAvailable({ date: input.date, startTime: input.startTime, endTime: input.endTime }, hours.days, hours.exception, existing.map(row => ({ ...row, status: row.visitStatus })), blocks)) throw new HttpError(409, "BARBER_UNAVAILABLE", "Employee unavailable during the selected window");
    const now = new Date(), id = randomUUID();
    const reference = `J4K-${id.replaceAll("-", "").toUpperCase()}`;
    const addressFields = { area: address.area, block: address.block, street: address.street, houseNumber: address.houseNumber, buildingName: address.buildingName, avenue: address.avenue, gate: address.gate, blueNumber: address.blueNumber, floor: address.floor, apartment: address.apartment, mapsUrl: address.mapsUrl };
    const booking = {
      id, reference, ...input, notes: input.notes ?? null, seenByBarberAt: null, createdBy: accountId, visitStatus: "booked" as const, visitVersion: 0,
      clientSnapshot: { phone: client.phone }, addressSnapshot: bookingAddressSnapshotSchema.parse(addressFields),
      employeeSnapshot: { id: input.employeeId, displayName: barber.employee.displayName }, createdAt: now,
    };
    await transaction.insert(bookings).values(booking);
    await transaction.insert(bookingVisitEvents).values({ id: randomUUID(), bookingId: id, version: 0, fromStatus: null, toStatus: "booked", actorType: "admin", actorAccountId: accountId, reason: null, correction: false, occurredAt: now });
    return booking;
  }
  return {
    get,
    // An old view must not clear the notification for a booking edited or reassigned while the read was pending.
    async markSeenByBarber(id: string, employeeId: string, at: Date, expectedVersion: number) {
      await db.update(bookings).set({ seenByBarberAt: at }).where(and(eq(bookings.id, id), eq(bookings.employeeId, employeeId), eq(bookings.visitVersion, expectedVersion), isNull(bookings.seenByBarberAt)));
    },
    async list(actor: Account, query: BookingListQuery) {
      // Employees only ever see their own bookings, whatever barber filter they send.
      const employeeId = actor.role === "employee" ? actor.id : query.employeeId;
      const filter = and(employeeId ? eq(bookings.employeeId, employeeId) : undefined, query.date ? eq(bookings.date, query.date) : undefined);
      // One day reads as an agenda (earliest first); the full list shows the latest dates first.
      const order = query.date ? [asc(bookings.startTime), asc(bookings.id)] : [desc(bookings.date), desc(bookings.startTime), desc(bookings.id)];
      const rows = await db.select().from(bookings).where(filter).orderBy(...order).limit(query.limit).offset(query.offset);
      const [total] = await db.select({ n: count() }).from(bookings).where(filter);
      return { rows, total: total?.n ?? 0 };
    },
    async create(input: BookingCreate, accountId: string) {
      return db.transaction(transaction => save(input, accountId, transaction));
    },
    async createWithClient(input: BookingWithClientCreate, accountId: string) {
      const { client, ...details } = input;
      const bookingInput = { ...details, clientId: randomUUID(), addressId: randomUUID() };
      return db.transaction(transaction => save(bookingInput, accountId, transaction, client));
    },
  };
}
export type BookingRepository = ReturnType<typeof createBookingRepository>;
