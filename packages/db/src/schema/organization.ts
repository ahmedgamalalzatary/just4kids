import { sql } from "drizzle-orm";
import { check, datetime, decimal, index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { accounts } from "./auth.js";

export const branches = mysqlTable("branches", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  location: varchar("location", { length: 500 }).notNull(),
  adultPrice: decimal("adult_price", { precision: 12, scale: 3 }).notNull(),
  childPrice: decimal("child_price", { precision: 12, scale: 3 }).notNull(),
  adultDurationMinutes: int("adult_duration_minutes").notNull(),
  childDurationMinutes: int("child_duration_minutes").notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [
  check("branches_adult_price_nonnegative", sql`${table.adultPrice} >= 0`),
  check("branches_child_price_nonnegative", sql`${table.childPrice} >= 0`),
  check("branches_adult_duration_positive", sql`${table.adultDurationMinutes} > 0`),
  check("branches_child_duration_positive", sql`${table.childDurationMinutes} > 0`),
]);

export const employees = mysqlTable("employees", {
  accountId: varchar("account_id", { length: 36 }).primaryKey().references(() => accounts.id, { onDelete: "restrict" }),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "restrict" }),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [index("employees_branch_index").on(table.branchId)]);
