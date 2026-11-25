import { TransactionRollbackError } from "drizzle-orm";
import type { WhatsAppAddressDetails, WhatsAppCancelDetails, WhatsAppMedia, WhatsAppReservation } from "@just4kids/db/schema";
import type { WhatsAppSettings } from "../../configs/env.js";
import { HttpError } from "../../lib/http-error.js";
import type { Transaction } from "../availability/availability.repository.js";
import type { BookingRepository } from "../bookings/booking.repository.js";
import type { createVisitService } from "../bookings/visit.service.js";
import { AiRefusedError } from "./ai.js";
import type { Ai, ChatMessage } from "./ai.js";
import { advance, barberName, bookingDays, clientAddressChanged, clientAddressRefused, clientApproved, clientCancelled, clientCancelRefused, clientRejected, extraReservationNote, IDLE_RESET_MS, reminder, savedHomeAddress, stepInstructions, UNFINISHED_BOOKING_MS, UNFINISHED_BOOKING_TEXT } from "./flow.js";
import type { FlowContext } from "./flow.js";
import { addressCreateSchema } from "@just4kids/contracts";
import { addressHelp, aiFailureMessage, hospitalNote, parseStaffAddress, parseStaffCommand, staffHelp, staffMessage } from "./messages.js";
import type { OpenWa, Photo } from "./openwa.js";
import type { WhatsAppRepository } from "./whatsapp.repository.js";

const LEASE_MS = 5 * 60_000;
// The AI reads at most this many recent client messages and replies; everything stays stored.
const HISTORY_LIMIT = 12;
// Consecutive failures before giving up: about 1.5 hours of retries with the back-off below.
const MAX_AI_FAILURES = 12;
const MAX_SEND_ATTEMPTS = 12;
const backoff = (failures: number) => Math.min(30_000 * 2 ** (failures - 1), 10 * 60_000);
// After staff take over a chat, the AI answers again once this long passes with no message between staff and the client.
const TAKEOVER_MS = 15 * 60_000;
// Kuwait time of the reservation-day reminder.
const REMINDER_TIME = "08:00";

