import { datetime, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { accounts } from "./auth.js";

export const branches = mysqlTable("branches", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  address: varchar("address", { length: 500 }).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
});

export const employees = mysqlTable("employees", {
  accountId: varchar("account_id", { length: 36 }).primaryKey().references(() => accounts.id, { onDelete: "restrict" }),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  photoUpdatedAt: datetime("photo_updated_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
});
