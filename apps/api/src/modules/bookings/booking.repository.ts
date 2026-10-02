import { randomUUID } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, branches, clients, clientAddresses, bookings, invoices, bookingVisitEvents } from "@just4kids/db/schema";
import type { Account, BookingCreate, BookingListQuery } from "@just4kids/contracts";
import { bookingAddressSnapshotSchema } from "@just4kids/contracts";
import { ForbiddenError, HttpError } from "../../lib/http-error.js";
import { lockEmployee, readWorkingHours, readBlockingBookings } from "../availability/availability.repository.js";
import { isWindowAvailable } from "../availability/availability.service.js";

// Only trusted server code constructs this context. WhatsApp client identity must come from the authenticated sender, never model arguments.
export type BookingActor = { kind: "administrator"; accountId: string } | { kind: "whatsapp"; accountId: string; clientId: string };
function fils(price: string) { return BigInt(price.replace(".", "")); }
function money(value: bigint) { return `${value / 1000n}.${(value % 1000n).toString().padStart(3, "0")}`; }
export function assertFutureStart(input: Pick<BookingCreate, "date" | "startTime">) {
  if (new Date(`${input.date}T${input.startTime}:00+03:00`).getTime() <= Date.now()) throw new HttpError(400, "BOOKING_START_NOT_FUTURE", "يجب أن يبدأ الحجز في المستقبل بتوقيت الكويت");
}
export function createBookingRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  async function get(id: string) {
    const [row] = await db.select({ booking: bookings, invoice: invoices }).from(bookings).innerJoin(invoices, eq(invoices.bookingId, bookings.id)).where(eq(bookings.id, id));
    return row;
  }
  return {
    get,
    async list(actor: Account, query: BookingListQuery) {
      const filter = actor.role === "employee" ? eq(bookings.employeeId, actor.id) : undefined;
      const rows = await db.select({ booking: bookings, invoice: invoices }).from(bookings).innerJoin(invoices, eq(invoices.bookingId, bookings.id)).where(filter).orderBy(desc(bookings.date), desc(bookings.startTime), desc(bookings.id)).limit(query.limit).offset(query.offset);
      const [total] = await db.select({ n: count() }).from(bookings).where(filter);
      return { rows, total: total?.n ?? 0 };
    },
    async create(input: BookingCreate, actor: BookingActor) {
      if (actor.kind === "whatsapp" && actor.clientId !== input.clientId) throw new ForbiddenError();
      return db.transaction(async transaction => {
        const [creator] = await transaction.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, actor.accountId), eq(accounts.role, "admin"), eq(accounts.enabled, true)));
        if (!creator) throw new ForbiddenError();
        const barber = await lockEmployee(transaction, input.employeeId);
        if (!barber) throw new HttpError(404, "EMPLOYEE_NOT_FOUND", "الموظف غير موجود");
        if (!barber.account.enabled) throw new HttpError(409, "BARBER_UNAVAILABLE", "الموظف غير متاح");
        const [branch] = await transaction.select().from(branches).where(eq(branches.id, barber.employee.branchId)).for("update");
        if (!branch) throw new HttpError(404, "BRANCH_NOT_FOUND", "الفرع غير موجود");
        const [client] = await transaction.select().from(clients).where(eq(clients.id, input.clientId)).for("update");
        if (!client) throw new HttpError(404, "CLIENT_NOT_FOUND", "العميل غير موجود");
        const [address] = await transaction.select().from(clientAddresses).where(and(eq(clientAddresses.id, input.addressId), eq(clientAddresses.clientId, input.clientId))).for("update");
        if (!address) throw new HttpError(404, "ADDRESS_NOT_FOUND", "العنوان غير موجود لهذا العميل");
        const hours = await readWorkingHours(transaction, input.employeeId, input.date);
        const existing = await readBlockingBookings(transaction, input.employeeId, input.date);
        assertFutureStart(input);
        if (!isWindowAvailable({ date: input.date, startTime: input.startTime, endTime: input.endTime }, hours.days, hours.exception, existing.map(row => ({ ...row, status: row.visitStatus })))) throw new HttpError(409, "BARBER_UNAVAILABLE", "الموظف غير متاح خلال الفترة المحددة");
        const now = new Date(), id = randomUUID();
        const reference = `J4K-${id.replaceAll("-", "").toUpperCase()}`;
        const addressFields = { area: address.area, block: address.block, street: address.street, houseNumber: address.houseNumber, buildingName: address.buildingName, floor: address.floor, apartment: address.apartment, instructions: address.instructions, mapsUrl: address.mapsUrl, latitude: address.latitude, longitude: address.longitude };
        const booking = {
          id, reference, ...input, branchId: branch.id, createdBy: actor.accountId, source: actor.kind === "administrator" ? "manual" as const : "ai" as const, visitStatus: "booked" as const, visitVersion: 0,
          clientSnapshot: { name: client.name, phone: client.phone }, addressSnapshot: bookingAddressSnapshotSchema.parse(addressFields),
          employeeSnapshot: { id: input.employeeId, displayName: barber.employee.displayName, branchId: branch.id, branchName: branch.name, branchLocation: branch.location }, createdAt: now,
        };
        const adultAmount = fils(branch.adultPrice) * BigInt(input.adultCount), childAmount = fils(branch.childPrice) * BigInt(input.childCount);
        const invoice = { id: randomUUID(), bookingId: id, adultUnitPrice: branch.adultPrice, childUnitPrice: branch.childPrice, adultAmount: money(adultAmount), childAmount: money(childAmount), total: money(adultAmount + childAmount), status: "issued" as const, paymentStatus: "unpaid" as const, issuedAt: now };
        await transaction.insert(bookings).values(booking);
        await transaction.insert(invoices).values(invoice);
        await transaction.insert(bookingVisitEvents).values({ id: randomUUID(), bookingId: id, version: 0, fromStatus: null, toStatus: "booked", actorType: actor.kind === "administrator" ? "admin" : "client", actorAccountId: actor.kind === "administrator" ? actor.accountId : null, actorClientId: actor.kind === "whatsapp" ? actor.clientId : null, reason: null, correction: false, previousInvoiceStatus: null, invoiceStatus: "issued", occurredAt: now });
        return { booking, invoice };
      });
    },
  };
}
export type BookingRepository = ReturnType<typeof createBookingRepository>;
