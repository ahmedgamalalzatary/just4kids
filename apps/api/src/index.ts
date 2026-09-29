import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { apiEnvSchema } from "./configs/env.js";
import { startApi } from "./server.js";

const root = new URL("../../../", import.meta.url);
const envFile = process.env.ENV_FILE ?? (process.env.NODE_ENV === "production" ? ".env.production" : ".env");
config({ path: fileURLToPath(new URL(envFile, root)), quiet: true });
const env = apiEnvSchema.parse(process.env);
const { server, pool } = await startApi(env);
console.log(`API listening at http://${env.HOST}:${env.PORT}`);

server.on("error", async (error) => {
  console.error(error);
  process.exitCode = 1;
  await pool.end();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(async (error) => {
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
      await pool.end();
    });
  });
}
