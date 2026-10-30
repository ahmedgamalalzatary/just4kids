import { randomUUID } from "node:crypto";
import { TransactionRollbackError, and, asc, desc, eq, gte, inArray, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, areas, employees, whatsappConversations, whatsappMessages, whatsappRequests } from "@just4kids/db/schema";
import type { WhatsAppStaffAction } from "@just4kids/db/schema";
import type { Transaction } from "../availability/availability.repository.js";
import type { Inbound, OwnMessage } from "./openwa.js";
import type { Turn } from "./flow.js";
import { staffMessage } from "./messages.js";

// Messages the system queues carry this key prefix; a message typed on the phone keeps OpenWA's key.
const OUR_KEY = "j4k-";
const OWN_SEND_REPORT_MS = 15 * 60_000;

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
    /** The barbers and areas the menus offer, always read from the dashboard's data. */
    async options() {
      const barbers = await db.select({ id: employees.accountId, name: employees.displayName }).from(employees).innerJoin(accounts, eq(accounts.id, employees.accountId)).where(eq(accounts.enabled, true)).orderBy(asc(employees.displayName));
      const enabledAreas = await db.select({ id: areas.id, name: areas.name }).from(areas).where(eq(areas.enabled, true)).orderBy(asc(areas.name));
      return { barbers, areas: enabledAreas };
    },
    async administrator() {
      const [admin] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.role, "admin"), eq(accounts.enabled, true)));
      return admin?.id ?? null;
    },
    /** Saves one client message's outcome atomically: the flow, the request, the staff message (sent first), and the client reply. */
    async commitTurn(conversation: { id: string; phone: string; chatId: string }, inboundId: number, turn: Turn, staffChatId: string, earlierRequests: number[], now: Date) {
      return db.transaction(async transaction => {
        const answered = await transaction.update(whatsappMessages).set({ status: "done", completedAt: now })
          .where(and(eq(whatsappMessages.id, inboundId), eq(whatsappMessages.status, "pending")));
        // Another worker answered this message first.
        if (affected(answered) !== 1) transaction.rollback();
        await transaction.update(whatsappConversations).set({ flow: turn.state, updatedAt: now }).where(eq(whatsappConversations.id, conversation.id));
        const turnId = randomUUID();
        const outbound = { conversationId: conversation.id, direction: "outbound" as const, status: "pending" as const, turnId, createdAt: now };
        if (turn.staff) {
          let action: WhatsAppStaffAction, requestNumber: number | null = null;
          if (turn.staff.type === "new_request") {
            const [created] = await transaction.insert(whatsappRequests).values({ conversationId: conversation.id, details: turn.staff.details, createdAt: now }).$returningId();
            requestNumber = created!.number;
            action = { type: "new_request", requestNumber, ...turn.staff.details };
          } else action = turn.staff;
          await transaction.insert(whatsappMessages).values({ ...outbound, audience: "staff", body: staffMessage(turn.staff, conversation.phone, requestNumber, earlierRequests), idempotencyKey: `j4k-${randomUUID()}`, chatId: staffChatId, action, requestNumber });
        }
        await transaction.insert(whatsappMessages).values({ ...outbound, audience: "client", body: turn.reply, idempotencyKey: `j4k-${randomUUID()}`, chatId: conversation.chatId });
      }).then(() => true, (error: unknown) => { if (error instanceof TransactionRollbackError) return false; throw error; });
    },
    /** Answers a message without changing a client's flow: a staff command's reply, or a client message while staff handle the chat. */
    async answerPlainly(conversation: { id: string; chatId: string }, inboundId: number, reply: string | null, now: Date, audience: "client" | "staff" = "staff") {
      await db.transaction(async transaction => {
        await transaction.update(whatsappMessages).set({ status: "done", completedAt: now }).where(and(eq(whatsappMessages.id, inboundId), eq(whatsappMessages.status, "pending")));
        if (reply) await transaction.insert(whatsappMessages).values({ conversationId: conversation.id, direction: "outbound", audience, status: "pending", turnId: randomUUID(), body: reply, idempotencyKey: `j4k-${randomUUID()}`, chatId: conversation.chatId, createdAt: now });
      });
    },
    /** The request with its client's conversation, for a staff decision. */
    async requestForDecision(number: number) {
      const [row] = await db.select({ request: whatsappRequests, conversation: whatsappConversations }).from(whatsappRequests).innerJoin(whatsappConversations, eq(whatsappConversations.id, whatsappRequests.conversationId)).where(eq(whatsappRequests.number, number));
      return row;
    },
    /** Inside the reservation's transaction: records the approval, tells the client, and finishes the staff message. An earlier decision rolls everything back. */
    async settleApproval(transaction: Transaction, number: number, bookingId: string, client: { id: string; chatId: string }, clientReply: string, staff: { id: string; chatId: string }, staffInboundId: number, staffReply: string, now: Date) {
      const updated = await transaction.update(whatsappRequests).set({ status: "approved", bookingId, decidedAt: now }).where(and(eq(whatsappRequests.number, number), eq(whatsappRequests.status, "pending")));
      if (affected(updated) !== 1) transaction.rollback();
      await transaction.update(whatsappMessages).set({ status: "done", completedAt: now }).where(eq(whatsappMessages.id, staffInboundId));
      const outbound = { direction: "outbound" as const, status: "pending" as const, createdAt: now };
      await transaction.insert(whatsappMessages).values([
        { ...outbound, conversationId: staff.id, audience: "staff", turnId: randomUUID(), body: staffReply, idempotencyKey: `j4k-${randomUUID()}`, chatId: staff.chatId },
        { ...outbound, conversationId: client.id, audience: "client", turnId: randomUUID(), body: clientReply, idempotencyKey: `j4k-${randomUUID()}`, chatId: client.chatId, requestNumber: number },
      ]);
    },
    async reject(number: number, client: { id: string; chatId: string }, clientReply: string, staff: { id: string; chatId: string }, staffInboundId: number, staffReply: string, now: Date) {
      return db.transaction(async transaction => {
        const updated = await transaction.update(whatsappRequests).set({ status: "rejected", decidedAt: now }).where(and(eq(whatsappRequests.number, number), eq(whatsappRequests.status, "pending")));
        if (affected(updated) !== 1) transaction.rollback();
        await transaction.update(whatsappMessages).set({ status: "done", completedAt: now }).where(eq(whatsappMessages.id, staffInboundId));
        const outbound = { direction: "outbound" as const, status: "pending" as const, createdAt: now };
        await transaction.insert(whatsappMessages).values([
          { ...outbound, conversationId: staff.id, audience: "staff", turnId: randomUUID(), body: staffReply, idempotencyKey: `j4k-${randomUUID()}`, chatId: staff.chatId },
          { ...outbound, conversationId: client.id, audience: "client", turnId: randomUUID(), body: clientReply, idempotencyKey: `j4k-${randomUUID()}`, chatId: client.chatId, requestNumber: number },
        ]);
      }).then(() => true, (error: unknown) => { if (error instanceof TransactionRollbackError) return false; throw error; });
    },
    /** Staff replied from the business phone: the AI stops for this client and the reply joins the conversation. */
    async takeOver(own: OwnMessage, now: Date) {
      const [known] = await db.select().from(whatsappConversations).where(own.phone ? or(eq(whatsappConversations.chatId, own.chatId), eq(whatsappConversations.phone, own.phone)) : eq(whatsappConversations.chatId, own.chatId));
      if (!known && !own.phone) return;
      const id = known?.id ?? randomUUID();
      // OpenWA reports the system's own sends too, sometimes before the send call returns, so its message id may not be stored yet.
      if (known) {
        const ours = await db.select({ body: whatsappMessages.body }).from(whatsappMessages).where(and(
          eq(whatsappMessages.conversationId, known.id), eq(whatsappMessages.direction, "outbound"), like(whatsappMessages.idempotencyKey, `${OUR_KEY}%`),
          or(eq(whatsappMessages.status, "pending"), gte(whatsappMessages.completedAt, new Date(now.getTime() - OWN_SEND_REPORT_MS))),
        ));
        if (ours.some(row => row.body.trim() === own.text)) return;
      }
      if (known) await db.update(whatsappConversations).set({ aiPaused: true, updatedAt: now }).where(eq(whatsappConversations.id, id));
      else await db.insert(whatsappConversations).values({ id, phone: own.phone!, chatId: own.chatId, aiPaused: true, createdAt: now, updatedAt: now });
      try {
        await db.insert(whatsappMessages).values({ conversationId: id, direction: "outbound", audience: "client", body: own.text, status: "done", idempotencyKey: own.key, chatId: own.chatId, createdAt: now, completedAt: now });
      } catch (error) {
        if (!isDuplicate(error)) throw error;
      }
    },
    /** True when the AI will answer this client again; false when the number has no conversation. */
    async resume(phone: string, now: Date) {
      const result = await db.update(whatsappConversations).set({ aiPaused: false, updatedAt: now }).where(eq(whatsappConversations.phone, phone));
      return affected(result) === 1;
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
