import { sql } from "drizzle-orm";
import { check, date, datetime, decimal, index, int, json, mysqlEnum, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { accounts } from "./auth.js";
import { branches, employees } from "./organization.js";
import { clients, clientAddresses } from "./clients.js";

// Snapshot types are structural so the server-only database package does not depend on contracts.
type ClientSnapshot = { name: string; phone: string };
type EmployeeSnapshot = { id: string; displayName: string; branchId: string; branchName: string; branchLocation: string };
type AddressSnapshot = { area: string; block: string; street: string; houseNumber: string | null; buildingName: string | null; floor: string | null; apartment: string | null; instructions: string | null; mapsUrl: string | null; latitude: string | null; longitude: string | null };
export const bookings = mysqlTable("bookings", {
  id: varchar("id", { length: 36 }).primaryKey(), reference: varchar("reference", { length: 40 }).notNull(),
  clientId: varchar("client_id", { length: 36 }).notNull().references(() => clients.id, { onDelete: "restrict" }),
  addressId: varchar("address_id", { length: 36 }).notNull().references(() => clientAddresses.id, { onDelete: "restrict" }),
  employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.accountId, { onDelete: "restrict" }),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "restrict" }),
  createdBy: varchar("created_by", { length: 36 }).notNull().references(() => accounts.id, { onDelete: "restrict" }),
  date: date("date", { mode: "string" }).notNull(), startTime: varchar("start_time", { length: 5 }).notNull(), endTime: varchar("end_time", { length: 5 }).notNull(),
  adultCount: int("adult_count").notNull(), childCount: int("child_count").notNull(),
  source: mysqlEnum("source", ["manual", "ai"]).notNull(), visitStatus: mysqlEnum("visit_status", ["booked", "arrived", "completed", "cancelled", "no_show"]).notNull().default("booked"),
  clientSnapshot: json("client_snapshot").$type<ClientSnapshot>().notNull(), addressSnapshot: json("address_snapshot").$type<AddressSnapshot>().notNull(), employeeSnapshot: json("employee_snapshot").$type<EmployeeSnapshot>().notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [uniqueIndex("bookings_reference_unique").on(table.reference), index("bookings_employee_date_index").on(table.employeeId, table.date), index("bookings_client_index").on(table.clientId),
  check("bookings_counts_valid", sql`${table.adultCount} >= 0 AND ${table.childCount} >= 0 AND (${table.adultCount} > 0 OR ${table.childCount} > 0)`),
  check("bookings_window_bounds", sql`TIME_TO_SEC(CONCAT(${table.endTime}, ':00')) - TIME_TO_SEC(CONCAT(${table.startTime}, ':00')) BETWEEN 1200 AND 14400`),
]);
export const invoices = mysqlTable("invoices", {
  id: varchar("id", { length: 36 }).primaryKey(), bookingId: varchar("booking_id", { length: 36 }).notNull().references(() => bookings.id, { onDelete: "restrict" }),
  adultUnitPrice: decimal("adult_unit_price", { precision: 12, scale: 3 }).notNull(), childUnitPrice: decimal("child_unit_price", { precision: 12, scale: 3 }).notNull(),
  adultAmount: decimal("adult_amount", { precision: 24, scale: 3 }).notNull(), childAmount: decimal("child_amount", { precision: 24, scale: 3 }).notNull(), total: decimal("total", { precision: 24, scale: 3 }).notNull(),
  status: mysqlEnum("status", ["issued", "cancelled"]).notNull().default("issued"), paymentStatus: mysqlEnum("payment_status", ["unpaid", "paid"]).notNull().default("unpaid"),
  issuedAt: datetime("issued_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [uniqueIndex("invoices_booking_unique").on(table.bookingId), check("invoice_amounts_valid", sql`${table.adultUnitPrice} >= 0 AND ${table.childUnitPrice} >= 0 AND ${table.adultAmount} >= 0 AND ${table.childAmount} >= 0 AND ${table.total} = ${table.adultAmount} + ${table.childAmount}`)]);