export function createWhatsAppService(repository: WhatsAppRepository, bookings: BookingRepository, visits: ReturnType<typeof createVisitService>, openwa: OpenWa, ai: Ai, settings: WhatsAppSettings, prompt: string, priceLists: Record<Exclude<WhatsAppMedia, "barber_photo">, Photo>, now: () => Date, barberPhoto: (id: string) => Promise<Photo | null>) {
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
      let photo: Photo | null = null;
      if (message.media === "barber_photo") {
        photo = message.mediaBarberId ? await barberPhoto(message.mediaBarberId) : null;
        // The photo was removed since: nothing to send, and the rest of the answer still goes out.
        if (!photo) { await repository.markSent(message.id, null, now()); continue; }
      } else if (message.media) photo = priceLists[message.media];
      const result = photo ? await openwa.sendImage(message.chatId, photo, message.body, message.idempotencyKey) : await openwa.sendText(message.chatId, message.body, message.idempotencyKey);
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

  /** Cancels what the client asked to cancel: the reservation, or the request staff had not decided yet. */
  async function approveCancel(number: number, details: WhatsAppCancelDetails, client: { id: string; chatId: string }, staff: { id: string; phone: string; chatId: string }, staffInboundId: number) {
    const { reservation } = details;
    let bookingId = reservation.kind === "booking" ? reservation.id : null, waiting: number | null = null;
    let outcome = reservation.kind === "booking" ? `Reservation ${reservation.reference} no longer exists.` : "";
    if (reservation.kind === "request") {
      const target = await repository.requestForDecision(reservation.number);
      if (target?.request.status === "pending") { waiting = reservation.number; outcome = `Request #${reservation.number} was cancelled.`; }
      else if (target?.request.status === "approved" && target.request.bookingId) bookingId = target.request.bookingId;
      else outcome = `Request #${reservation.number} was already ${target?.request.status ?? "removed"}.`;
    }
    const booking = bookingId ? await bookings.get(bookingId) : undefined;
    if (booking) outcome = `Reservation ${booking.reference} was cancelled.`;
    const others = { chatIds: otherStaff(staff.phone), text: `Cancellation #${number} was approved by ${staff.phone}. ${outcome}\nIt can no longer be changed here.` };
    const settle = (transaction: Transaction) => repository.settleCancel(transaction, number, booking?.id ?? null, waiting, client, clientCancelled(details.language, reservation), staff, staffInboundId, `Cancellation #${number} approved. ${outcome} The client was told.`, others, now());
    const decidedFirst = () => repository.answerPlainly(staff, staffInboundId, `Request #${number} was already decided.`, now());
    if (!booking) { if (!await repository.inTransaction(settle)) await decidedFirst(); return; }
    const administrator = await repository.administrator();
    if (!administrator) { await repository.answerPlainly(staff, staffInboundId, "No enabled administrator account exists. Cancel the reservation in the dashboard.", now()); return; }
    try {
      await visits.cancelForClient(booking.id, administrator, `Cancelled by the client on WhatsApp (#${number})`, settle);
    } catch (error) {
      if (error instanceof TransactionRollbackError) { await decidedFirst(); return; }
      // The reservation can no longer be cancelled, for example the visit is over: nothing was saved, so staff can refuse it instead.
      if (!(error instanceof HttpError)) throw error;
      await repository.answerPlainly(staff, staffInboundId, `Cancellation #${number} was not done: ${error.message}. Check the reservation in the dashboard, or refuse with: no ${number}`, now());
    }
  }

  /**
   * Puts the client's new address on the reservation they chose: the booked reservation (as a dashboard edit, with a revision),
   * or the request staff have not decided yet. Nothing changes when the reservation has started, ended, or was decided otherwise.
   */
  async function approveAddress(number: number, details: WhatsAppAddressDetails, client: { id: string; chatId: string }, staff: { id: string; phone: string; chatId: string }, staffInboundId: number) {
    const { reservation, areaId, area, address } = details;
    let bookingId = reservation.kind === "booking" ? reservation.id : null, waiting: number | null = null;
    if (reservation.kind === "request") {
      const target = await repository.requestForDecision(reservation.number);
      if (target?.request.status === "pending") waiting = reservation.number;
      else if (target?.request.status === "approved" && target.request.bookingId) bookingId = target.request.bookingId;
    }
    const notDone = (why: string) => repository.answerPlainly(staff, staffInboundId, `Address change #${number} was not done: ${why}. Change it in the dashboard, or refuse with: no ${number}`, now());
    if (bookingId === null && waiting === null) { await notDone("the reservation no longer exists"); return; }
    const administrator = bookingId ? await repository.administrator() : null;
    if (bookingId && !administrator) { await repository.answerPlainly(staff, staffInboundId, "No enabled administrator account exists. Change the address in the dashboard.", now()); return; }
    let started = false;
    const done = await repository.inTransaction(async transaction => {
      let outcome: string;
      if (waiting !== null) {
        if (!await repository.moveWaitingRequest(transaction, waiting, areaId, area, address)) transaction.rollback();
        outcome = `Request #${waiting} now has the new address.`;
      } else {
        const reference = await repository.moveReservation(transaction, bookingId!, area, address, administrator!, `Address changed by the client on WhatsApp (#${number})`, now());
        if (!reference) { started = true; transaction.rollback(); }
        outcome = `Reservation ${reference} now has the new address.`;
      }
      const others = { chatIds: otherStaff(staff.phone), text: `Address change #${number} was approved by ${staff.phone}. ${outcome}\nIt can no longer be changed here.` };
      await repository.settleCancel(transaction, number, null, null, client, clientAddressChanged(details.language, reservation, area, address), staff, staffInboundId, `Address change #${number} approved. ${outcome} The client was told.`, others, now());
    });
    if (done) return;
    if (started) await notDone("the reservation has started or is no longer booked");
    else await repository.answerPlainly(staff, staffInboundId, `Request #${number} was already decided.`, now());
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
    if (request.details.type === "cancel") {
      if (command.type === "address") { await repository.answerPlainly(staff, message.id, `Request #${command.number} is a cancellation. It has no address to change.`, now()); return; }
      if (command.type === "reject") {
        await repository.reject(command.number, client, clientCancelRefused(language, command.reason), staff, message.id, `Cancellation #${command.number} refused. The client was told a staff member will contact them.`, { chatIds: otherStaff(staff.phone), text: `Cancellation #${command.number} was refused by ${staff.phone}${command.reason ? `: ${command.reason}` : "."}\nIt can no longer be changed here.` }, now());
      } else await approveCancel(command.number, { ...request.details, language }, client, staff, message.id);
      await sendPending(staff.id);
      await process(client.id, false);
      return;
    }
    if (request.details.type === "address") {
      if (command.type === "address") { await repository.answerPlainly(staff, message.id, `Request #${command.number} is an address change. Approve it with yes ${command.number} or refuse it with no ${command.number} <reason>.`, now()); return; }
      if (command.type === "reject") {
        await repository.reject(command.number, client, clientAddressRefused(language, command.reason), staff, message.id, `Address change #${command.number} refused. The client was told a staff member will contact them.`, { chatIds: otherStaff(staff.phone), text: `Address change #${command.number} was refused by ${staff.phone}${command.reason ? `: ${command.reason}` : "."}\nIt can no longer be changed here.` }, now());
      } else await approveAddress(command.number, { ...request.details, language }, client, staff, message.id);
      await sendPending(staff.id);
      await process(client.id, false);
      return;
    }
    if (command.type === "address") {
      const parsed = parseStaffAddress(command.text);
      if (!parsed) { await repository.answerPlainly(staff, message.id, `The address of #${command.number} was not changed.\n${addressHelp()}`, now()); return; }
      const { parts: { area: areaName, ...written }, mapsUrl } = parsed;
      const area = areaName ? (await repository.options()).areas.find(item => item.name.toLowerCase() === areaName.toLowerCase()) : { id: request.details.areaId, name: request.details.area };
      if (!area) { await repository.answerPlainly(staff, message.id, `Area "${areaName}" was not found. The address of #${command.number} was not changed.`, now()); return; }
      const address = { ...request.details.address, ...written, ...(mapsUrl ? { mapsUrl } : {}) };
      if (!addressCreateSchema.safeParse({ area: area.name, ...address }).success) {
        await repository.answerPlainly(staff, message.id, `The address of #${command.number} was not changed: it needs a block, a street, a house or building, and the link must be from Google Maps.\n${addressHelp()}`, now());
        return;
      }
      const details = { ...request.details, areaId: area.id, area: area.name, address };
      const updated = staffMessage({ type: "new_request", details }, client.phone, command.number);
      const changed = await repository.changeRequestDetails(command.number, details, client, staff, message.id, `The address of #${command.number} was changed.\n\n${updated}`, { chatIds: otherStaff(staff.phone), text: `The address of #${command.number} was changed by ${staff.phone}.\n\n${updated}` }, now());
      if (!changed) { await repository.answerPlainly(staff, message.id, `Request #${command.number} was already decided. Change the reservation in the dashboard.`, now()); return; }
      await sendPending(staff.id);
      await process(client.id, false);
      return;
    }
    if (command.type === "reject") {
      await repository.reject(command.number, client, clientRejected(language, command.reason), staff, message.id, `Request #${command.number} rejected. The client was told.`, { chatIds: otherStaff(staff.phone), text: `Request #${command.number} was rejected by ${staff.phone}${command.reason ? `: ${command.reason}` : "."}\nIt can no longer be changed here.` }, now());
      await sendPending(staff.id);
      await process(client.id, false);
      return;
    }
    const { barbers } = await repository.options();
    const details = request.details;
    const named = command.barber?.toLowerCase();
    const barber = named ? barbers.find(item => item.name.toLowerCase() === named || item.nameAr?.toLowerCase() === named) : barbers.find(item => item.id === details.barberId);
    if (!barber) {
      await repository.answerPlainly(staff, message.id, `Choose a barber for #${command.number}: yes ${command.number} <name>\nBarbers: ${barbers.map(item => item.name).join(", ")}`, now());
      return;
    }
    const administrator = await repository.administrator();
    if (!administrator) { await repository.answerPlainly(staff, message.id, "No enabled administrator account exists. Create the reservation in the dashboard.", now()); return; }
    const { address } = details;
    const notes = [details.extra ? extraReservationNote(details.extra) : null, details.hospital ? hospitalNote(details.hospital) : null].filter(Boolean).join("\n") || undefined;
    try {
      await bookings.createForPhone(
        { employeeId: barber.id, date: details.date, startTime: details.startTime, endTime: details.endTime, adultCount: details.adults, childCount: details.children, specialChildCount: details.specialChildren, ...(notes ? { notes } : {}) },
        { phone: client.phone, address: { areaId: details.areaId, area: details.area, ...address } },
        administrator,
        (transaction, booking) => repository.settleApproval(transaction, command.number, booking.id, client, clientApproved(language, details, barberName(barber, language)), staff, message.id, `Request #${command.number} approved. Reservation ${booking.reference} created with ${barber.name}. The client was told.`, { chatIds: otherStaff(staff.phone), text: `Request #${command.number} was approved by ${staff.phone}. Reservation ${booking.reference} created with ${barber.name}.\nIt can no longer be changed here.` }, now()),
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
      // Staff are handling this chat: its messages stay stored but the AI does not answer,
      // until 15 minutes pass with no message between staff and the client.
      const lastAt = await repository.lastChatAt(id, inbound[0]!.id);
      if (lastAt && inbound[0]!.createdAt.getTime() - lastAt.getTime() <= TAKEOVER_MS) {
        for (const message of inbound) await repository.answerPlainly(conversation, message.id, null, now());
        return true;
      }
      await repository.resumeConversation(id, now());
    }
    const options = await repository.options(), today = now();
    const context: FlowContext = {
      ...options, now: today, free: await repository.freeHours(options.barbers.map(barber => barber.id), bookingDays(today)),
      savedAddress: savedHomeAddress(await repository.reservationAddresses(conversation.phone), options.areas),
      reservations: await repository.openReservations(id, conversation.phone, today),
    };
    const requests = (await repository.requests(id)).map(request => request.number);
    let flow = conversation.flow;
    let lastAt = await repository.previousInboundAt(id, inbound[0]!.id);
    for (const message of inbound) {
      // After a long silence the chat starts over, so a half-finished booking does not continue. The reminder waits for its answer all day.
      if (lastAt && message.createdAt.getTime() - lastAt.getTime() > IDLE_RESET_MS && flow?.step !== "reminder") flow = null;
      lastAt = message.createdAt;
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
    /** Queues the Arabic salon message, once, for each new booking left unfinished for 10 minutes; the sweep sends it. */
    async nudge() {
      const current = now();
      for (const chat of await repository.unfinishedBookings(current, UNFINISHED_BOOKING_MS)) {
        if (settings.staffPhones.includes(chat.phone)) continue;
        await repository.queueNudge(chat, UNFINISHED_BOOKING_TEXT, current);
      }
    },
    /**
     * From 8am Kuwait time, queues the reminder of each reservation booked for today, once. A reservation made after 8am on its day,
     * or one that has started, gets none. The sweep sends what was queued.
     */
    async remind() {
      const current = now(), kuwait = new Date(current.getTime() + 3 * 3_600_000).toISOString();
      const today = kuwait.slice(0, 10), time = kuwait.slice(11, 16);
      if (time < REMINDER_TIME) return;
      for (const row of await repository.dueReminders(today, time, new Date(`${today}T${REMINDER_TIME}:00+03:00`))) {
        if (settings.staffPhones.includes(row.phone)) continue;
        const reservation: WhatsAppReservation = { kind: "booking", id: row.id, reference: row.reference, date: row.date, startTime: row.startTime, endTime: row.endTime, barber: { name: row.name, nameAr: row.nameAr } };
        await repository.queueReminder(row.id, row.phone, language => reminder(reservation, language), current);
      }
    },
  };
}
