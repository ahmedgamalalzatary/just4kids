import { sql } from "drizzle-orm";
import { check, datetime, decimal, foreignKey, index, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const clients = mysqlTable("clients", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 16 }).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [uniqueIndex("clients_phone_unique").on(table.phone)]);

export const clientAddresses = mysqlTable("client_addresses", {
  id: varchar("id", { length: 36 }).primaryKey(),
  clientId: varchar("client_id", { length: 36 }).notNull(),
  area: varchar("area", { length: 120 }).notNull(),
  block: varchar("block", { length: 120 }).notNull(),
  street: varchar("street", { length: 200 }).notNull(),
  houseNumber: varchar("house_number", { length: 120 }),
  buildingName: varchar("building_name", { length: 120 }),
  floor: varchar("floor", { length: 120 }),
  apartment: varchar("apartment", { length: 120 }),
  instructions: varchar("instructions", { length: 1000 }),
  mapsUrl: varchar("maps_url", { length: 2048 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [
  index("client_addresses_client_index").on(table.clientId),
  foreignKey({ name: "client_address_client_fk", columns: [table.clientId], foreignColumns: [clients.id] }).onDelete("restrict"),
  check("client_address_has_property", sql`${table.houseNumber} IS NOT NULL OR ${table.buildingName} IS NOT NULL`),
  check("client_address_coordinates_pair", sql`(${table.latitude} IS NULL AND ${table.longitude} IS NULL) OR (${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL)`),
  check("client_address_latitude_range", sql`${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90`),
  check("client_address_longitude_range", sql`${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180`),
]);
