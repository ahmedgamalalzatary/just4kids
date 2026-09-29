import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const options = { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const dummyPasswordHash = `scrypt$131072$8$1$${"0".repeat(32)}$${"0".repeat(128)}`;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$131072$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const match = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  if (!match?.[1] || !match[2]) return false;
  const key = await derive(password, Buffer.from(match[1], "hex"));
  return timingSafeEqual(key, Buffer.from(match[2], "hex"));
}
