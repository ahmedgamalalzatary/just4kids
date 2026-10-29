import { randomUUID, scryptSync } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDatabase } from "../src/index.js";
import { importLegacy, type ImportReport } from "../src/legacy-import/importer.js";
import { legacyId } from "../src/legacy-import/mapping.js";
import { accounts, areas, barberCollections, bookingMessages, bookings, bookingVisitEvents, branches, clientAddresses, clients, employees, employeeWorkDays, employeeWorkIntervals, salonEntries } from "../src/schema/index.js";

const connection = createDatabase(process.env.DATABASE_URL ?? "");
const legacyName = "just4kids_legacy_test";
let server: mysql.Connection, legacy: mysql.Pool;

const legacySchema = `
CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100), role VARCHAR(20), phone VARCHAR(20), is_active TINYINT, created_at DATETIME);
CREATE TABLE barber_details (barber_id INT, display_name VARCHAR(100));
CREATE TABLE barber_working_hours (barber_id INT, weekday TINYINT, start_time TIME, end_time TIME, is_active TINYINT);
CREATE TABLE areas (code VARCHAR(50), name_en VARCHAR(100), is_active TINYINT);
CREATE TABLE customers (id INT PRIMARY KEY, primary_phone VARCHAR(20), area VARCHAR(50), block VARCHAR(50), street VARCHAR(100), building VARCHAR(50), floor VARCHAR(20), apartment VARCHAR(20), avenu VARCHAR(255), G VARCHAR(100), blue VARCHAR(250), location_url TEXT, created_at DATETIME);
CREATE TABLE appointments (id INT PRIMARY KEY, customer_id INT, area VARCHAR(50), barber_id INT, appointment_date DATE, appointment_time TIME, total_children INT, normal_children INT, special_needs_children INT, status VARCHAR(20), is_seen_by_barber TINYINT, notes TEXT, created_at DATETIME, cancel_reason TEXT, updated_at DATETIME, block VARCHAR(250), street VARCHAR(250), building VARCHAR(250), floor VARCHAR(250), apartment VARCHAR(250), avenu VARCHAR(250), G VARCHAR(250), blue VARCHAR(250), completed_at DATETIME);
CREATE TABLE appointment_logs (id BIGINT PRIMARY KEY, appointment_id INT, actor_user_id INT, action_type VARCHAR(50), note TEXT, created_at DATETIME);
CREATE TABLE barber_daily_collections (id INT PRIMARY KEY, barber_id INT, collection_date DATE, normal_children INT, special_children INT, amount_cash DECIMAL(10,3), amount_online DECIMAL(10,3), delivery_amount DECIMAL(10,3), total_amount DECIMAL(10,3), created_at DATETIME);
CREATE TABLE salon_work (id INT PRIMARY KEY, work_date DATE, kidsno INT, link_amount DECIMAL(10,3), cash_amount DECIMAL(10,3), kent_amount DECIMAL(10,3), total_amount DECIMAL(10,3), created_at DATETIME);
INSERT INTO users VALUES (2,'Admin','admin','+96550000002',1,'2025-11-18 09:00:00'),(3,'heneer','barber','+96541110003',1,'2025-11-18 09:00:00'),(4,'leenny','barber','+96541110004',1,'2025-11-18 09:00:00'),(10,'Fabi','barber','96541110010',1,'2026-04-05 01:00:00');
INSERT INTO barber_details VALUES (10,'Fabi');
INSERT INTO barber_working_hours VALUES (10,0,'10:00:00','23:00:00',1),(10,2,'10:00:00','22:00:00',1);
INSERT INTO areas VALUES ('a1','Legacy Test Salmiya',1),('a2','Legacy Test New Area',1);
INSERT INTO customers VALUES
 (1,'41120001','a1','4','12','7','','','','','',NULL,'2025-12-01 08:00:00'),
 (2,'','a1','4','12','7','','','','','',NULL,'2025-12-01 08:00:00'),
 (3,'4112-0001','a2','9','3','15','','','','','','https://maps.example/x','2025-12-02 08:00:00');
INSERT INTO appointments VALUES
 (101,1,'',3,'2026-10-01','10:00:00',0,0,0,'confirmed',1,'one dinar delivery','2026-09-30 07:00:00','','2026-09-30 07:00:00','4','12','7','','','','','',NULL),
 (102,3,'',4,'2026-10-02','13:30:00',2,1,1,'completed',1,NULL,'2026-10-01 07:00:00','','2026-10-02 11:00:00','9','3','15','','','','','','2026-10-02 11:00:00'),
 (103,1,'',3,'2026-10-03','12:00:00',1,1,0,'cancelled',1,NULL,'2026-10-02 07:00:00','client travelling','2026-10-03 06:00:00','4','12','7','','','','','',NULL),
 (104,1,'',10,'2099-01-05','23:30:00',1,1,0,'confirmed',0,NULL,'2026-10-20 07:00:00','','2026-10-20 07:00:00','4','12','7','','','','','',NULL),
 (105,1,'',3,'2026-10-04','10:00:00',1,1,0,'confirmed',1,NULL,'2026-10-02 07:00:00','','2026-10-02 07:00:00','4','','7','','','','','',NULL),
 (106,2,'',3,'2026-10-04','11:00:00',1,1,0,'',1,NULL,'2026-10-02 07:00:00','','2026-10-02 07:00:00','4','12','7','','','','','',NULL);
INSERT INTO appointment_logs VALUES (1,103,3,'cancel',NULL,'2026-10-03 06:00:00'),(2,104,2,'whatsapp_send_to_barber',NULL,'2026-10-20 07:05:00'),(3,102,2,'update',NULL,'2026-10-01 08:00:00');
INSERT INTO barber_daily_collections VALUES (1,10,'2026-08-05',2,0,0,12,62,74,'2026-08-05 20:00:00');
INSERT INTO salon_work VALUES (1,'2026-08-06',5,10,4,2,16,'2026-08-06 20:00:00');`;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  server = await mysql.createConnection({ uri: url.toString(), multipleStatements: true });
  await server.query(`DROP DATABASE IF EXISTS ${legacyName}; CREATE DATABASE ${legacyName}; USE ${legacyName}; ${legacySchema}`);
  url.pathname = `/${legacyName}`;
  legacy = mysql.createPool({ uri: url.toString(), dateStrings: true });
});

