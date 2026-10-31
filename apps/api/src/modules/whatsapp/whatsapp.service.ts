import type { WhatsAppMedia } from "@just4kids/db/schema";
import type { WhatsAppSettings } from "../../configs/env.js";
import { HttpError } from "../../lib/http-error.js";
import type { BookingRepository } from "../bookings/booking.repository.js";
import { AiRefusedError } from "./ai.js";
import type { Ai, ChatMessage } from "./ai.js";
import { advance, clientApproved, clientRejected, stepInstructions } from "./flow.js";
import type { FlowContext } from "./flow.js";
import { aiFailureMessage, parseStaffCommand, staffHelp } from "./messages.js";
import type { OpenWa, Photo } from "./openwa.js";
import type { WhatsAppRepository } from "./whatsapp.repository.js";

const LEASE_MS = 5 * 60_000;
// The AI reads at most this many recent client messages and replies; everything stays stored.
const HISTORY_LIMIT = 12;
// Consecutive failures before giving up: about 1.5 hours of retries with the back-off below.
const MAX_AI_FAILURES = 12;
const MAX_SEND_ATTEMPTS = 12;
const backoff = (failures: number) => Math.min(30_000 * 2 ** (failures - 1), 10 * 60_000);

export function createWhatsAppService(repository: WhatsAppRepository, bookings: BookingRepository, openwa: OpenWa, ai: Ai, settings: WhatsAppSettings, prompt: string, priceLists: Record<WhatsAppMedia, Photo>, now: () => Date) {
  const staffChatId = (phone: string) => `${phone.slice(1)}@c.us`;
  const staffChatIds = settings.staffPhones.map(staffChatId);
  /** The other staff numbers, told about a decision one of them made. */
  const otherStaff = (phone: string) => settings.staffPhones.filter(item => item !== phone).map(staffChatId);
  const retryAt = (failures: number) => new Date(now().getTime() + backoff(failures));

  /** Sends the conversation's waiting messages in order; false when a retry is needed later. */
  async function sendPending(id: string) {
    const failedTurns = new Set<string | null>();
    for (const message of await repository.pending(id, "outbound")) {
      // failTurn already marked the rest of a failed turn in the database.
      if (message.turnId && failedTurns.has(message.turnId)) continue;
      const result = message.media ? await openwa.sendImage(message.chatId, priceLists[message.media], message.body, message.idempotencyKey) : await openwa.sendText(message.chatId, message.body, message.idempotencyKey);
      if (result.status === "sent") { await repository.markSent(message.id, result.messageId, now()); continue; }
      if (result.status === "failed" || message.attempts + 1 >= MAX_SEND_ATTEMPTS) { await repository.failTurn(message, result.error, now()); failedTurns.add(message.turnId); continue; }
      await repository.markAttempt(message.id, result.error);
      return false;
    }
    return true;
  }

  /** Stops trying to answer the waiting client messages and queues an alert so staff can contact the client. */
  async function giveUp(id: string, reason: string) {
    const inbound = await repository.pending(id, "inbound");
    if (!inbound.length) return;
    const conversation = (await repository.conversation(id))!;
    await repository.giveUp(id, inbound.map(message => message.id), `No AI answer: ${reason}`, aiFailureMessage(conversation.phone, reason, inbound.map(message => message.body)), staffChatIds, now());
  }

  /** Runs one command from the staff number; approving creates the reservation and tells the client. */
  async function staffTurn(staff: { id: string; phone: string; chatId: string }, message: { id: number; body: string }) {
    const command = parseStaffCommand(message.body);
    if (command.type === "help") { await repository.answerPlainly(staff, message.id, staffHelp(), now()); return; }
    if (command.type === "resume") {
      await repository.answerPlainly(staff, message.id, await repository.resume(command.phone, now()) ? `The AI answers ${command.phone} again.` : `No conversation found for ${command.phone}.`, now());
      return;
    }
    const found = await repository.requestForDecision(command.number);
    if (!found) { await repository.answerPlainly(staff, message.id, `Request #${command.number} was not found.`, now()); return; }
    const { request, conversation: client } = found;
    if (request.status !== "pending") { await repository.answerPlainly(staff, message.id, `Request #${command.number} was already ${request.status}.`, now()); return; }
    const language = request.details.language ?? client.flow?.language ?? null;
    if (command.type === "reject") {
      await repository.reject(command.number, client, clientRejected(language, command.reason), staff, message.id, `Request #${command.number} rejected. The client was told.`, { chatIds: otherStaff(staff.phone), text: `Request #${command.number} was rejected by ${staff.phone}${command.reason ? `: ${command.reason}` : "."}\nIt can no longer be changed here.` }, now());
      await sendPending(staff.id);
      await process(client.id, false);
      return;
    }
    const { barbers } = await repository.options();
    const details = request.details;
    const barber = command.barber ? barbers.find(item => item.name.toLowerCase() === command.barber!.toLowerCase()) : barbers.find(item => item.id === details.barberId);
    if (!barber) {
      await repository.answerPlainly(staff, message.id, `Choose a barber for #${command.number}: yes ${command.number} <name>\nBarbers: ${barbers.map(item => item.name).join(", ")}`, now());
      return;
    }
    const administrator = await repository.administrator();
    if (!administrator) { await repository.answerPlainly(staff, message.id, "No enabled administrator account exists. Create the reservation in the dashboard.", now()); return; }
    const { address } = details;
    try {
      await bookings.createForPhone(
        { employeeId: barber.id, date: details.date, startTime: details.startTime, endTime: details.endTime, adultCount: details.adults, childCount: details.children, specialChildCount: details.specialChildren },
        { phone: client.phone, address: { areaId: details.areaId, area: details.area, ...address } },
        administrator,
        (transaction, booking) => repository.settleApproval(transaction, command.number, booking.id, client, clientApproved(language, details, barber.name), staff, message.id, `Request #${command.number} approved. Reservation ${booking.reference} created with ${barber.name}. The client was told.`, { chatIds: otherStaff(staff.phone), text: `Request #${command.number} was approved by ${staff.phone}. Reservation ${booking.reference} created with ${barber.name}.\nIt can no longer be changed here.` }, now()),
      );
    } catch (error) {
      // The reservation rules refused it, for example the barber is busy: nothing was saved, so staff can decide again. A decision that came first rolled it back too.
      if (!(error instanceof HttpError)) throw error;
      await repository.answerPlainly(staff, message.id, `Request #${command.number} was not created: ${error.message}. Reply with another barber, or create it in the dashboard.`, now());
      return;
    }
    await sendPending(staff.id);
    await process(client.id, false);
  }

  /** Answers each waiting message in order; false when a retry is needed later. */
  async function answerPending(id: string) {
    const inbound = await repository.pending(id, "inbound");
    if (!inbound.length) return true;
    const conversation = (await repository.conversation(id))!;
    if (settings.staffPhones.includes(conversation.phone)) {
      for (const message of inbound) await staffTurn(conversation, message);
      return true;
    }
    if (conversation.aiPaused) {
      // Staff are handling this chat: its messages stay stored but the AI does not answer.
      for (const message of inbound) await repository.answerPlainly(conversation, message.id, null, now());
      return true;
    }
    const context: FlowContext = { ...await repository.options(), now: now() };
    const requests = (await repository.requests(id)).map(request => request.number);
    let flow = conversation.flow;
    for (const message of inbound) {
      try {
        const turn = await advance(flow, message.body, context, async state => {
          const history = await repository.history(id, HISTORY_LIMIT);
          const messages: ChatMessage[] = [
            { role: "system", content: `${prompt}\n\n${stepInstructions(state, context)}` },
            ...history.map(item => ({ role: item.direction === "inbound" ? "user" as const : "assistant" as const, content: item.body })),
          ];
          return ai.interpret(messages);
        });
        await repository.commitTurn(conversation, message.id, turn, staffChatIds, requests, now());
        flow = turn.state;
      } catch (error) {
        console.error(`WhatsApp AI answer failed for conversation ${id}: ${error instanceof Error ? error.message : "unknown error"}`);
        if (error instanceof AiRefusedError) { await giveUp(id, error.reason); return true; }
        return false;
      }
    }
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
          if (!sent || failures < MAX_AI_FAILURES) return;
          await giveUp(id, "the AI kept failing");
          break;
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
