import { expect, it } from "vitest";
import { createDatabase } from "../src/index.js";

it("connects Drizzle to the isolated MySQL test database", async () => {
  expect(process.env.DATABASE_URL, "Vitest must load the root .env.test").toBeDefined();
  const connection = createDatabase(process.env.DATABASE_URL ?? "");
  try {
    const [rows] = await connection.db.execute("SELECT DATABASE() AS databaseName");
    expect(rows).toMatchObject([{ databaseName: "just4kids_test" }]);
  } finally {
    await connection.pool.end();
  }
});
