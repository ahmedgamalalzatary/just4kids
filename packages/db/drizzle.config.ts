import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../../.env", quiet: true });
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "mysql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});
