import { randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Database } from "../index.js";
import { accounts, areas, barberCollectionEvents, barberCollections, bookingMessages, bookings, bookingVisitEvents, branches, clientAddresses, clients, employees, employeeWorkDays, employeeWorkIntervals, salonEntries, salonEntryEvents } from "../schema/index.js";
import { bookingWindow, childCounts, collectionAmounts, legacyAddress, legacyId, legacyUtc, normalizePhone, salonAmounts, visitStatus, type ImportedAddress, type LegacyAddressRow } from "./mapping.js";

export type Executor = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type ImportOptions = {
  // Kuwait date of the run: open visits before it are treated as done.
  today: string;
  salonBranchName: string;
  // Old barber id -> phone of the live employee they are, when the phone changed between the two systems.
  barberPhoneOverrides: Record<number, string>;
};
export type ImportReport = { created: Record<string, number>; skipped: Record<string, number> };

type Address = Omit<typeof clientAddresses.$inferSelect, "id" | "clientId" | "createdAt" | "updatedAt">;
type Visit = typeof bookingVisitEvents.$inferInsert;
type Customer = LegacyAddressRow & { id: number; primary_phone: string; area: string | null; location_url: string | null; created_at: string | null };
type Appointment = LegacyAddressRow & { id: number; customer_id: number; area: string; barber_id: number; appointment_date: string; appointment_time: string; total_children: number; normal_children: number; special_needs_children: number; status: string; is_seen_by_barber: number; notes: string | null; created_at: string | null; cancel_reason: string | null; updated_at: string | null; completed_at: string | null };
type Log = { id: number; appointment_id: number; actor_user_id: number | null; action_type: string; created_at: string };
type Collection = { id: number; barber_id: number; collection_date: string; normal_children: number; special_children: number; amount_cash: string; amount_online: string; delivery_amount: string; total_amount: string; created_at: string | null };
type Salon = { id: number; work_date: string; kidsno: number; link_amount: string; cash_amount: string; kent_amount: string; total_amount: string; created_at: string | null };

