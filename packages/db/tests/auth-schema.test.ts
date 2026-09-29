import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import * as schema from "../src/schema/index.js";
import { createDatabase } from "../src/index.js";

describe("authentication database integrity", () => {
  it("provides database uniqueness for administrator and phone identities", () => {
    expect(schema).toHaveProperty("accounts");
    if (!("accounts" in schema)) return;
    const config = getTableConfig(schema.accounts as import("drizzle-orm/mysql-core").MySqlTable);
    expect(config.indexes.filter(index => index.config.unique).map(index => index.config.name)).toEqual(expect.arrayContaining(["accounts_phone_unique", "accounts_sole_admin_unique"]));
  });

  it("stores session token hashes and links sessions to accounts", () => {
    expect(schema).toHaveProperty("sessions");
    if (!("sessions" in schema)) return;
    const config = getTableConfig(schema.sessions as import("drizzle-orm/mysql-core").MySqlTable);
    expect(config.columns.map(column => column.name)).toContain("token_hash");
    expect(config.columns.map(column => column.name)).not.toContain("token");
    expect(config.foreignKeys).toHaveLength(1);
  });

  it("installs authentication tables in the isolated MySQL test database", async () => {
    const connection = createDatabase(process.env.DATABASE_URL ?? "");
    try {
      const [rows] = await connection.db.execute("SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('accounts', 'sessions', 'login_attempts')");
      expect(rows).toMatchObject([{ tableCount: 3 }]);
    } finally {
      await connection.pool.end();
    }
  });
});
