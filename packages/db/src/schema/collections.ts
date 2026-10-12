import { sql } from "drizzle-orm";
import { check, date, datetime, decimal, foreignKey, index, int, json, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { accounts } from "./auth.js";
import { employees } from "./organization.js";

// One administrator-entered daily collection per barber per day; the barber, comprehensive, and invoice/cash reports read it.
export const barberCollections = mysqlTable("barber_collections", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employeeId: varchar("employee_id", { length: 36 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  normalChildren: int("normal_children").notNull().default(0),
  specialChildren: int("special_children").notNull().default(0),
  cash: decimal("cash", { precision: 24, scale: 3 }).notNull().default("0.000"),
  link: decimal("link", { precision: 24, scale: 3 }).notNull().default("0.000"),
  knet: decimal("knet", { precision: 24, scale: 3 }).notNull().default("0.000"),
  total: decimal("total", { precision: 24, scale: 3 }).notNull().default("0.000"),
  version: int("version").notNull().default(0),
  enteredBy: varchar("entered_by", { length: 36 }).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [
  uniqueIndex("barber_collections_employee_date_unique").on(table.employeeId, table.date),
  index("barber_collections_date_index").on(table.date),
  foreignKey({ name: "barber_collection_employee_fk", columns: [table.employeeId], foreignColumns: [employees.accountId] }).onDelete("restrict"),
  foreignKey({ name: "barber_collection_entered_by_fk", columns: [table.enteredBy], foreignColumns: [accounts.id] }).onDelete("restrict"),
  check("barber_collection_amounts_valid", sql`${table.normalChildren} >= 0 AND ${table.specialChildren} >= 0 AND ${table.cash} >= 0 AND ${table.link} >= 0 AND ${table.knet} >= 0`),
  check("barber_collection_total_valid", sql`${table.total} = ${table.cash} + ${table.link} + ${table.knet}`),
]);

export const barberCollectionEvents = mysqlTable("barber_collection_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  entryId: varchar("entry_id", { length: 36 }).notNull(),
  actorAccountId: varchar("actor_account_id", { length: 36 }).notNull(),
  occurredAt: datetime("occurred_at", { mode: "date", fsp: 3 }).notNull(),
  before: json("before").$type<Record<string, unknown>>(),
  after: json("after").$type<Record<string, unknown>>().notNull(),
}, table => [
  index("barber_collection_events_entry_index").on(table.entryId, table.occurredAt),
  foreignKey({ name: "barber_collection_event_entry_fk", columns: [table.entryId], foreignColumns: [barberCollections.id] }).onDelete("restrict"),
  foreignKey({ name: "barber_collection_event_actor_fk", columns: [table.actorAccountId], foreignColumns: [accounts.id] }).onDelete("restrict"),
]);
