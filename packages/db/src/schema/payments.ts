import { sql } from "drizzle-orm";
import { check, datetime, decimal, int, json, mysqlEnum, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { accounts } from "./auth.js";
import { bookings, invoices } from "./bookings.js";
import { bookingRevisions } from "./booking-revisions.js";

export const cashPayments = mysqlTable("cash_payments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("booking_id", { length: 36 }).notNull().references(() => bookings.id, { onDelete: "restrict" }),
  invoiceId: varchar("invoice_id", { length: 36 }).notNull().references(() => invoices.id, { onDelete: "restrict" }),
  originalAmount: decimal("original_amount", { precision: 24, scale: 3 }).notNull(), amount: decimal("amount", { precision: 24, scale: 3 }).notNull(),
  status: mysqlEnum("status", ["active", "voided"]).notNull().default("active"),
  activeInvoiceId: varchar("active_invoice_id", { length: 36 }).generatedAlwaysAs(sql`CASE WHEN status = 'active' THEN invoice_id ELSE NULL END`, { mode: "stored" }),
  recordedBy: varchar("recorded_by", { length: 36 }).notNull().references(() => accounts.id, { onDelete: "restrict" }),
  recordedAt: datetime("recorded_at", { mode: "date", fsp: 3 }).notNull(), bookingAtReceipt: json("booking_at_receipt").$type<Record<string, unknown>>().notNull(),
}, table => [uniqueIndex("cash_payment_active_invoice_unique").on(table.activeInvoiceId), check("cash_payment_amounts_valid", sql`${table.originalAmount} >= 0 AND ${table.amount} >= 0`)]);

export const cashPaymentEvents = mysqlTable("cash_payment_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("booking_id", { length: 36 }).notNull().references(() => bookings.id, { onDelete: "restrict" }),
  paymentId: varchar("payment_id", { length: 36 }).notNull().references(() => cashPayments.id, { onDelete: "restrict" }),
  version: int("version").notNull(), revisionId: varchar("revision_id", { length: 36 }).references(() => bookingRevisions.id, { onDelete: "restrict" }),
  kind: mysqlEnum("kind", ["recorded", "voided", "extra_cash", "refund"]).notNull(), amount: decimal("amount", { precision: 24, scale: 3 }).notNull(),
  actorAccountId: varchar("actor_account_id", { length: 36 }).notNull().references(() => accounts.id, { onDelete: "restrict" }),
  reason: varchar("reason", { length: 1000 }), occurredAt: datetime("occurred_at", { mode: "date", fsp: 3 }).notNull(),
  before: json("before").$type<Record<string, unknown>>(), after: json("after").$type<Record<string, unknown>>().notNull(),
}, table => [uniqueIndex("cash_event_booking_version_unique").on(table.bookingId, table.version),
  check("cash_event_values_valid", sql`${table.version} > 0 AND ${table.amount} >= 0`),
  check("cash_event_reason_required", sql`${table.kind} = 'recorded' OR (${table.reason} IS NOT NULL AND CHAR_LENGTH(TRIM(${table.reason})) > 0)`),
  check("cash_event_revision_valid", sql`(${table.kind} IN ('recorded', 'voided') AND ${table.revisionId} IS NULL) OR (${table.kind} IN ('extra_cash', 'refund') AND ${table.revisionId} IS NOT NULL)`),
]);
