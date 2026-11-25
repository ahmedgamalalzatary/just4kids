import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import express, { Router } from "express";
import type { createDatabase } from "@just4kids/db";
import type { WhatsAppSettings } from "../../configs/env.js";
import { deny } from "../../lib/security.js";
import { createAi } from "./ai.js";
import { createBookingRepository } from "../bookings/booking.repository.js";
import { createVisitService } from "../bookings/visit.service.js";
import type { WhatsAppMedia } from "@just4kids/db/schema";
import { createOpenWa, parseInbound, parseOwnMessage, verifySignature } from "./openwa.js";
import type { Photo } from "./openwa.js";
import { createWhatsAppRepository } from "./whatsapp.repository.js";
import { createWhatsAppService } from "./whatsapp.service.js";

const SWEEP_MS = 30_000;
// The owner's behaviour and scenario prompt; the code appends only the fixed technical rules.
export function readOwnerPrompt() {
  return readFileSync(new URL("../../../prompts/whatsapp-ai.md", import.meta.url), "utf8").trim();
}

// The price list photos sent to clients who ask for them from the main menu.
const readPhoto = (filename: string, mimetype: string): Photo => ({ data: readFileSync(new URL(`../../../assets/${filename}`, import.meta.url)), mimetype, filename });
export function readPriceLists(): Record<Exclude<WhatsAppMedia, "barber_photo">, Photo> {
  return { price_list: readPhoto("home-price-list.jpg", "image/jpeg"), salon_price_list: readPhoto("salon-price-list.png", "image/png") };
}
/** A barber's dashboard photo (always stored as JPEG), or null when there is none. */
const barberPhotoReader = (uploadsDir: string) => async (id: string): Promise<Photo | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try { return { data: await readFile(resolve(uploadsDir, "employee-photos", `${id}.jpg`)), mimetype: "image/jpeg", filename: "barber.jpg" }; } catch { return null; }
};

export function createWhatsApp(connection: ReturnType<typeof createDatabase>, settings: WhatsAppSettings, options: { fetch?: typeof fetch; prompt?: string; now?: () => Date; uploadsDir?: string } = {}) {
  const now = options.now ?? (() => new Date());
  const repository = createWhatsAppRepository(connection);
  const service = createWhatsAppService(repository, createBookingRepository(connection), createVisitService(connection), createOpenWa(settings.openwa, options.fetch), createAi(settings.ai, options.fetch), settings, options.prompt ?? readOwnerPrompt(), readPriceLists(), now, barberPhotoReader(options.uploadsDir ?? "uploads"));
  const running = new Set<Promise<void>>();
  const track = (work: Promise<void>) => {
    const tracked = work.catch((error: unknown) => { console.error("WhatsApp processing failed", error instanceof Error ? error.message : error); }).finally(() => running.delete(tracked));
    running.add(tracked);
    return tracked;
  };
  const drain = async () => { await Promise.all((await service.due()).map(id => track(service.process(id, true)))); };
  // Each sweep first queues any reservation-day reminders and unfinished-booking messages that are due, then sends and answers.
  const sweep = async () => { await service.remind(); await service.nudge(); await drain(); };
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
        // A message to a staff number is not a client chat.
        if (!own.phone || !settings.staffPhones.includes(own.phone)) await repository.takeOver(own, now());
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
    start() { void track(sweep()); timer = setInterval(() => { void track(sweep()); }, SWEEP_MS); timer.unref(); },
    async stop() { clearInterval(timer); await Promise.all(running); },
    /** Processes every conversation whose work is due. */
    drain,
    /** Queues the reservation-day reminders that are due. */
    remind: () => service.remind(),
    /** Queues the unfinished-booking messages that are due. */
    nudge: () => service.nudge(),
    /** Resolves once all work started so far has finished. */
    async idle() { while (running.size) await Promise.all(running); },
  };
}
export type WhatsAppModule = ReturnType<typeof createWhatsApp>;
