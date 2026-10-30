import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { phoneSchema } from "@just4kids/contracts";
import type { WhatsAppSettings } from "../../configs/env.js";

// OpenWA v0.25.0: X-OpenWA-Signature is "sha256=<hex>" over the exact raw request body.
export function verifySignature(raw: Buffer, header: string | undefined, secret: string) {
  if (typeof header !== "string") return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const inboundSchema = z.object({
  event: z.literal("message.received"), sessionId: z.string(), idempotencyKey: z.string().min(1).max(255),
  data: z.object({
    from: z.string(), chatId: z.string().min(1).max(255), body: z.string(), type: z.string(), fromMe: z.boolean(), isGroup: z.boolean(), kind: z.string(),
    // Present only for @lid senders when OpenWA runs with RESOLVE_LID_TO_PHONE=true; null when it cannot be resolved.
    senderPhone: z.string().nullish(),
  }),
});
export type Inbound = { key: string; phone: string; chatId: string; text: string };

/** The client text message to answer, or null for every event the intake ignores. */
export function parseInbound(payload: unknown, sessionId: string): Inbound | null {
  const parsed = inboundSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { data, sessionId: session, idempotencyKey } = parsed.data;
  if (session !== sessionId || data.fromMe || data.isGroup || data.kind !== "individual" || data.type !== "text" || !data.body.trim()) return null;
  const digits = data.from.endsWith("@lid") ? data.senderPhone : data.from.endsWith("@c.us") ? data.from.slice(0, -"@c.us".length) : null;
  const phone = phoneSchema.safeParse(`+${digits ?? ""}`);
  return phone.success ? { key: idempotencyKey, phone: phone.data, chatId: data.chatId, text: data.body.trim() } : null;
}

export type SendResult = { status: "sent"; messageId: string | null } | { status: "retry"; error: string } | { status: "failed"; error: string };

export function createOpenWa(settings: WhatsAppSettings["openwa"], fetcher: typeof fetch = fetch) {
  return {
    /** Sends once per key: OpenWA replays the first answer for a repeated Idempotency-Key for 24 hours. */
    async sendText(chatId: string, text: string, key: string): Promise<SendResult> {
      let response: Response;
      try {
        response = await fetcher(`${settings.baseUrl}/api/sessions/${encodeURIComponent(settings.sessionId)}/messages/send-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": settings.apiKey, "Idempotency-Key": key },
          body: JSON.stringify({ chatId, text, linkPreview: false }),
          // OpenWA pauses to simulate typing before a send.
          signal: AbortSignal.timeout(60_000),
        });
      } catch (error) {
        return { status: "retry", error: `OpenWA unreachable: ${error instanceof Error ? error.name : "error"}` };
      }
      const body = await response.json().catch(() => null) as { messageId?: unknown; code?: unknown } | null;
      if (response.ok) return { status: "sent", messageId: typeof body?.messageId === "string" ? body.messageId : null };
      const code = typeof body?.code === "string" ? body.code : "";
      // The first attempt may have gone out (or the key was reused), so another attempt could duplicate the message.
      if (code === "IDEMPOTENCY_OUTCOME_UNKNOWN" || code === "IDEMPOTENCY_KEY_REUSED") return { status: "failed", error: `OpenWA ${response.status} ${code}` };
      return { status: "retry", error: `OpenWA ${response.status}${code ? ` ${code}` : ""}` };
    },
  };
}
export type OpenWa = ReturnType<typeof createOpenWa>;