afterAll(async () => {
  await legacy.end();
  await server.query(`DROP DATABASE IF EXISTS ${legacyName}`);
  await server.end();
  await connection.pool.end();
});

class Rollback extends Error {}

it("imports the old site's data into the new schema once, following the owner's mapping decisions", async () => {
  const heneer = randomUUID(), lenny = randomUUID(), salon = randomUUID(), now = new Date();
  await expect(connection.db.transaction(async transaction => {
    const [admin] = await transaction.select().from(accounts).where(eq(accounts.role, "admin"));
    const adminId = admin?.id ?? randomUUID();
    if (!admin) await transaction.insert(accounts).values({ id: adminId, phone: "+96541119999", role: "admin", passwordHash: "x", createdAt: now, updatedAt: now });
    // Heneer keeps the old phone; Lenny's phone changed, so the owner's override links old barber 4 to the live account.
    await transaction.insert(accounts).values([[heneer, "+96541110003"], [lenny, "+96541129991"]].map(([id = "", phone = ""]) => ({ id, phone, role: "employee" as const, passwordHash: "x", createdAt: now, updatedAt: now })));
    await transaction.insert(employees).values([{ accountId: heneer, displayName: "Heneer" }, { accountId: lenny, displayName: "Lenny" }].map(row => ({ ...row, createdAt: now, updatedAt: now })));
    await transaction.insert(areas).values({ id: randomUUID(), name: "legacy test salmiya", enabled: true, createdAt: now, updatedAt: now });
    await transaction.insert(branches).values({ id: salon, name: "Legacy Test Salon", address: "x", createdAt: now, updatedAt: now });

    const options = { today: "2026-10-29", salonBranchName: "Legacy Test Salon", barberPhoneOverrides: { 4: "+96541129991" } };
    const report: ImportReport = await importLegacy(transaction, legacy, options);
    expect(report.skipped).toMatchObject({ customersWithoutValidPhone: 1, bookingsWithIncompleteAddress: 1, bookingsWithoutClient: 1, unsupportedEditLogs: 1 });
    expect(report.created).toMatchObject({ employees: 1, areas: 1, clients: 1, addresses: 2, bookings: 4, bookingMessages: 1, barberCollections: 1, salonEntries: 1 });

    // Fabi is new: disabled, password "fabi1234", named from the old profile, and keeps the old weekly hours.
    const fabi = legacyId("user", 10);
    const [account] = await transaction.select().from(accounts).where(eq(accounts.id, fabi));
    expect(account).toMatchObject({ enabled: false, phone: "+96541110010", role: "employee" });
    const [, salt = "", key = ""] = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(account?.passwordHash ?? "") ?? [];
    expect(scryptSync("fabi1234", Buffer.from(salt, "hex"), 64, { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString("hex")).toBe(key);
    expect((await transaction.select().from(employeeWorkDays).where(eq(employeeWorkDays.employeeId, fabi))).filter(day => day.active).map(day => day.dayOfWeek).sort()).toEqual([0, 2]);
    expect(await transaction.select({ startTime: employeeWorkIntervals.startTime, endTime: employeeWorkIntervals.endTime }).from(employeeWorkIntervals).where(and(eq(employeeWorkIntervals.employeeId, fabi), eq(employeeWorkIntervals.dayOfWeek, 0)))).toEqual([{ startTime: "10:00", endTime: "23:00" }]);

    // Both old customers share one phone, so they become one client with two addresses; the matched area keeps its live spelling.
    const [client] = await transaction.select().from(clients).where(eq(clients.phone, "+96541120001"));
    const addresses = await transaction.select().from(clientAddresses).where(eq(clientAddresses.clientId, client?.id ?? ""));
    expect(addresses.map(address => address.area).sort()).toEqual(["Legacy Test New Area", "legacy test salmiya"]);
    expect(addresses.find(address => address.block === "9")?.mapsUrl).toBe("https://maps.example/x");

    const imported = await transaction.select().from(bookings).where(inArray(bookings.id, [101, 102, 103, 104].map(id => legacyId("appointment", id))));
    const byId = (id: number) => imported.find(row => row.id === legacyId("appointment", id));
    expect(byId(101)).toMatchObject({ source: "manual", employeeId: heneer, visitStatus: "completed", visitVersion: 2, childCount: 1, adultCount: 0, startTime: "10:00", endTime: "10:30", notes: "one dinar delivery", createdBy: adminId });
    expect(byId(101)?.createdAt.toISOString()).toBe("2026-09-30T07:00:00.000Z");
    expect(byId(101)?.reference).toBe(`J4K-${legacyId("appointment", 101).replaceAll("-", "").toUpperCase()}`);
    expect(byId(102)).toMatchObject({ employeeId: lenny, visitStatus: "completed", childCount: 2, specialChildCount: 1, employeeSnapshot: { id: lenny, displayName: "Lenny" }, clientSnapshot: { phone: "+96541120001" } });
    expect(byId(103)).toMatchObject({ visitStatus: "cancelled", visitVersion: 1 });
    expect(byId(104)).toMatchObject({ employeeId: fabi, visitStatus: "booked", visitVersion: 0, startTime: "23:30", endTime: "23:59", seenByBarberAt: null });

    const events = await transaction.select().from(bookingVisitEvents).where(inArray(bookingVisitEvents.bookingId, imported.map(row => row.id)));
    const history = (id: number) => events.filter(event => event.bookingId === legacyId("appointment", id)).sort((a, b) => a.version - b.version).map(event => [event.toStatus, event.actorType, event.actorAccountId, event.reason]);
    expect(history(101)).toEqual([["booked", "admin", adminId, null], ["arrived", "system", null, null], ["completed", "system", null, null]]);
    expect(history(102)).toEqual([["booked", "admin", adminId, null], ["arrived", "employee", lenny, null], ["completed", "employee", lenny, null]]);
    expect(history(103)).toEqual([["booked", "admin", adminId, null], ["cancelled", "employee", heneer, "client travelling"]]);
    expect(await transaction.select({ actor: bookingMessages.actorAccountId }).from(bookingMessages).where(eq(bookingMessages.bookingId, legacyId("appointment", 104)))).toEqual([{ actor: adminId }]);

    expect(await transaction.select({ cash: barberCollections.cash, link: barberCollections.link, knet: barberCollections.knet, total: barberCollections.total }).from(barberCollections).where(eq(barberCollections.employeeId, fabi))).toEqual([{ cash: "62.000", link: "12.000", knet: "0.000", total: "74.000" }]);
    expect(await transaction.select({ childCount: salonEntries.childCount, cash: salonEntries.cash, link: salonEntries.link, knet: salonEntries.knet }).from(salonEntries).where(eq(salonEntries.branchId, salon))).toEqual([{ childCount: 5, cash: "4.000", link: "10.000", knet: "2.000" }]);

    // A second run finds every row it already wrote.
    const again = await importLegacy(transaction, legacy, options);
    expect(Object.values(again.created).every(count => count === 0)).toBe(true);
    throw new Rollback();
  })).rejects.toBeInstanceOf(Rollback);
});
