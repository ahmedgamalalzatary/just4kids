import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const result = config({ path: "../../.env.test", override: true, quiet: true });
if (result.error) throw new Error("Create the root .env.test using .env.test.example before migrating the test database.");
const databaseUrl = process.env.DATABASE_URL;
const parsed = databaseUrl && URL.canParse(databaseUrl) ? new URL(databaseUrl) : null;
if (parsed?.protocol !== "mysql:" || parsed.pathname !== "/just4kids_test") {
  throw new Error("Test migrations require the isolated just4kids_test MySQL database.");
}

export default defineConfig({
  dialect: "mysql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl as string },
});
