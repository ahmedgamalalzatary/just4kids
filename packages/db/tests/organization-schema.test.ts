import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/index.js";
import * as schema from "../src/schema/index.js";

describe("branch and employee persistence", () => {
  it("keeps branch prices in exact three-decimal MySQL columns", () => {
    expect(schema).toHaveProperty("branches");
    if (!("branches" in schema)) return;
    const columns = getTableConfig(schema.branches as import("drizzle-orm/mysql-core").MySqlTable).columns;
    expect(columns.find(column => column.name === "adult_price")?.getSQLType()).toBe("decimal(12,3)");
    expect(columns.find(column => column.name === "child_price")?.getSQLType()).toBe("decimal(12,3)");
  });

  it("links every employee to both an account and a branch", () => {
    expect(schema).toHaveProperty("employees");
    if (!("employees" in schema)) return;
    const config = getTableConfig(schema.employees as import("drizzle-orm/mysql-core").MySqlTable);
    expect(config.foreignKeys).toHaveLength(2);
  });

  it("installs both tables in the isolated MySQL test database", async () => {
    const connection = createDatabase(process.env.DATABASE_URL ?? "");
    try {
      const [rows] = await connection.db.execute("SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('branches', 'employees')");
      expect(rows).toMatchObject([{ tableCount: 2 }]);
    } finally {
      await connection.pool.end();
    }
  });
});
