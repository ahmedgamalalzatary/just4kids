import { sql } from "drizzle-orm";
import { check, date, datetime, decimal, foreignKey, index, int, json, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { accounts } from "./auth.js";
import { branches } from "./organization.js";

export const salonEntries = mysqlTable("salon_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  branchId: varchar("branch_id", { length: 36 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  childCount: int("child_count").notNull().default(0),
  cash: decimal("cash", { precision: 24, scale: 3 }).notNull().default("0.000"),
  link: decimal("link", { precision: 24, scale: 3 }).notNull().default("0.000"),
  knet: decimal("knet", { precision: 24, scale: 3 }).notNull().default("0.000"),
  total: decimal("total", { precision: 24, scale: 3 }).notNull().default("0.000"),
  enteredBy: varchar("entered_by", { length: 36 }).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [
  uniqueIndex("salon_entries_branch_date_unique").on(table.branchId, table.date),
  index("salon_entries_date_index").on(table.date),
  foreignKey({ name: "salon_entry_branch_fk", columns: [table.branchId], foreignColumns: [branches.id] }).onDelete("restrict"),
  foreignKey({ name: "salon_entry_entered_by_fk", columns: [table.enteredBy], foreignColumns: [accounts.id] }).onDelete("restrict"),
  check("salon_entry_amounts_valid", sql`${table.childCount} >= 0 AND ${table.cash} >= 0 AND ${table.link} >= 0 AND ${table.knet} >= 0`),
  check("salon_entry_total_valid", sql`${table.total} = ${table.cash} + ${table.link} + ${table.knet}`),
]);

export const salonEntryEvents = mysqlTable("salon_entry_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  entryId: varchar("entry_id", { length: 36 }).notNull(),
  actorAccountId: varchar("actor_account_id", { length: 36 }).notNull(),
  occurredAt: datetime("occurred_at", { mode: "date", fsp: 3 }).notNull(),
  before: json("before").$type<Record<string, unknown>>(),
  after: json("after").$type<Record<string, unknown>>().notNull(),
}, table => [
  index("salon_entry_events_entry_index").on(table.entryId, table.occurredAt),
  foreignKey({ name: "salon_entry_event_entry_fk", columns: [table.entryId], foreignColumns: [salonEntries.id] }).onDelete("restrict"),
  foreignKey({ name: "salon_entry_event_actor_fk", columns: [table.actorAccountId], foreignColumns: [accounts.id] }).onDelete("restrict"),
]);
