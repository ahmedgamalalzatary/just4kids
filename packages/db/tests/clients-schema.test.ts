import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/index.js";
import * as schema from "../src/schema/index.js";

describe("client and reusable address persistence", () => {
  it("enforces one client per phone and links addresses to that client", () => {
    expect(schema).toHaveProperty("clients");
    expect(schema).toHaveProperty("clientAddresses");
    if (!("clients" in schema && "clientAddresses" in schema)) return;
    const client = getTableConfig(schema.clients as import("drizzle-orm/mysql-core").MySqlTable);
    const address = getTableConfig(schema.clientAddresses as import("drizzle-orm/mysql-core").MySqlTable);
    expect(client.indexes.some(index => index.config.unique && index.config.columns.some(column => "name" in column && column.name === "phone"))).toBe(true);
    expect(address.foreignKeys).toHaveLength(1);
    expect(address.columns.find(column => column.name === "area")?.notNull).toBe(true);
    expect(address.columns.find(column => column.name === "street")?.notNull).toBe(true);
  });

  it("installs both tables in isolated MySQL", async () => {
    const connection = createDatabase(process.env.DATABASE_URL ?? "");
    try {
      const [rows] = await connection.db.execute("SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('clients', 'client_addresses')");
      expect(rows).toMatchObject([{ tableCount: 2 }]);
    } finally { await connection.pool.end(); }
  });
});
