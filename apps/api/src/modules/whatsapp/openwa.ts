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
    from: z.string(), to: z.string().nullish(), chatId: z.string().min(1).max(255), body: z.string().nullish(), type: z.string(), fromMe: z.boolean(), isGroup: z.boolean(), kind: z.string(),
    // Present only for @lid senders when OpenWA runs with RESOLVE_LID_TO_PHONE=true; null when it cannot be resolved.
    senderPhone: z.string().nullish(),
    location: z.object({ latitude: z.number(), longitude: z.number() }).nullish(),
  }),
});
export type Inbound = { key: string; phone: string; chatId: string; text: string };
export type OwnMessage = { key: string; phone: string | null; chatId: string; text: string };

const individualText = (data: z.infer<typeof inboundSchema>["data"]) => {
  if (data.isGroup || data.kind !== "individual") return null;
  // A shared location reaches the flow as the Google Maps link staff receive.
  if (data.type === "location" && data.location) return `https://www.google.com/maps?q=${data.location.latitude},${data.location.longitude}`;
  return data.type === "text" && data.body?.trim() ? data.body.trim() : null;
};
const phoneOf = (address: string | null | undefined) => {
  const digits = address?.endsWith("@c.us") ? address.slice(0, -"@c.us".length) : "";
  const phone = phoneSchema.safeParse(`+${digits}`);
  return phone.success ? phone.data : null;
};

/** The client message to answer, or null for every event the intake ignores. */
export function parseInbound(payload: unknown, sessionId: string): Inbound | null {
  const parsed = inboundSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { data, sessionId: session, idempotencyKey } = parsed.data;
  const text = individualText(data);
  if (session !== sessionId || data.fromMe || !text) return null;
  const phone = data.from.endsWith("@lid") ? phoneSchema.safeParse(`+${data.senderPhone ?? ""}`).data ?? null : phoneOf(data.from);
  return phone ? { key: idempotencyKey, phone, chatId: data.chatId, text } : null;
}

/** A message sent from the linked number: typed on the phone, or the system's own send, which the repository tells apart. */
export function parseOwnMessage(payload: unknown, sessionId: string): OwnMessage | null {
  const parsed = z.object({ ...inboundSchema.shape, event: z.literal("message.sent") }).safeParse(payload);
  if (!parsed.success) return null;
  const { data, sessionId: session, idempotencyKey } = parsed.data;
  if (session !== sessionId || !data.fromMe || data.isGroup || data.kind !== "individual") return null;
  return { key: idempotencyKey, phone: phoneOf(data.to) ?? phoneOf(data.chatId), chatId: data.chatId, text: data.body?.trim() || `[${data.type}]` };
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