// Old visit dates and times are Kuwait local time (UTC+3, no daylight saving).
const kuwaitToUtc = (date: string, time: string) => new Date(new Date(`${date}T${time.slice(0, 5)}:00.000Z`).getTime() - 3 * 3600_000);
// Same scrypt format as the API's hashPassword (apps/api/src/lib/password.ts), so the barber can log in with it.
function hashPassword(password: string) {
  const salt = randomBytes(16), key = scryptSync(password, salt, 64, { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return `scrypt$131072$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}
const addressKey = (clientId: string, address: Address) =>
  JSON.stringify([clientId, address.area.toLowerCase(), address.block, address.street, address.houseNumber, address.buildingName, address.avenue, address.gate, address.blueNumber, address.floor, address.apartment]);

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let index = 0; index < rows.length; index += 500) await insert(rows.slice(index, index + 500));
}

// Copies the old PHP site's data into the new schema. Every row gets an id derived from its old id, so a repeated run adds nothing.
export async function importLegacy(transaction: Executor, legacy: Pool, options: ImportOptions): Promise<ImportReport> {
  const read = async <T>(sql: string) => (await legacy.query<RowDataPacket[]>(sql))[0] as T[];
  const created = { employees: 0, areas: 0, clients: 0, addresses: 0, bookings: 0, visitEvents: 0, bookingMessages: 0, barberCollections: 0, salonEntries: 0 };
  const skipped = { customersWithoutValidPhone: 0, customersWithoutAddress: 0, bookingsWithoutClient: 0, bookingsWithoutBarber: 0, bookingsWithIncompleteAddress: 0, unsupportedEditLogs: 0, existingBarberCollections: 0, existingSalonEntries: 0 };
  const now = new Date();

  const [admin] = await transaction.select().from(accounts).where(eq(accounts.role, "admin"));
  if (!admin) throw new Error("The new system has no administrator account yet");
  const [salonBranch] = await transaction.select().from(branches).where(eq(branches.name, options.salonBranchName));
  if (!salonBranch) throw new Error(`Branch "${options.salonBranchName}" was not found`);

  // Barbers: matched to live employees by phone (or the owner's override); unknown ones are created disabled
  // with the owner's starting password: their old name in lower case followed by 1234 (e.g. fabi1234).
  const staff = await transaction.select({ id: accounts.id, phone: accounts.phone, displayName: employees.displayName }).from(accounts).innerJoin(employees, eq(employees.accountId, accounts.id));
  const staffByPhone = new Map(staff.map(row => [row.phone, row]));
  const barbers = new Map<number, { id: string; displayName: string }>(), newBarbers: number[] = [];
  for (const user of await read<{ id: number; name: string; phone: string | null; display_name: string | null }>("SELECT u.id, u.name, u.phone, d.display_name FROM users u LEFT JOIN barber_details d ON d.barber_id = u.id WHERE u.role = 'barber' ORDER BY u.id")) {
    const phone = options.barberPhoneOverrides[user.id] ?? normalizePhone(user.phone);
    if (!phone) throw new Error(`Old barber ${user.id} has no usable phone`);
    const live = staffByPhone.get(phone);
    if (live) { barbers.set(user.id, live); continue; }
    const id = legacyId("user", user.id), displayName = (user.display_name ?? user.name).trim().slice(0, 120);
    const passwordHash = hashPassword(`${user.name.trim().toLowerCase().replace(/\s+/g, "")}1234`);
    await transaction.insert(accounts).values({ id, phone, role: "employee", passwordHash, enabled: false, createdAt: now, updatedAt: now });
    await transaction.insert(employees).values({ accountId: id, displayName, createdAt: now, updatedAt: now });
    barbers.set(user.id, { id, displayName });
    newBarbers.push(user.id);
    created.employees++;
  }
  // Weekly hours are copied only for barbers new to the system; live employees keep the hours already set there.
  const hours = await read<{ barber_id: number; weekday: number; start_time: string; end_time: string; is_active: number }>("SELECT barber_id, weekday, start_time, end_time, is_active FROM barber_working_hours ORDER BY barber_id, weekday, start_time");
  for (const legacyBarber of newBarbers) {
    const employeeId = barbers.get(legacyBarber)?.id ?? "", rows = hours.filter(row => row.barber_id === legacyBarber && row.is_active);
    await transaction.insert(employeeWorkDays).values([0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({ employeeId, dayOfWeek, active: rows.some(row => row.weekday === dayOfWeek) })));
    if (rows.length) await transaction.insert(employeeWorkIntervals).values(rows.map(row => ({ employeeId, dayOfWeek: row.weekday, startTime: row.start_time.slice(0, 5), endTime: row.end_time.slice(0, 5) })));
  }
  const actorFor = (legacyUserId: number | null | undefined) => {
    const barber = legacyUserId == null ? undefined : barbers.get(legacyUserId);
    return barber ? { actorType: "employee" as const, actorAccountId: barber.id } : { actorType: "admin" as const, actorAccountId: admin.id };
  };

  // Areas: matched to live areas by name, ignoring case; missing ones are added.
  const liveAreas = new Map((await transaction.select().from(areas)).map(row => [row.name.toLowerCase(), row.name]));
  const areaNames = new Map<string, string>();
  for (const area of await read<{ code: string; name_en: string; is_active: number }>("SELECT code, name_en, is_active FROM areas")) {
    const name = area.name_en.trim(), key = name.toLowerCase();
    if (!liveAreas.has(key)) {
      await transaction.insert(areas).values({ id: legacyId("area", key), name, enabled: Boolean(area.is_active), createdAt: now, updatedAt: now });
      liveAreas.set(key, name);
      created.areas++;
    }
    areaNames.set(area.code, liveAreas.get(key) ?? name);
  }

  // Clients: one per phone, reusing a live client with the same phone. Addresses are deduplicated per client;
  // customer profiles are read first so their map links win over the same address typed on a booking.
  const clientByPhone = new Map((await transaction.select({ id: clients.id, phone: clients.phone }).from(clients)).map(row => [row.phone, row.id]));
  const addressByKey = new Map<string, { id: string; address: Address }>();
  const columns = { area: clientAddresses.area, block: clientAddresses.block, street: clientAddresses.street, houseNumber: clientAddresses.houseNumber, buildingName: clientAddresses.buildingName, avenue: clientAddresses.avenue, gate: clientAddresses.gate, blueNumber: clientAddresses.blueNumber, floor: clientAddresses.floor, apartment: clientAddresses.apartment, mapsUrl: clientAddresses.mapsUrl };
  for (const { id, clientId, ...address } of await transaction.select({ id: clientAddresses.id, clientId: clientAddresses.clientId, ...columns }).from(clientAddresses)) addressByKey.set(addressKey(clientId, address), { id, address });
  const newClients = new Map<string, typeof clients.$inferInsert>(), newAddresses: (typeof clientAddresses.$inferInsert)[] = [];
  const addressFor = (clientId: string, address: ImportedAddress, createdAt: Date) => {
    const key = addressKey(clientId, address), existing = addressByKey.get(key);
    if (existing) return existing;
    const entry = { id: legacyId("address", key), address };
    addressByKey.set(key, entry);
    newAddresses.push({ id: entry.id, clientId, ...address, createdAt, updatedAt: createdAt });
    return entry;
  };
  const customers = new Map<number, { clientId: string; phone: string; area: string | null }>(), clientsWithAddress = new Set<string>();
  for (const customer of await read<Customer>("SELECT id, primary_phone, area, block, street, building, floor, apartment, avenu, G, blue, location_url, created_at FROM customers ORDER BY id")) {
    const phone = normalizePhone(customer.primary_phone);
    if (!phone) { skipped.customersWithoutValidPhone++; continue; }
    const createdAt = legacyUtc(customer.created_at) ?? now;
    let clientId = clientByPhone.get(phone);
    if (!clientId) {
      clientId = legacyId("customer", customer.id);
      clientByPhone.set(phone, clientId);
      newClients.set(clientId, { id: clientId, phone, createdAt, updatedAt: createdAt });
    }
    customers.set(customer.id, { clientId, phone, area: customer.area });
    const address = legacyAddress(customer, areaNames.get(customer.area ?? "") ?? null, customer.location_url);
    if (address) { addressFor(clientId, address, createdAt); clientsWithAddress.add(clientId); }
  }

  // Bookings: 30-minute windows, open past visits completed, history rebuilt from the old log.
  const logs = new Map<number, Log[]>();
  for (const log of await read<Log>("SELECT id, appointment_id, actor_user_id, action_type, created_at FROM appointment_logs ORDER BY created_at, id")) logs.set(log.appointment_id, [...(logs.get(log.appointment_id) ?? []), log]);
  const existingBookings = new Set((await transaction.select({ id: bookings.id }).from(bookings)).map(row => row.id));
  const newBookings: (typeof bookings.$inferInsert)[] = [], events: Visit[] = [], messages: (typeof bookingMessages.$inferInsert)[] = [];
  for (const row of await read<Appointment>("SELECT * FROM appointments ORDER BY id")) {
    const id = legacyId("appointment", row.id), customer = customers.get(row.customer_id), barber = barbers.get(row.barber_id);
    if (!customer) { skipped.bookingsWithoutClient++; continue; }
    if (!barber) { skipped.bookingsWithoutBarber++; continue; }
    const imported = legacyAddress(row, areaNames.get(row.area || (customer.area ?? "")) ?? null, null);
    if (!imported) { skipped.bookingsWithIncompleteAddress++; continue; }
    if (existingBookings.has(id)) continue;
    const createdAt = legacyUtc(row.created_at) ?? kuwaitToUtc(row.appointment_date, row.appointment_time);
    const address = addressFor(customer.clientId, imported, createdAt);
    clientsWithAddress.add(customer.clientId);
    const window = bookingWindow(row.appointment_time), status = visitStatus(row.status, row.appointment_date, options.today), history = logs.get(row.id) ?? [];
    const visits: Omit<Visit, "id" | "bookingId" | "version">[] = [{ fromStatus: null, toStatus: "booked", actorType: "admin", actorAccountId: admin.id, occurredAt: createdAt }];
    if (status === "completed") {
      const completion = history.findLast(log => log.action_type === "complete");
      const at = legacyUtc(row.completed_at) ?? legacyUtc(completion?.created_at ?? null) ?? kuwaitToUtc(row.appointment_date, window.endTime);
      // Completions the old site never recorded are attributed to the system rather than to a person.
      const actor = row.status !== "completed" ? { actorType: "system" as const, actorAccountId: null } : completion ? actorFor(completion.actor_user_id) : { actorType: "employee" as const, actorAccountId: barber.id };
      visits.push({ fromStatus: "booked", toStatus: "arrived", ...actor, occurredAt: at }, { fromStatus: "arrived", toStatus: "completed", ...actor, occurredAt: at });
    } else if (status === "cancelled") {
      const cancel = history.findLast(log => log.action_type === "cancel");
      const at = legacyUtc(cancel?.created_at ?? null) ?? legacyUtc(row.updated_at) ?? createdAt;
      visits.push({ fromStatus: "booked", toStatus: "cancelled", ...actorFor(cancel?.actor_user_id), reason: row.cancel_reason?.trim().slice(0, 1000) || null, occurredAt: at });
    }
    visits.forEach((visit, version) => events.push({ id: legacyId("visit", `${row.id}:${version}`), bookingId: id, version, ...visit }));
    for (const log of history) {
      if (log.action_type === "whatsapp_send_to_barber") messages.push({ id: legacyId("message", log.id), bookingId: id, kind: "sent_to_barber", actorAccountId: admin.id, occurredAt: legacyUtc(log.created_at) ?? createdAt });
      // Old edits recorded no before/after values, so they cannot become revisions.
      if (log.action_type === "update" || log.action_type === "edit_amounts_admin") skipped.unsupportedEditLogs++;
    }
    newBookings.push({
      // Staff entered every old booking. Remove `source` when merging feat/whatsapp-intake, which drops the column.
      id, reference: `J4K-${id.replaceAll("-", "").toUpperCase()}`, source: "manual", clientId: customer.clientId, addressId: address.id, employeeId: barber.id, createdBy: admin.id,
      date: row.appointment_date, ...window, adultCount: 0, ...childCounts(row.total_children, row.normal_children, row.special_needs_children),
      notes: row.notes?.trim().slice(0, 1000) || null, seenByBarberAt: row.is_seen_by_barber ? createdAt : null, visitStatus: status, visitVersion: visits.length - 1,
      clientSnapshot: { phone: customer.phone }, addressSnapshot: address.address, employeeSnapshot: { id: barber.id, displayName: barber.displayName }, createdAt,
    });
  }
  // A client needs at least one usable address in the new system; clients without one also have no address rows here.
  for (const clientId of newClients.keys()) if (!clientsWithAddress.has(clientId)) { newClients.delete(clientId); skipped.customersWithoutAddress++; }
  await insertChunks([...newClients.values()], chunk => transaction.insert(clients).values(chunk));
  await insertChunks(newAddresses, chunk => transaction.insert(clientAddresses).values(chunk));
  await insertChunks(newBookings, chunk => transaction.insert(bookings).values(chunk));
  await insertChunks(events, chunk => transaction.insert(bookingVisitEvents).values(chunk));
  await insertChunks(messages, chunk => transaction.insert(bookingMessages).values(chunk));
  Object.assign(created, { clients: newClients.size, addresses: newAddresses.length, bookings: newBookings.length, visitEvents: events.length, bookingMessages: messages.length });

  // Daily money: one entry per barber (or salon branch) per day; days already entered in the new system are left alone.
  const collectionDays = new Set((await transaction.select({ employeeId: barberCollections.employeeId, date: barberCollections.date }).from(barberCollections)).map(row => `${row.employeeId}|${row.date}`));
  for (const row of await read<Collection>("SELECT * FROM barber_daily_collections ORDER BY id")) {
    const barber = barbers.get(row.barber_id);
    if (!barber) throw new Error(`Collection ${row.id} belongs to unknown old barber ${row.barber_id}`);
    if (collectionDays.has(`${barber.id}|${row.collection_date}`)) { skipped.existingBarberCollections++; continue; }
    const id = legacyId("collection", row.id), at = legacyUtc(row.created_at) ?? now;
    const values = { employeeId: barber.id, date: row.collection_date, normalChildren: row.normal_children, specialChildren: row.special_children, ...collectionAmounts(row) };
    await transaction.insert(barberCollections).values({ id, ...values, version: 0, enteredBy: admin.id, createdAt: at, updatedAt: at });
    await transaction.insert(barberCollectionEvents).values({ id: legacyId("collection-event", row.id), entryId: id, actorAccountId: admin.id, occurredAt: at, before: null, after: values });
    created.barberCollections++;
  }
  const salonDays = new Set((await transaction.select({ branchId: salonEntries.branchId, date: salonEntries.date }).from(salonEntries)).map(row => `${row.branchId}|${row.date}`));
  for (const row of await read<Salon>("SELECT * FROM salon_work ORDER BY id")) {
    if (salonDays.has(`${salonBranch.id}|${row.work_date}`)) { skipped.existingSalonEntries++; continue; }
    const id = legacyId("salon", row.id), at = legacyUtc(row.created_at) ?? now;
    const values = { branchId: salonBranch.id, date: row.work_date, childCount: row.kidsno, ...salonAmounts(row) };
    await transaction.insert(salonEntries).values({ id, ...values, version: 0, enteredBy: admin.id, createdAt: at, updatedAt: at });
    await transaction.insert(salonEntryEvents).values({ id: legacyId("salon-event", row.id), entryId: id, actorAccountId: admin.id, occurredAt: at, before: null, after: values });
    created.salonEntries++;
  }
  return { created, skipped };
}
