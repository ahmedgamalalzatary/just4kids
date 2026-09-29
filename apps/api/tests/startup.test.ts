import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { apiEnvSchema } from "../src/configs/env.js";
import { startApi } from "../src/server.js";

async function availablePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No TCP port assigned");
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return address.port;
}

describe("API startup", () => {
  it("synchronizes the administrator before serving authentication requests", async () => {
    const port = await availablePort();
    const env = apiEnvSchema.parse({ NODE_ENV: "test", HOST: "127.0.0.1", PORT: port, DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64), APP_ORIGIN: "http://localhost:3000" });
    const started = await startApi(env);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/auth/csrf`);
      expect(response.status).toBe(200);
      expect((await response.json() as { csrfToken: string }).csrfToken).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await new Promise<void>((resolve, reject) => started.server.close(error => error ? reject(error) : resolve()));
      await started.pool.end();
    }
  });
});
