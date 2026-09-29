import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/index.js";
import * as schema from "../src/schema/index.js";

describe("schedule persistence", () => {
  it("links weekly shifts and date exceptions to employees with unique slots", () => {
    expect(schema).toHaveProperty("employeeWorkIntervals");
    expect(schema).toHaveProperty("employeeScheduleExceptions");
    expect(schema).toHaveProperty("employeeExceptionIntervals");
    if (!("employeeWorkIntervals" in schema && "employeeScheduleExceptions" in schema && "employeeExceptionIntervals" in schema)) return;
    const weekly = getTableConfig(schema.employeeWorkIntervals as import("drizzle-orm/mysql-core").MySqlTable);
    const exceptions = getTableConfig(schema.employeeScheduleExceptions as import("drizzle-orm/mysql-core").MySqlTable);
    const exceptionHours = getTableConfig(schema.employeeExceptionIntervals as import("drizzle-orm/mysql-core").MySqlTable);
    expect(weekly.foreignKeys).toHaveLength(1);
    expect(exceptions.foreignKeys).toHaveLength(1);
    expect(exceptionHours.foreignKeys).toHaveLength(1);
    expect(weekly.uniqueConstraints.length + weekly.primaryKeys.length).toBeGreaterThan(0);
    expect(exceptions.indexes.some(index => index.config.unique)).toBe(true);
  });

  it("installs the schedule tables in isolated MySQL", async () => {
    const connection = createDatabase(process.env.DATABASE_URL ?? "");
    try {
      const [rows] = await connection.db.execute("SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('employee_work_intervals', 'employee_schedule_exceptions', 'employee_exception_intervals')");
      expect(rows).toMatchObject([{ tableCount: 3 }]);
    } finally { await connection.pool.end(); }
  });
});
