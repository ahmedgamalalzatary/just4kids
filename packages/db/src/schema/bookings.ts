import { sql } from "drizzle-orm";
import { check, date, datetime, index, int, json, mysqlEnum, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { accounts } from "./auth.js";
import { employees } from "./organization.js";
import { clients, clientAddresses } from "./clients.js";

// Snapshot types are structural so the server-only database package does not depend on contracts.
type ClientSnapshot = { phone: string };
type EmployeeSnapshot = { id: string; displayName: string };
type AddressSnapshot = { area: string; block: string; street: string; houseNumber: string | null; buildingName: string | null; avenue?: string | null; gate?: string | null; blueNumber?: string | null; floor: string | null; apartment: string | null; mapsUrl: string | null };
export const bookings = mysqlTable("bookings", {
  id: varchar("id", { length: 36 }).primaryKey(), reference: varchar("reference", { length: 40 }).notNull(),
  clientId: varchar("client_id", { length: 36 }).notNull().references(() => clients.id, { onDelete: "restrict" }),
  addressId: varchar("address_id", { length: 36 }).notNull().references(() => clientAddresses.id, { onDelete: "restrict" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.accountId, { onDelete: "restrict" }),
  createdBy: varchar("created_by", { length: 36 }).notNull().references(() => accounts.id, { onDelete: "restrict" }),
  date: date("date", { mode: "string" }).notNull(), startTime: varchar("start_time", { length: 5 }).notNull(), endTime: varchar("end_time", { length: 5 }).notNull(),
  adultCount: int("adult_count").notNull(), childCount: int("child_count").notNull(), specialChildCount: int("special_child_count").notNull().default(0),
  notes: varchar("notes", { length: 1000 }),
  seenByBarberAt: datetime("seen_by_barber_at", { mode: "date", fsp: 3 }),
  visitStatus: mysqlEnum("visit_status", ["booked", "arrived", "completed", "cancelled", "no_show"]).notNull().default("booked"),
  visitVersion: int("visit_version").notNull().default(0),
  clientSnapshot: json("client_snapshot").$type<ClientSnapshot>().notNull(), addressSnapshot: json("address_snapshot").$type<AddressSnapshot>().notNull(), employeeSnapshot: json("employee_snapshot").$type<EmployeeSnapshot>().notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [uniqueIndex("bookings_reference_unique").on(table.reference), index("bookings_employee_date_index").on(table.employeeId, table.date), index("bookings_client_index").on(table.clientId),
  check("bookings_counts_valid", sql`${table.adultCount} >= 0 AND ${table.childCount} >= 0 AND ${table.specialChildCount} >= 0 AND ${table.specialChildCount} <= ${table.childCount} AND (${table.adultCount} > 0 OR ${table.childCount} > 0)`),
  check("bookings_window_bounds", sql`TIME_TO_SEC(CONCAT(${table.endTime}, ':00')) - TIME_TO_SEC(CONCAT(${table.startTime}, ':00')) BETWEEN 1200 AND 14400`),
]);
