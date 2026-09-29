import { createDatabase } from "@just4kids/db";
import { createApp } from "./app.js";
import { createAuth } from "./modules/auth/index.js";
import type { ApiEnv } from "./configs/env.js";

export async function startApi(env: ApiEnv) {
  const connection = createDatabase(env.DATABASE_URL);
  try {
    const auth = createAuth(connection, env);
    await auth.initialize();
    const server = createApp({ auth }).listen(env.PORT, env.HOST);
    await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    return { server, pool: connection.pool };
  } catch (error) {
    await connection.pool.end();
    throw error;
  }
}
