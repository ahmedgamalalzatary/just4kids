import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { apiEnvSchema } from "./env.js";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const env = apiEnvSchema.parse(process.env);
const server = createApp().listen(env.PORT, env.HOST, () => {
  console.log(`API listening at http://${env.HOST}:${env.PORT}`);
});

server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close((error) => {
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
    });
  });
}
