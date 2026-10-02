import { sql } from "drizzle-orm";
import { boolean, check, datetime, int, mysqlEnum, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { accounts } from "./auth.js";
import { clients } from "./clients.js";
import { bookings } from "./bookings.js";

export const bookingVisitEvents = mysqlTable("booking_visit_events", {
  id: varchar("id", { length: 36 }).primaryKey(), bookingId: varchar("booking_id", { length: 36 }).notNull().references(() => bookings.id, { onDelete: "restrict" }),
  version: int("version").notNull(), fromStatus: mysqlEnum("from_status", ["booked", "arrived", "completed", "cancelled", "no_show"]), toStatus: mysqlEnum("to_status", ["booked", "arrived", "completed", "cancelled", "no_show"]).notNull(),
  actorType: mysqlEnum("actor_type", ["admin", "employee", "client", "system"]).notNull(),
  actorAccountId: varchar("actor_account_id", { length: 36 }).references(() => accounts.id, { onDelete: "restrict" }),
  actorClientId: varchar("actor_client_id", { length: 36 }).references(() => clients.id, { onDelete: "restrict" }),
  reason: varchar("reason", { length: 1000 }), correction: boolean("correction").notNull().default(false),
  previousInvoiceStatus: mysqlEnum("previous_invoice_status", ["issued", "cancelled"]), invoiceStatus: mysqlEnum("invoice_status", ["issued", "cancelled"]).notNull(),
  occurredAt: datetime("occurred_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [uniqueIndex("visit_event_booking_version_unique").on(table.bookingId, table.version),
  check("visit_event_actor_valid", sql`(${table.actorType} = 'client' AND ${table.actorClientId} IS NOT NULL AND ${table.actorAccountId} IS NULL) OR (${table.actorType} IN ('admin', 'employee') AND ${table.actorAccountId} IS NOT NULL AND ${table.actorClientId} IS NULL) OR (${table.actorType} = 'system' AND ${table.actorAccountId} IS NULL AND ${table.actorClientId} IS NULL)`),
  check("visit_event_version_valid", sql`${table.version} >= 0`),
  check("visit_event_correction_reason", sql`${table.correction} = false OR CHAR_LENGTH(TRIM(${table.reason})) > 0 AND ${table.reason} IS NOT NULL`),
]);
