import { randomUUID } from "node:crypto";
import { TransactionRollbackError, and, asc, desc, eq, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { whatsappConversations, whatsappMessages, whatsappRequests } from "@just4kids/db/schema";
import type { WhatsAppStaffAction } from "@just4kids/db/schema";
import type { Inbound } from "./openwa.js";
import type { Decision } from "./ai.js";
import { staffMessage } from "./messages.js";

function isDuplicate(error: unknown) {
  const underlying = typeof error === "object" && error !== null && "cause" in error ? error.cause : error;
  return typeof underlying === "object" && underlying !== null && "code" in underlying && underlying.code === "ER_DUP_ENTRY";
}
const affected = (result: unknown) => (Array.isArray(result) ? result[0] : result as { affectedRows?: number })?.affectedRows ?? 0;
const free = (now: Date) => or(isNull(whatsappConversations.leaseUntil), lt(whatsappConversations.leaseUntil, now));

export function createWhatsAppRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  return {
    /** Stores an inbound message once per OpenWA idempotency key; returns its conversation, or null for a repeat delivery. */
    async receive(inbound: Inbound, now: Date) {
      await db.insert(whatsappConversations).values({ id: randomUUID(), phone: inbound.phone, chatId: inbound.chatId, createdAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({ set: { chatId: inbound.chatId, updatedAt: now } });
      const [conversation] = await db.select({ id: whatsappConversations.id }).from(whatsappConversations).where(eq(whatsappConversations.phone, inbound.phone));
      try {
        await db.insert(whatsappMessages).values({ conversationId: conversation!.id, direction: "inbound", audience: "client", body: inbound.text, status: "pending", idempotencyKey: inbound.key, chatId: inbound.chatId, createdAt: now });
      } catch (error) {
        if (isDuplicate(error)) return null;
        throw error;
      }
      return conversation!.id;
    },
    /** Takes the conversation for one worker; a crashed worker's lease simply expires. */
    async claim(id: string, now: Date, leaseMs: number, respectRetry: boolean) {
      const result = await db.update(whatsappConversations).set({ leaseUntil: new Date(now.getTime() + leaseMs) })
        .where(and(eq(whatsappConversations.id, id), free(now), respectRetry ? or(isNull(whatsappConversations.retryAt), lte(whatsappConversations.retryAt, now)) : undefined));
      return affected(result) === 1;
    },
    async release(id: string) {
      await db.update(whatsappConversations).set({ leaseUntil: null, retryAt: null, failures: 0 }).where(eq(whatsappConversations.id, id));
    },
    /** Releases after a failure and returns the failure count, used for the back-off and the give-up limit. */
    async releaseAfterFailure(id: string, retryAt: (failures: number) => Date) {
      const [row] = await db.select({ failures: whatsappConversations.failures }).from(whatsappConversations).where(eq(whatsappConversations.id, id));
      const failures = (row?.failures ?? 0) + 1;
      await db.update(whatsappConversations).set({ leaseUntil: null, failures, retryAt: retryAt(failures) }).where(eq(whatsappConversations.id, id));
      return failures;
    },
    async conversation(id: string) {
      const [row] = await db.select().from(whatsappConversations).where(eq(whatsappConversations.id, id));
      return row;
    },
    /** Conversations with unfinished work that no worker holds and whose back-off has passed. */
    async due(now: Date) {
      const rows = await db.selectDistinct({ id: whatsappConversations.id }).from(whatsappConversations)
        .innerJoin(whatsappMessages, and(eq(whatsappMessages.conversationId, whatsappConversations.id), eq(whatsappMessages.status, "pending")))
        .where(and(free(now), or(isNull(whatsappConversations.retryAt), lte(whatsappConversations.retryAt, now))));
      return rows.map(row => row.id);
    },
    async pending(id: string, direction: "inbound" | "outbound") {
      return db.select().from(whatsappMessages).where(and(eq(whatsappMessages.conversationId, id), eq(whatsappMessages.direction, direction), eq(whatsappMessages.status, "pending"))).orderBy(asc(whatsappMessages.id));
    },
    /** The client-facing conversation the AI reads: client messages and replies, without staff messages or failed messages. */
    async history(id: string, limit: number) {
      const rows = await db.select({ direction: whatsappMessages.direction, body: whatsappMessages.body }).from(whatsappMessages)
        .where(and(eq(whatsappMessages.conversationId, id), eq(whatsappMessages.audience, "client"), ne(whatsappMessages.status, "failed")))
        .orderBy(desc(whatsappMessages.id)).limit(limit);
      return rows.reverse();
    },
    async requests(id: string) {
      return db.select({ number: whatsappRequests.number, details: whatsappRequests.details }).from(whatsappRequests).where(eq(whatsappRequests.conversationId, id)).orderBy(asc(whatsappRequests.number));
    },
    /** Saves one AI answer atomically: the request, the staff message (sent first), the client reply, and the answered messages. */
    async commitTurn(conversation: { id: string; phone: string; chatId: string }, inboundIds: number[], decision: Decision, staffChatId: string, now: Date) {
      return db.transaction(async transaction => {
        const answered = await transaction.update(whatsappMessages).set({ status: "done", completedAt: now })
          .where(and(inArray(whatsappMessages.id, inboundIds), eq(whatsappMessages.status, "pending")));
        // Another worker answered these messages first.
        if (affected(answered) !== inboundIds.length) transaction.rollback();
        const turnId = randomUUID();
        let action: WhatsAppStaffAction | null = null, requestNumber: number | null = null;
        if (decision.action?.type === "new_request") {
          const { adults, children, address, date, window } = decision.action;
          const [created] = await transaction.insert(whatsappRequests).values({ conversationId: conversation.id, details: { adults, children, address, date, window }, createdAt: now }).$returningId();
          requestNumber = created!.number;
          action = { ...decision.action, requestNumber };
        } else if (decision.action) {
          action = decision.action;
          if (action.type === "update_request") requestNumber = action.requestNumber;
        }
        const outbound = { conversationId: conversation.id, direction: "outbound" as const, status: "pending" as const, turnId, createdAt: now };
        if (action) await transaction.insert(whatsappMessages).values({ ...outbound, audience: "staff", body: staffMessage(action, conversation.phone), idempotencyKey: `j4k-${randomUUID()}`, chatId: staffChatId, action, requestNumber });
        await transaction.insert(whatsappMessages).values({ ...outbound, audience: "client", body: decision.reply, idempotencyKey: `j4k-${randomUUID()}`, chatId: conversation.chatId });
      }).then(() => true, (error: unknown) => { if (error instanceof TransactionRollbackError) return false; throw error; });
    },
    async markSent(id: number, openwaMessageId: string | null, now: Date) {
      await db.update(whatsappMessages).set({ status: "done", openwaMessageId, completedAt: now, attempts: sql`${whatsappMessages.attempts} + 1`, error: null }).where(eq(whatsappMessages.id, id));
    },
    async markAttempt(id: number, error: string) {
      await db.update(whatsappMessages).set({ attempts: sql`${whatsappMessages.attempts} + 1`, error: error.slice(0, 500) }).where(eq(whatsappMessages.id, id));
    },
    /** Gives up on a message and on the rest of its turn: a client reply must not follow a staff message that may not have arrived. */
    async failTurn(message: { id: number; turnId: string | null }, error: string, now: Date) {
      await db.update(whatsappMessages).set({ status: "failed", error: error.slice(0, 500), completedAt: now, attempts: sql`${whatsappMessages.attempts} + 1` }).where(eq(whatsappMessages.id, message.id));
      if (message.turnId) await db.update(whatsappMessages).set({ status: "failed", error: "Not sent: an earlier message of this answer failed", completedAt: now })
        .where(and(eq(whatsappMessages.turnId, message.turnId), eq(whatsappMessages.status, "pending")));
    },
    /** Gives up on client messages the AI cannot answer and queues the staff alert, atomically so a retry cannot alert twice. */
    async giveUp(conversationId: string, inboundIds: number[], error: string, alert: string, staffChatId: string, now: Date) {
      return db.transaction(async transaction => {
        const failed = await transaction.update(whatsappMessages).set({ status: "failed", error: error.slice(0, 500), completedAt: now })
          .where(and(inArray(whatsappMessages.id, inboundIds), eq(whatsappMessages.status, "pending")));
        // Another worker settled these messages first.
        if (affected(failed) !== inboundIds.length) transaction.rollback();
        await transaction.insert(whatsappMessages).values({ conversationId, direction: "outbound", audience: "staff", body: alert, status: "pending", turnId: randomUUID(), idempotencyKey: `j4k-${randomUUID()}`, chatId: staffChatId, createdAt: now });
      }).then(() => true, (error: unknown) => { if (error instanceof TransactionRollbackError) return false; throw error; });
    },
  };
}
export type WhatsAppRepository = ReturnType<typeof createWhatsAppRepository>;
