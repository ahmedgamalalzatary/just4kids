import { sql } from "drizzle-orm";
import { check, datetime, int, json, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { accounts } from "./auth.js";
import { bookings } from "./bookings.js";

export const bookingRevisions = mysqlTable("booking_revisions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("booking_id", { length: 36 }).notNull().references(() => bookings.id, { onDelete: "restrict" }),
  version: int("version").notNull(),
  actorAccountId: varchar("actor_account_id", { length: 36 }).notNull().references(() => accounts.id, { onDelete: "restrict" }),
  reason: varchar("reason", { length: 1000 }), occurredAt: datetime("occurred_at", { mode: "date", fsp: 3 }).notNull(),
  // Store the complete public reservation/invoice values at each edit; never read historical values from mutable parent records.
  before: json("before").$type<Record<string, unknown>>().notNull(), after: json("after").$type<Record<string, unknown>>().notNull(),
}, table => [uniqueIndex("booking_revision_version_unique").on(table.bookingId, table.version), check("booking_revision_version_valid", sql`${table.version} > 0`)]);
