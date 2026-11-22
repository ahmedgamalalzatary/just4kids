import { datetime, decimal, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { employees } from "./organization.js";

// Only each barber's latest position is kept; every new report replaces the previous one.
export const employeeLocations = mysqlTable("employee_locations", {
  employeeId: varchar("employee_id", { length: 36 }).primaryKey().references(() => employees.accountId, { onDelete: "cascade" }),
  latitude: decimal("latitude", { precision: 9, scale: 6, mode: "number" }).notNull(),
  longitude: decimal("longitude", { precision: 9, scale: 6, mode: "number" }).notNull(),
  // The phone's reported accuracy radius in meters.
  accuracy: int("accuracy").notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
});
