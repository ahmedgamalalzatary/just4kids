import { boolean, datetime, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const areas = mysqlTable("areas", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [uniqueIndex("areas_name_unique").on(table.name)]);
