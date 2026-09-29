import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

const testEnvironment = config({ path: fileURLToPath(new URL("./.env.test", import.meta.url)), override: true, quiet: true });
if (testEnvironment.error) {
  throw new Error("Create the root .env.test using .env.test.example before running tests.");
}
const databaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = databaseUrl && URL.canParse(databaseUrl) ? new URL(databaseUrl) : null;
if (testDatabaseUrl?.protocol !== "mysql:" || testDatabaseUrl?.pathname !== "/just4kids_test") {
  throw new Error("Tests require DATABASE_URL pointing to the isolated just4kids_test MySQL database.");
}
process.env.NODE_ENV = "test";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      "@just4kids/contracts": fileURLToPath(new URL("./packages/contracts/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    projects: [
      { test: { name: "api", fileParallelism: false, include: ["apps/api/tests/**/*.test.ts"] } },
      { test: { name: "web", include: ["apps/web/tests/**/*.test.ts", "apps/web/tests/**/*.test.tsx"] } },
      { test: { name: "contracts", include: ["packages/contracts/tests/**/*.test.ts"] } },
      { test: { name: "db", include: ["packages/db/tests/**/*.test.ts"] } },
      { test: { name: "config", include: ["packages/config/tests/**/*.test.ts"] } }
    ],
  },
});
