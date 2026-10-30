import { readFileSync } from "node:fs";
import express, { Router } from "express";
import type { createDatabase } from "@just4kids/db";
import type { WhatsAppSettings } from "../../configs/env.js";
import { deny } from "../../lib/security.js";
import { createAi } from "./ai.js";
import { createBookingRepository } from "../bookings/booking.repository.js";
import { createOpenWa, parseInbound, parseOwnMessage, verifySignature } from "./openwa.js";
import { createWhatsAppRepository } from "./whatsapp.repository.js";
import { createWhatsAppService } from "./whatsapp.service.js";

const SWEEP_MS = 30_000;
// The owner's behaviour and scenario prompt; the code appends only the fixed technical rules.
export function readOwnerPrompt() {
  return readFileSync(new URL("../../../prompts/whatsapp-ai.md", import.meta.url), "utf8").trim();
}

export function createWhatsApp(connection: ReturnType<typeof createDatabase>, settings: WhatsAppSettings, options: { fetch?: typeof fetch; prompt?: string; now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const repository = createWhatsAppRepository(connection);
  const service = createWhatsAppService(repository, createBookingRepository(connection), createOpenWa(settings.openwa, options.fetch), createAi(settings.ai, options.fetch), settings, options.prompt ?? readOwnerPrompt(), now);
  const running = new Set<Promise<void>>();
  const track = (work: Promise<void>) => {
    const tracked = work.catch((error: unknown) => { console.error("WhatsApp processing failed", error instanceof Error ? error.message : error); }).finally(() => running.delete(tracked));
    running.add(tracked);
    return tracked;
  };
  const drain = async () => { await Promise.all((await service.due()).map(id => track(service.process(id, true)))); };
  let timer: NodeJS.Timeout | undefined;

  const router = Router();
  // The signature covers the exact raw bytes, so this route reads the body itself instead of the app's JSON parser.
  router.post("/webhook", express.raw({ type: () => true, limit: "1mb" }), async (request, response, next) => {
    try {
      const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      if (!verifySignature(raw, request.get("X-OpenWA-Signature"), settings.openwa.webhookSecret)) { deny(response, 401, "INVALID_SIGNATURE", "Invalid webhook signature"); return; }
      let payload: unknown;
      try { payload = JSON.parse(raw.toString("utf8")); } catch { deny(response, 400, "INVALID_JSON", "Could not process the request"); return; }
      const own = parseOwnMessage(payload, settings.openwa.sessionId);
      if (own) {
        // A message to the staff number is not a client chat.
        if (own.phone !== settings.staffPhone) await repository.takeOver(own, now());
        response.json({ status: "received" });
        return;
      }
      const inbound = parseInbound(payload, settings.openwa.sessionId);
      if (!inbound) { response.json({ status: "ignored" }); return; }
      const conversationId = await repository.receive(inbound, now());
      // Answering continues after the acknowledgement, so OpenWA's delivery does not wait for the AI.
      if (conversationId) void track(service.process(conversationId, false));
      response.json({ status: "received" });
    } catch (error) { next(error); }
  });

  return {
    router,
    /** Resumes stored work now and then sweeps for retries. */
    start() { void track(drain()); timer = setInterval(() => { void track(drain()); }, SWEEP_MS); timer.unref(); },
    async stop() { clearInterval(timer); await Promise.all(running); },
    /** Processes every conversation whose work is due. */
    drain,
    /** Resolves once all work started so far has finished. */
    async idle() { while (running.size) await Promise.all(running); },
  };
}
export type WhatsAppModule = ReturnType<typeof createWhatsApp>;
