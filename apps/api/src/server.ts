import { createDatabase } from "@just4kids/db";
import { createApp } from "./app.js";
import { createAuth } from "./modules/auth/index.js";
import { createWhatsApp } from "./modules/whatsapp/index.js";
import type { ApiEnv } from "./configs/env.js";

export async function startApi(env: ApiEnv) {
  const connection = createDatabase(env.DATABASE_URL);
  try {
    const auth = createAuth(connection, env);
    await auth.initialize();
    // The intake runs only when every WhatsApp and AI setting is present.
    const whatsapp = env.whatsapp ? createWhatsApp(connection, env.whatsapp) : undefined;
    const server = createApp({ auth, connection, env, ...(whatsapp ? { whatsapp } : {}) }).listen(env.PORT, env.HOST);
    await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    whatsapp?.start();
    return { server, pool: connection.pool, whatsapp };
  } catch (error) {
    await connection.pool.end();
    throw error;
  }
}
