import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export function equalHex(left: string, right: string): boolean {
  return /^[a-f0-9]{64}$/.test(left) && /^[a-f0-9]{64}$/.test(right) && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function readCookie(request: Request, name: string): string | undefined {
  const matches = (request.headers.cookie ?? "").split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0]?.slice(name.length + 1) : undefined;
}

export function deny(response: Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message } });
}
