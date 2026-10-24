import type { WhatsAppSettings } from "../../configs/env.js";
import type { Ai, ChatMessage, Decision } from "./ai.js";
import { technicalPrompt } from "./messages.js";
import type { OpenWa } from "./openwa.js";
import type { WhatsAppRepository } from "./whatsapp.repository.js";

const LEASE_MS = 5 * 60_000;
// The AI reads at most this many recent client messages and replies; everything stays stored.
const HISTORY_LIMIT = 40;
// Consecutive failures before giving up: about 1.5 hours of retries with the back-off below.
const MAX_AI_FAILURES = 12;
const MAX_SEND_ATTEMPTS = 12;
const backoff = (failures: number) => Math.min(30_000 * 2 ** (failures - 1), 10 * 60_000);

export function createWhatsAppService(repository: WhatsAppRepository, openwa: OpenWa, ai: Ai, settings: WhatsAppSettings, prompt: string, now: () => Date) {
  const staffChatId = `${settings.staffPhone.slice(1)}@c.us`;
  const retryAt = (failures: number) => new Date(now().getTime() + backoff(failures));

  /** Sends the conversation's waiting messages in order; false when a retry is needed later. */
  async function sendPending(id: string) {
    const failedTurns = new Set<string | null>();
    for (const message of await repository.pending(id, "outbound")) {
      // failTurn already marked the rest of a failed turn in the database.
      if (message.turnId && failedTurns.has(message.turnId)) continue;
      const result = await openwa.sendText(message.chatId, message.body, message.idempotencyKey);
      if (result.status === "sent") { await repository.markSent(message.id, result.messageId, now()); continue; }
      if (result.status === "failed" || message.attempts + 1 >= MAX_SEND_ATTEMPTS) { await repository.failTurn(message, result.error, now()); failedTurns.add(message.turnId); continue; }
      await repository.markAttempt(message.id, result.error);
      return false;
    }
    return true;
  }

  /** One AI answer for every waiting client message; false when a retry is needed later. */
  async function answerPending(id: string) {
    const inbound = await repository.pending(id, "inbound");
    if (!inbound.length) return true;
    const conversation = (await repository.conversation(id))!;
    const requests = await repository.requests(id);
    const history = await repository.history(id, HISTORY_LIMIT);
    const messages: ChatMessage[] = [
      { role: "system", content: `${prompt}\n\n${technicalPrompt(now(), requests)}` },
      ...history.map(message => ({ role: message.direction === "inbound" ? "user" as const : "assistant" as const, content: message.body })),
    ];
    let decision: Decision;
    try {
      decision = await ai.decide(messages);
      // The model may only name this client's own requests.
      if (decision.action?.type === "update_request" && !requests.some(request => request.number === (decision.action as { requestNumber: number }).requestNumber)) throw new Error("AI named a request this client does not have");
    } catch (error) {
      console.error(`WhatsApp AI answer failed for conversation ${id}: ${error instanceof Error ? error.message : "unknown error"}`);
      return false;
    }
    await repository.commitTurn(conversation, inbound.map(message => message.id), decision, staffChatId, now());
    return true;
  }

  async function process(id: string, respectRetry: boolean, depth = 0): Promise<void> {
    if (!await repository.claim(id, now(), LEASE_MS, respectRetry)) return;
    try {
      // Messages that arrive while the AI is answering are picked up by the next round.
      for (let round = 0; round < 5; round++) {
        const sent = await sendPending(id);
        const answered = sent && await answerPending(id);
        if (!answered) {
          const failures = await repository.releaseAfterFailure(id, retryAt);
          if (sent && failures >= MAX_AI_FAILURES) {
            await repository.failInbound((await repository.pending(id, "inbound")).map(message => message.id), "No AI answer after repeated attempts", now());
            await repository.release(id);
          }
          return;
        }
        if (!await hasWork(id)) break;
      }
      await repository.release(id);
    } catch (error) {
      await repository.releaseAfterFailure(id, retryAt).catch(() => undefined);
      throw error;
    }
    // A message stored just before the release found the conversation taken; answer it now instead of at the next sweep.
    if (depth < 3 && await hasWork(id)) await process(id, true, depth + 1);
  }
  async function hasWork(id: string) {
    return (await repository.pending(id, "outbound")).length > 0 || (await repository.pending(id, "inbound")).length > 0;
  }

  return {
    process,
    async due() { return repository.due(now()); },
  };
}
