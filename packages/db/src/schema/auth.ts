import { sql } from "drizzle-orm";
import { boolean, datetime, index, int, mysqlEnum, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const accounts = mysqlTable("accounts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  phone: varchar("phone", { length: 16 }).notNull(),
  role: mysqlEnum("role", ["admin", "employee"]).notNull(),
  adminSlot: int("admin_slot").generatedAlwaysAs(sql`CASE WHEN role = 'admin' THEN 1 ELSE NULL END`, { mode: "stored" }),
  passwordHash: varchar("password_hash", { length: 256 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [uniqueIndex("accounts_phone_unique").on(table.phone), uniqueIndex("accounts_sole_admin_unique").on(table.adminSlot)]);

export const sessions = mysqlTable("sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  accountId: varchar("account_id", { length: 36 }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [index("sessions_account_index").on(table.accountId), index("sessions_expiry_index").on(table.expiresAt)]);

export const loginAttempts = mysqlTable("login_attempts", {
  keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
  attempts: int("attempts").notNull(),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [index("login_attempts_expiry_index").on(table.expiresAt)]);

export type AccountRecord = typeof accounts.$inferSelect;
