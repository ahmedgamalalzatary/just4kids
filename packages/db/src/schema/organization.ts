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
  // displayName is the English name; WhatsApp shows the Arabic name to Arabic chats, each falling back to the other.
  displayName: varchar("display_name", { length: 120 }).notNull(),
  displayNameAr: varchar("display_name_ar", { length: 120 }),
  photoUpdatedAt: datetime("photo_updated_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
});
