import { createHmac, randomInt, randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { ADDRESS_NOT_PROVIDED } from "@just4kids/contracts";
import type { WhatsAppRequestDetails } from "@just4kids/db/schema";
import { accounts, areas, bookingVisitEvents, branches, bookings, clientAddresses, clients, employeeWorkDays, employeeWorkIntervals, employees, whatsappConversations, whatsappMessages, whatsappRequests } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { createWhatsApp } from "../src/modules/whatsapp/index.js";

const secret = "w".repeat(32);
const sessionId = "8f3c2b1a-9d4e-4c7a-8b2f-1e6d5a4c3b2a";
const staff = `+965${randomInt(60000000, 69999999)}`;
const env = apiEnvSchema.parse({
  NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL, ADMIN_PHONE: "+96555551234", ADMIN_PASSWORD: "admin1234", AUTH_SECRET: "a".repeat(64),
  OPENWA_BASE_URL: "http://openwa.test", OPENWA_API_KEY: "openwa-key", OPENWA_SESSION_ID: sessionId, OPENWA_WEBHOOK_SECRET: secret,
  STAFF_WHATSAPP_NUMBER: staff, AI_BASE_URL: "http://ai.test/v1", AI_API_KEY: "ai-key", AI_MODEL: "model-1",
});
const settings = env.whatsapp!;
const connection = createDatabase(env.DATABASE_URL);
const auth = createAuth(connection, env);
const phones: string[] = [];

type Sent = { chatId: string; text: string; key: string; image?: { mimetype: string; size: number; filename: string } };
type Decision = { reply: string; value: Record<string, unknown> | null; forward: string | null };
const barberName = `Barber${randomInt(100000, 999999)}`, areaName = `Area${randomInt(100000, 999999)}`, barberId = randomUUID();
// Its name holds "Farwaniya", so the flow sends the Farwaniya location.
const branchName = `Farwaniya salon ${randomInt(100000, 999999)}`, branchId = randomUUID();
function harness(whatsappSettings = settings) {
  const sent: Sent[] = [], aiCalls: { role: string; content: string }[][] = [];
  const decisions: (Decision | Error | number)[] = [];
  let sendStatus: (sent: Sent) => { status: number; body?: unknown } = () => ({ status: 201 });
  // Reservations must start in the future, so the clock follows the real date.
  let clock = new Date();
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input), body = JSON.parse(String(init?.body));
    if (url === "http://ai.test/v1/chat/completions") {
      aiCalls.push(body.messages);
      const next = decisions.shift() ?? new Error("no AI answer queued");
      if (typeof next === "number") return new Response("{}", { status: next });
      if (next instanceof Error) return new Response("{}", { status: 503 });
      return Response.json({ choices: [{ message: { role: "assistant", content: JSON.stringify(next) } }] });
    }
    if (url === `http://openwa.test/api/sessions/${sessionId}/messages/send-text`) {
      const message = { chatId: body.chatId, text: body.text, key: new Headers(init?.headers).get("Idempotency-Key")! };
      const result = sendStatus(message);
      if (result.status === 201) sent.push(message);
      return Response.json(result.body ?? { messageId: `m-${sent.length}`, timestamp: 1 }, { status: result.status });
    }
    if (url === `http://openwa.test/api/sessions/${sessionId}/messages/send-image`) {
      sent.push({ chatId: body.chatId, text: body.caption, key: new Headers(init?.headers).get("Idempotency-Key")!, image: { mimetype: body.mimetype, size: Buffer.from(body.base64, "base64").length, filename: body.filename } });
      return Response.json({ messageId: `m-${sent.length}`, timestamp: 1 }, { status: 201 });
    }
    throw new Error(`unexpected request to ${url}`);
  };
  const whatsapp = createWhatsApp(connection, whatsappSettings, { fetch: fetcher, prompt: "OWNER RULES", now: () => clock });
  const app = createApp({ auth, connection, env, whatsapp });
  return {
    app, whatsapp, sent, aiCalls,
    answer: (...next: (Decision | Error | number)[]) => { decisions.push(...next); },
    failSends: (next: typeof sendStatus) => { sendStatus = next; },
    advance: (ms: number) => { clock = new Date(clock.getTime() + ms); },
    at: (time: Date) => { clock = time; },
  };
}
let keyCounter = 0;
function payload(phone: string, text: string, extra: Record<string, unknown> = {}, key = `msg_business_${Date.now()}_${keyCounter++}`) {
  const digits = phone.slice(1);
  return { event: "message.received", timestamp: "2026-10-24T09:00:00.000Z", sessionId, idempotencyKey: key, deliveryId: "dlv_1",
    data: { id: `false_${digits}@c.us_${key}`, from: `${digits}@c.us`, to: "96590000000@c.us", chatId: `${digits}@c.us`, body: text, type: "text", fromMe: false, isGroup: false, kind: "individual", timestamp: 1, ...extra } };
}
function deliver(app: ReturnType<typeof harness>["app"], body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  return request(app).post("/whatsapp/webhook").set("Content-Type", "application/json")
    .set("X-OpenWA-Signature", signature ?? `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`).send(raw);
}
function client() {
  const phone = `+965${randomInt(50000000, 59999999)}`;
  phones.push(phone);
  return { phone, chatId: `${phone.slice(1)}@c.us` };
}
async function stored(phone: string) {
  const [conversation] = await connection.db.select().from(whatsappConversations).where(inArray(whatsappConversations.phone, [phone]));
  if (!conversation) return { conversation, messages: [], requests: [] };
  const messages = await connection.db.select().from(whatsappMessages).where(inArray(whatsappMessages.conversationId, [conversation.id])).orderBy(whatsappMessages.id);
  const requests = await connection.db.select().from(whatsappRequests).where(inArray(whatsappRequests.conversationId, [conversation.id]));
  return { conversation, messages, requests };
}

beforeAll(async () => {
  await auth.initialize();
  const now = new Date();
  await connection.db.insert(accounts).values({ id: barberId, phone: `+965${randomInt(70000000, 79999999)}`, role: "employee", passwordHash: "x", createdAt: now, updatedAt: now });
  await connection.db.insert(employees).values({ accountId: barberId, displayName: barberName, createdAt: now, updatedAt: now });
  await connection.db.insert(areas).values({ id: randomUUID(), name: areaName, createdAt: now, updatedAt: now });
  await connection.db.insert(branches).values({ id: branchId, name: branchName, address: "Farwaniya", createdAt: now, updatedAt: now });
  for (let day = 0; day < 7; day++) {
    await connection.db.insert(employeeWorkDays).values({ employeeId: barberId, dayOfWeek: day, active: true });
    await connection.db.insert(employeeWorkIntervals).values({ employeeId: barberId, dayOfWeek: day, startTime: "00:00", endTime: "23:59" });
  }
});
let h: ReturnType<typeof harness>;
// Workers pick up every due conversation, so no test may inherit another test's unfinished work (test database only).
beforeEach(async () => { await connection.db.update(whatsappMessages).set({ status: "failed" }).where(eq(whatsappMessages.status, "pending")); h = harness(); });
afterAll(async () => {
  phones.push(staff);
  // Other test files count barbers and accounts, so this file's own rows must not outlive it.
  const barbers = (await connection.db.select({ id: employees.accountId, name: employees.displayName }).from(employees)).filter(row => /^Barber\d{6}$/.test(row.name)).map(row => row.id);
  if (barbers.length) {
    const booked = await connection.db.select({ id: bookings.id, clientId: bookings.clientId }).from(bookings).where(inArray(bookings.employeeId, barbers));
    if (booked.length) {
      await connection.db.delete(bookingVisitEvents).where(inArray(bookingVisitEvents.bookingId, booked.map(row => row.id)));
      await connection.db.delete(bookings).where(inArray(bookings.id, booked.map(row => row.id)));
      const clientIds = [...new Set(booked.map(row => row.clientId))];
      await connection.db.delete(clientAddresses).where(inArray(clientAddresses.clientId, clientIds));
      await connection.db.delete(clients).where(inArray(clients.id, clientIds));
    }
    await connection.db.delete(employeeWorkIntervals).where(inArray(employeeWorkIntervals.employeeId, barbers));
    await connection.db.delete(employeeWorkDays).where(inArray(employeeWorkDays.employeeId, barbers));
    await connection.db.delete(employees).where(inArray(employees.accountId, barbers));
    await connection.db.delete(accounts).where(inArray(accounts.id, barbers));
  }
  const testAreas = (await connection.db.select({ id: areas.id, name: areas.name }).from(areas)).filter(row => /^Area\d{6}$/.test(row.name)).map(row => row.id);
  if (testAreas.length) await connection.db.delete(areas).where(inArray(areas.id, testAreas));
  await connection.db.delete(branches).where(eq(branches.id, branchId));
  const conversations = await connection.db.select({ id: whatsappConversations.id }).from(whatsappConversations).where(inArray(whatsappConversations.phone, phones));
  const ids = conversations.map(row => row.id);
  if (ids.length) {
    await connection.db.delete(whatsappMessages).where(inArray(whatsappMessages.conversationId, ids));
    await connection.db.delete(whatsappRequests).where(inArray(whatsappRequests.conversationId, ids));
    await connection.db.delete(whatsappConversations).where(inArray(whatsappConversations.id, ids));
  }
  await connection.pool.end();
});

describe("WhatsApp webhook", () => {
  it("rejects a missing or wrong signature without storing anything", async () => {
    const { phone } = client();
    expect((await deliver(h.app, payload(phone, "مرحبا"), "sha256=00")).status).toBe(401);
    expect((await request(h.app).post("/whatsapp/webhook").set("Content-Type", "application/json").send(JSON.stringify(payload(phone, "مرحبا")))).status).toBe(401);
    expect((await stored(phone)).conversation).toBeUndefined();
  });

  it("acknowledges ignored events without storing or answering them", async () => {
    const { phone } = client();
    for (const body of [payload(phone, "", { type: "voice" }), payload(phone, "مرحبا", { fromMe: true }), { ...payload(phone, "مرحبا"), idempotencyKey: undefined }, { event: "session.status", sessionId, data: {} }]) {
      expect((await deliver(h.app, body)).status).toBe(200);
    }
    await h.whatsapp.idle();
    expect((await stored(phone)).conversation).toBeUndefined();
    expect(h.aiCalls).toHaveLength(0);
  });

  it("is not blocked by the browser origin guard and needs no session", async () => {
    const { phone } = client();
    expect((await deliver(h.app, payload(phone, "السلام عليكم"))).status).toBe(200);
    await h.whatsapp.idle();
  });
});

// Walks a client from the first message to this file's barber's start-time list (day first, then barber), using another day when the wanted time is taken.
async function toTimes(phone: string, wanted?: string) {
  for (const text of ["مرحبا", "1", "1", "1", "1"]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
  for (const dateChoice of ["4", "5", "6", "7"]) {
    await deliver(h.app, payload(phone, dateChoice)); await h.whatsapp.idle();
    const barber = listOption(barberName);
    if (!barber) throw new Error(`Barber "${barberName}" was not offered:\n${h.sent.at(-1)?.text}`);
    await deliver(h.app, payload(phone, barber)); await h.whatsapp.idle();
    if (!wanted || timeOption(wanted)) return;
    // Back from the start times to the barbers, then to the days.
    for (const list of ["start-time", "barber"]) {
      const back = listOption("Back to the previous step");
      if (!back) throw new Error(`No back option on the ${list} list:\n${h.sent.at(-1)?.text}`);
      await deliver(h.app, payload(phone, back)); await h.whatsapp.idle();
    }
  }
  throw new Error(`Time "${wanted}" was not offered on any date.`);
}
// The number of an option in the list the client was just sent.
const listOption = (label: string) => new RegExp(`^(\\d+)\\. ${label}$`, "m").exec(h.sent.at(-1)!.text)?.[1];
const timeOption = listOption;
// Labeled address details can arrive in any order, with a Maps link in the same message.
async function toConfirm(phone: string, time = nextWindow(), extra = "7") {
  await toTimes(phone, time);
  const chosen = timeOption(time);
  if (!chosen) throw new Error(`Time "${time}" was not offered. Last message:\n${h.sent.at(-1)?.text}`);
  for (const text of [chosen, extra, "1", areaName]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
  await deliver(h.app, payload(phone, "floor 2 gate B house 12 blue number 123 block 3 street 5 https://www.google.com/maps?q=29.3,48.0")); await h.whatsapp.idle();
}
// Every test books its own window, because they all share one barber and date.
let windowHour = 5;
const nextWindow = () => {
  const hour = windowHour++ % 23;
  return hour === 0 ? "12 am" : hour < 12 ? `${hour} am` : hour === 12 ? "12 pm" : `${hour - 12} pm`;
};
async function confirmed(phone: string, time = nextWindow()) {
  await toConfirm(phone, time);
  await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
  return (await stored(phone)).requests.at(-1)!.number;
}
const staffChat = `${staff.slice(1)}@c.us`;
const fromStaff = async (text: string) => { await deliver(h.app, payload(staff, text)); await h.whatsapp.idle(); };
const ownMessage = (phone: string, text: string, extra: Record<string, unknown> = {}) => { const digits = phone.slice(1); return { ...payload(phone, text, { fromMe: true, from: "96590000000@c.us", to: `${digits}@c.us`, ...extra }), event: "message.sent" }; };

describe("WhatsApp booking flow", () => {
  it("answers duplicate and concurrent deliveries of one message once", async () => {
    const { phone } = client();
    const body = payload(phone, "مرحبا");
    await Promise.all([deliver(h.app, body), deliver(h.app, body), deliver(h.app, body)]);
    await h.whatsapp.idle();
    await deliver(h.app, body); await h.whatsapp.idle();
    expect(h.sent).toHaveLength(1);
    expect((await stored(phone)).messages).toHaveLength(2);
  });

  it("offers barbers from the dashboard and tells staff first once the client confirms", async () => {
    const { phone, chatId } = client();
    await toConfirm(phone);
    expect(h.sent.some(message => message.text.includes(barberName))).toBe(true);
    h.sent.length = 0;
    await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
    const number = (await stored(phone)).requests[0]!.number;
    expect(h.sent.map(message => message.chatId)).toEqual([staffChat, chatId]);
    expect(h.sent[0]!.text).toContain(`طلب حجز جديد من واتساب #${number}`);
    expect(h.sent[0]!.text).toContain(`الحلاق: ${barberName}`);
    expect(h.sent[0]!.text).toContain("الموقع: https://www.google.com/maps?q=29.3,48.0");
    expect(h.sent[0]!.text).toContain("العنوان: قطعة 3، شارع 5، منزل 12");
    expect(h.aiCalls).toHaveLength(0);
  });

  it("keeps each sender's progress apart", async () => {
    const first = client(), second = client();
    await deliver(h.app, payload(first.phone, "مرحبا")); await h.whatsapp.idle();
    await deliver(h.app, payload(first.phone, "1")); await h.whatsapp.idle();
    await deliver(h.app, payload(second.phone, "مرحبا")); await h.whatsapp.idle();
    expect((await stored(first.phone)).conversation!.flow).toMatchObject({ step: "menu", language: "en" });
    expect((await stored(second.phone)).conversation!.flow).toMatchObject({ step: "language" });
  });

  it("starts the chat over after 15 minutes of silence, and continues before that", async () => {
    const { phone } = client();
    for (const text of ["مرحبا", "1", "1"]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
    expect((await stored(phone)).conversation!.flow).toMatchObject({ step: "who" });
    h.advance(14 * 60_000);
    await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
    expect((await stored(phone)).conversation!.flow).toMatchObject({ step: "children", who: "boy" });
    h.advance(15 * 60_000 + 1);
    h.sent.length = 0;
    await deliver(h.app, payload(phone, "2")); await h.whatsapp.idle();
    expect((await stored(phone)).conversation!.flow).toEqual({ step: "language", language: null });
    expect(h.sent[0]!.text).toContain("1. English\n2. العربية");
  });

  it("sends the AI the owner's prompt and the step rules only for free text", async () => {
    const { phone } = client();
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    h.answer({ reply: "أرسل رقماً", value: null, forward: null });
    await deliver(h.app, payload(phone, "كم السعر؟")); await h.whatsapp.idle();
    expect(h.aiCalls).toHaveLength(1);
    expect(h.aiCalls[0]![0]!.content.startsWith("OWNER RULES")).toBe(true);
    expect(h.aiCalls[0]![0]!.content).toContain('The client is at step "language"');
  });

  it("forwards what the AI cannot answer to staff, staff first", async () => {
    const { phone, chatId } = client();
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    h.sent.length = 0;
    h.answer({ reply: "بنبلغ الموظفين", value: null, forward: "Asks about the price" });
    await deliver(h.app, payload(phone, "كم السعر؟")); await h.whatsapp.idle();
    expect(h.sent.map(message => message.chatId)).toEqual([staffChat, chatId]);
    expect(h.sent[0]!.text).toBe(`WhatsApp message for staff\nClient: ${phone}\nAsks about the price`);
  });

  it("sends a change request to staff as written", async () => {
    const { phone } = client();
    for (const text of ["مرحبا", "1", "4", "ألغ موعد الأحد"]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
    expect(h.sent.find(message => message.chatId === staffChat)?.text).toBe(`Client wants to change or cancel\nClient: ${phone}\nMessage: ألغ موعد الأحد`);
  });

  it("sends nothing while the AI fails, answers once it recovers", async () => {
    const { phone } = client();
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    h.sent.length = 0;
    h.answer(new Error("down"));
    await deliver(h.app, payload(phone, "كم السعر؟")); await h.whatsapp.idle();
    expect(h.sent).toEqual([]);
    h.answer({ reply: "أهلا", value: null, forward: null });
    h.advance(10 * 60_000);
    await h.whatsapp.drain(); await h.whatsapp.idle();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.text.startsWith("أهلا")).toBe(true);
  });

  it("alerts staff at once when the AI refuses for a reason a retry cannot fix", async () => {
    const { phone } = client();
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    h.sent.length = 0;
    h.answer(402);
    await deliver(h.app, payload(phone, "كم السعر؟")); await h.whatsapp.idle();
    expect(h.aiCalls).toHaveLength(1);
    expect(h.sent).toEqual([{ chatId: staffChat, text: `WhatsApp AI could not answer\nClient: ${phone}\nReason: the AI account has no credit\nThe client got no reply. Please contact them.\nClient's messages:\nكم السعر؟`, key: expect.any(String) }]);
    expect((await stored(phone)).conversation!.failures).toBe(0);
  });

  it("alerts staff once when temporary AI failures use up every retry", async () => {
    const { phone } = client();
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    h.sent.length = 0;
    h.answer(new Error("down"));
    await deliver(h.app, payload(phone, "كم السعر؟")); await h.whatsapp.idle();
    for (let attempt = 2; attempt <= 12; attempt++) {
      h.answer(new Error("down"));
      h.advance(10 * 60_000);
      await h.whatsapp.drain(); await h.whatsapp.idle();
    }
    expect(h.aiCalls).toHaveLength(12);
    expect(h.sent.map(message => message.chatId)).toEqual([staffChat]);
    expect(h.sent[0]!.text).toContain("Reason: the AI kept failing");
  });

  it("holds the client reply until staff got the request, retrying with the same key", async () => {
    const { phone } = client();
    await toConfirm(phone);
    h.sent.length = 0;
    h.failSends(message => message.chatId === staffChat ? { status: 503, body: { statusCode: 503 } } : { status: 201 });
    await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
    expect(h.sent).toEqual([]);
    h.failSends(() => ({ status: 201 }));
    h.advance(10 * 60_000);
    await h.whatsapp.drain(); await h.whatsapp.idle();
    expect(h.sent.map(message => message.chatId === staffChat)).toEqual([true, false]);
  });

  it("never tells the client staff know when the staff send may have failed", async () => {
    const { phone } = client();
    await toConfirm(phone);
    h.sent.length = 0;
    h.failSends(message => message.chatId === staffChat ? { status: 409, body: { statusCode: 409, code: "IDEMPOTENCY_OUTCOME_UNKNOWN" } } : { status: 201 });
    await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
    h.advance(10 * 60_000); await h.whatsapp.drain(); await h.whatsapp.idle();
    expect(h.sent).toEqual([]);
  });

  it("finishes stored work after a restart and lets one worker answer at a time", async () => {
    const { phone } = client();
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    h.answer(new Error("down"));
    await deliver(h.app, payload(phone, "كم السعر؟")); await h.whatsapp.idle();
    const a = harness(), b = harness();
    a.answer({ reply: "أهلا", value: null, forward: null }); b.answer({ reply: "أهلا", value: null, forward: null });
    a.advance(10 * 60_000); b.advance(10 * 60_000);
    await Promise.all([a.whatsapp.drain(), b.whatsapp.drain()]);
    await Promise.all([a.whatsapp.idle(), b.whatsapp.idle()]);
    expect(a.aiCalls.length + b.aiCalls.length).toBe(1);
    expect([...a.sent, ...b.sent]).toHaveLength(1);
  });
});

describe("staff approval", () => {
  it("creates the reservation on approval and tells staff and the client, once", async () => {
    const { phone, chatId } = client();
    const number = await confirmed(phone);
    h.sent.length = 0;
    await fromStaff(`yes ${number}`);
    const { requests } = await stored(phone);
    expect(requests[0]).toMatchObject({ status: "approved", bookingId: expect.any(String) });
    const [booking] = await connection.db.select().from(bookings).where(eq(bookings.id, requests[0]!.bookingId!));
    expect(booking).toMatchObject({ employeeId: barberId, childCount: 1, adultCount: 0, clientSnapshot: { phone } });
    expect(booking!.addressSnapshot).toMatchObject({ area: areaName, block: "3", houseNumber: "12", floor: "2", gate: "B", blueNumber: "123", mapsUrl: "https://www.google.com/maps?q=29.3,48.0" });
    expect(h.sent.map(message => message.chatId)).toEqual([staffChat, chatId]);
    expect(h.sent[0]!.text).toContain(booking!.reference);
    h.sent.length = 0;
    await fromStaff(`yes ${number}`);
    expect(h.sent).toEqual([expect.objectContaining({ chatId: staffChat, text: `Request #${number} was already approved.` })]);
  });

  it("needs a barber for an older any-barber request, and refuses an unknown name", async () => {
    const { phone } = client();
    const number = await confirmed(phone);
    const { requests: [saved] } = await stored(phone);
    await connection.db.update(whatsappRequests).set({ details: { ...(saved!.details as WhatsAppRequestDetails), barberId: null, barberName: null } }).where(eq(whatsappRequests.number, number));
    h.sent.length = 0;
    await fromStaff(`yes ${number}`);
    expect(h.sent[0]!.text).toContain(`Choose a barber for #${number}`);
    await fromStaff(`yes ${number} Nobody`);
    expect((await stored(phone)).requests[0]!.status).toBe("pending");
  });

  it("keeps the request open when the barber is busy", async () => {
    const one = client(), other = client();
    const time = nextWindow();
    // Both requests were sent while the hour was free; a request does not hold it until staff approve.
    const first = await confirmed(one.phone, time);
    const second = await confirmed(other.phone, time);
    await fromStaff(`yes ${first}`);
    h.sent.length = 0;
    await fromStaff(`yes ${second}`);
    expect(h.sent[0]!.text).toContain(`Request #${second} was not created`);
    expect((await stored(other.phone)).requests[0]!.status).toBe("pending");
  });

  it("stops offering an hour once it is reserved", async () => {
    const { phone } = client();
    const time = nextWindow();
    await fromStaff(`yes ${await confirmed(phone, time)}`);
    const other = client();
    await toTimes(other.phone);
    expect(timeOption(time)).toBeUndefined();
    expect(timeOption(nextWindow())).toBeDefined();
  });

  it("puts the extra service on the staff message and as a note on the reservation, and adds an hour", async () => {
    const { phone } = client();
    // The extra service takes the next hour too, so no later test may use it.
    const time = nextWindow(); nextWindow();
    await toConfirm(phone, time, "1");
    await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
    const number = (await stored(phone)).requests.at(-1)!.number;
    expect(h.sent.find(message => message.chatId === staffChat)!.text).toContain("خدمة إضافية: مانيكير + باديكير");
    await fromStaff(`yes ${number}`);
    const { requests: [request] } = await stored(phone);
    const [booking] = await connection.db.select().from(bookings).where(eq(bookings.id, request!.bookingId!));
    expect(booking!.notes).toBe("Extra service: Manicure + Pedicure");
    expect(Number(booking!.endTime.slice(0, 2)) - Number(booking!.startTime.slice(0, 2))).toBe(2);
  });

  it("offers the address of the client's last reservation next time, and books with it on yes", async () => {
    const { phone } = client();
    await fromStaff(`yes ${await confirmed(phone)}`);
    // The first visit is over, so a new one can be booked.
    await connection.db.update(bookings).set({ visitStatus: "completed" }).where(eq(bookings.id, (await stored(phone)).requests[0]!.bookingId!));
    const time = nextWindow();
    await toTimes(phone, time);
    // No home-or-hospital question: the saved location is offered right after the extra service.
    for (const text of [timeOption(time)!, "7"]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
    expect(h.sent.at(-1)!.text).toBe(`📍 Is this location correct?\n${areaName}, Block 3, Street 5, House 12, Floor 2, Gate B, Blue number 123\nhttps://www.google.com/maps?q=29.3,48.0\n\n1. Yes\n2. No\n3. Back to the previous step\n\nPlease choose the right number.`);
    for (const text of ["1", "1"]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
    expect((await stored(phone)).requests.at(-1)!.details).toMatchObject({ area: areaName, address: { block: "3", street: "5", houseNumber: "12", floor: "2", gate: "B", blueNumber: "123", mapsUrl: "https://www.google.com/maps?q=29.3,48.0" } });
    expect(h.aiCalls).toHaveLength(0);
    await fromStaff(`yes ${(await stored(phone)).requests.at(-1)!.number}`);
    expect(await connection.db.select().from(clients).where(eq(clients.phone, phone))).toHaveLength(1);
  });

  it("puts a hospital location in the reservation notes and leaves the home address unused", async () => {
    const { phone } = client();
    const time = nextWindow();
    await toTimes(phone, time);
    for (const text of [timeOption(time)!, "7", "2", areaName]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
    h.answer({ reply: "", value: { wing: "B", floor: "3", room: "7" }, forward: null });
    await deliver(h.app, payload(phone, "wing B floor 3 room 7")); await h.whatsapp.idle();
    await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
    const { requests: [request] } = await stored(phone);
    expect(request!.details).toMatchObject({ visitType: "hospital", hospital: { wing: "B", floor: "3", room: "7" }, address: { block: ADDRESS_NOT_PROVIDED, street: ADDRESS_NOT_PROVIDED, houseNumber: ADDRESS_NOT_PROVIDED, mapsUrl: null } });
    expect(h.sent.find(message => message.chatId === staffChat)!.text).toContain("موقع المستشفى: جناح B، دور 3، غرفة 7");
    await fromStaff(`yes ${request!.number}`);
    const [booking] = await connection.db.select().from(bookings).where(eq(bookings.id, (await stored(phone)).requests[0]!.bookingId!));
    expect(booking!.notes).toBe("المستشفى: جناح B، دور 3، غرفة 7");
    expect(booking!.addressSnapshot).toMatchObject({ block: ADDRESS_NOT_PROVIDED, street: ADDRESS_NOT_PROVIDED, houseNumber: ADDRESS_NOT_PROVIDED, mapsUrl: null });
  });

  it("rejects with the reason and tells the client", async () => {
    const { phone, chatId } = client();
    const number = await confirmed(phone);
    h.sent.length = 0;
    await fromStaff(`no ${number} We are fully booked`);
    expect((await stored(phone)).requests[0]!.status).toBe("rejected");
    expect(h.sent.at(-1)).toMatchObject({ chatId });
    expect(h.sent.at(-1)!.text).toContain("We are fully booked");
    expect(h.sent.at(-1)!.text).toContain("We could not confirm");
  });

  it("lets staff change the address of a pending request, and uses it on approval", async () => {
    const { phone } = client();
    const number = await confirmed(phone);
    h.sent.length = 0;
    await fromStaff(`address ${number} street 7, house 20, floor 2, https://maps.app.goo.gl/new`);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.chatId).toBe(staffChat);
    expect(h.sent[0]!.text).toContain(`The address of #${number} was changed.`);
    expect(h.sent[0]!.text).toContain("العنوان: قطعة 3، شارع 7، منزل 20، دور 2");
    expect(h.sent[0]!.text).toContain("الموقع: https://maps.app.goo.gl/new");
    expect((await stored(phone)).requests[0]!.details).toMatchObject({ area: areaName, address: { block: "3", street: "7", houseNumber: "20", floor: "2", mapsUrl: "https://maps.app.goo.gl/new" } });
    await fromStaff(`yes ${number}`);
    const { requests: [request] } = await stored(phone);
    const [booking] = await connection.db.select().from(bookings).where(eq(bookings.id, request!.bookingId!));
    expect(booking!.addressSnapshot).toMatchObject({ block: "3", street: "7", houseNumber: "20", floor: "2", mapsUrl: "https://maps.app.goo.gl/new" });
    h.sent.length = 0;
    await fromStaff(`address ${number} street 9`);
    expect(h.sent.at(-1)!.text).toBe(`Request #${number} was already approved.`);
  });

  it("keeps the address when the staff command is unclear, the area is unknown, or the link is not Google Maps", async () => {
    const { phone } = client();
    const number = await confirmed(phone);
    const before = (await stored(phone)).requests[0]!.details;
    await fromStaff(`address ${number} near the mosque`);
    expect(h.sent.at(-1)!.text).toContain(`The address of #${number} was not changed.`);
    await fromStaff(`address ${number} area Nowhere, block 1`);
    expect(h.sent.at(-1)!.text).toBe(`Area "Nowhere" was not found. The address of #${number} was not changed.`);
    await fromStaff(`address ${number} https://evil.example/x`);
    expect(h.sent.at(-1)!.text).toContain("the link must be from Google Maps");
    expect((await stored(phone)).requests[0]!.details).toEqual(before);
  });

  it("answers help for anything else and for an unknown request", async () => {
    await fromStaff("hello");
    expect(h.sent.at(-1)!.text).toContain("Commands:");
    await fromStaff("yes 999999999");
    expect(h.sent.at(-1)!.text).toBe("Request #999999999 was not found.");
    expect(h.aiCalls).toHaveLength(0);
  });

  it("ignores the same commands from anyone but the staff number", async () => {
    const { phone } = client();
    const number = await confirmed(phone);
    const other = client();
    await deliver(h.app, payload(other.phone, `yes ${number}`)); await h.whatsapp.idle();
    expect((await stored(phone)).requests[0]!.status).toBe("pending");
  });
});

describe("main menu options", () => {
  it("sends the price list photo, then the menu, and keeps answering when OpenWA reports the photo", async () => {
    const { phone, chatId } = client();
    for (const text of ["مرحبا", "1"]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
    h.sent.length = 0;
    await deliver(h.app, payload(phone, "3")); await h.whatsapp.idle();
    expect(h.sent.map(message => message.image?.mimetype)).toEqual([undefined]);
    const branchLine = h.sent[0]!.text.split("\n").find(line => line.endsWith(`. ${branchName}`))!;
    h.sent.length = 0;
    await deliver(h.app, payload(phone, branchLine.split(".")[0]!)); await h.whatsapp.idle();
    expect(h.sent.map(message => [message.chatId, message.image?.mimetype])).toEqual([[chatId, "image/png"], [chatId, undefined]]);
    expect(h.sent[0]!.image).toEqual({ mimetype: "image/png", size: statSync(new URL("../assets/salon-price-list.png", import.meta.url)).size, filename: "salon-price-list.png" });
    expect(h.sent[0]!.text).toBe("Salon service");
    expect(h.sent[1]!.text).toContain(`📍 ${branchName}\nhttps://maps.google.com/maps?q=29.276134490966797%2C47.964111328125&z=17&hl=en`);
    expect(h.sent[1]!.text).toContain("1. Book an appointment");
    await deliver(h.app, ownMessage(phone, "", { type: "image" }));
    await deliver(h.app, ownMessage(phone, "Salon service", { type: "image" }));
    expect((await stored(phone)).conversation!.aiPaused).toBe(false);
    h.sent.length = 0;
    await deliver(h.app, payload(phone, "2")); await h.whatsapp.idle();
    expect(h.sent[0]!.text).toBe("Home service price list");
    expect(h.sent[0]!.image).toEqual({ mimetype: "image/jpeg", size: statSync(new URL("../assets/home-price-list.jpg", import.meta.url)).size, filename: "home-price-list.jpg" });
  });

  it("has no talk-to-an-employee option: 4 asks what to change and the AI keeps running", async () => {
    const { phone, chatId } = client();
    for (const text of ["مرحبا", "1"]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
    h.sent.length = 0;
    await deliver(h.app, payload(phone, "4")); await h.whatsapp.idle();
    expect(h.sent.map(message => message.chatId)).toEqual([chatId]);
    expect(h.sent[0]!.text).toBe("We found no upcoming reservation on this number.\n\n✏️ What would you like to change? Send it in one message.");
    expect((await stored(phone)).conversation!.aiPaused).toBe(false);
  });
});

describe("one upcoming reservation, the reservation-day reminder, and cancelling", () => {
  const send = async (phone: string, ...texts: string[]) => { for (const text of texts) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); } };
  // Each test moves its reservation to its own day, far from the days other tests book.
  let dayOffset = 40;
  const kuwait = (day: string, time: string) => new Date(`${day}T${time}:00+03:00`);
  /** A client with an approved reservation moved to 12:00 on a day of its own, and its booking. */
  async function approved() {
    const { phone, chatId } = client();
    await fromStaff(`yes ${await confirmed(phone)}`);
    const day = new Date(Date.now() + 3 * 3_600_000 + dayOffset++ * 86_400_000).toISOString().slice(0, 10);
    const id = (await stored(phone)).requests[0]!.bookingId!;
    await connection.db.update(bookings).set({ date: day, startTime: "12:00", endTime: "13:00" }).where(eq(bookings.id, id));
    const [booking] = await connection.db.select().from(bookings).where(eq(bookings.id, id));
    return { phone, chatId, booking: booking!, day };
  }
  /** Runs the reminder sweep at this Kuwait time on the day and sends what it queued. */
  async function sweepAt(day: string, time: string) {
    h.at(kuwait(day, time));
    await h.whatsapp.remind(); await h.whatsapp.drain(); await h.whatsapp.idle();
  }
  /** A client who received the reminder of today's reservation. */
  async function reminded() {
    const found = await approved();
    await sweepAt(found.day, "08:00");
    return found;
  }
  const bookingStatus = async (id: string) => (await connection.db.select({ status: bookings.visitStatus }).from(bookings).where(eq(bookings.id, id)))[0]!.status;
  const to = (chatId: string) => h.sent.filter(message => message.chatId === chatId);

  it("reminds the client at 8am on the reservation day, once, asking to confirm or cancel", async () => {
    const { chatId, day } = await approved();
    h.sent.length = 0;
    await sweepAt(day, "07:59");
    expect(to(chatId)).toEqual([]);
    await sweepAt(day, "08:00");
    expect(to(chatId).map(message => message.text)).toEqual([expect.stringMatching(/^⏰ Reminder: you have a reservation today\.\n📅 .+ · 12:00 - 13:00 · 💈 .+\n\n1\. Confirm ✅\n2\. Cancel the reservation ❌\n\nPlease choose the right number\.$/)]);
    await sweepAt(day, "09:00");
    expect(to(chatId)).toHaveLength(1);
  });

  it("does not remind a reservation made after 8am on its day, or one that has started", async () => {
    const late = await approved();
    await connection.db.update(bookings).set({ createdAt: kuwait(late.day, "08:30") }).where(eq(bookings.id, late.booking.id));
    const started = await approved();
    h.sent.length = 0;
    await sweepAt(late.day, "09:00");
    await sweepAt(started.day, "12:00");
    expect([...to(late.chatId), ...to(started.chatId)]).toEqual([]);
  });

  it("only thanks the client who confirms, even hours after the reminder", async () => {
    const { phone, chatId } = await reminded();
    h.advance(3 * 3_600_000);
    h.sent.length = 0;
    await send(phone, "1");
    expect(h.sent).toEqual([expect.objectContaining({ chatId, text: "✅ Thank you for confirming. See you today!" })]);
    expect((await stored(phone)).requests).toHaveLength(1);
  });

  it("checks the reservation with option 5, and offers to book when there is none", async () => {
    const { phone } = await approved();
    await send(phone, "hi", "1", "5");
    expect(h.sent.at(-1)!.text).toMatch(/^📋 Your reservation:\n📅 .+ · 12:00 - 13:00 · 💈 .+\n\n✂️ \*J4Kids Salon\*/);
    const other = client();
    await send(other.phone, "hi", "1", "5");
    expect(h.sent.at(-1)!.text).toContain("You have no upcoming reservation. Would you like to book one?");
  });

  it("cancels the reservation once staff approve the client's cancellation", async () => {
    const { phone, chatId, booking } = await reminded();
    h.sent.length = 0;
    await send(phone, "2");
    const cancel = (await stored(phone)).requests.at(-1)!;
    expect(cancel).toMatchObject({ status: "pending", details: { type: "cancel", reservation: { kind: "booking", id: booking.id, reference: booking.reference } } });
    const toStaff = h.sent.find(message => message.chatId === staffChat)!;
    expect(toStaff.text).toContain(`طلب إلغاء حجز من واتساب #${cancel.number}`);
    expect(toStaff.text).toContain(`الحجز: ${booking.reference}`);
    expect(await bookingStatus(booking.id)).toBe("booked");
    h.sent.length = 0;
    await fromStaff(`yes ${cancel.number}`);
    expect(await bookingStatus(booking.id)).toBe("cancelled");
    expect((await stored(phone)).requests.at(-1)!.status).toBe("approved");
    expect(h.sent.map(message => message.chatId)).toEqual([staffChat, chatId]);
    expect(h.sent[0]!.text).toBe(`Cancellation #${cancel.number} approved. Reservation ${booking.reference} was cancelled. The client was told.`);
    expect(h.sent[1]!.text).toContain("✅ Your reservation");
    expect(h.sent[1]!.text).toContain("was cancelled.");
    // With the reservation cancelled, the client can book again.
    await send(phone, "hi", "1", "1");
    expect(h.sent.at(-1)!.text).toContain("👶 Who is this for?");
  });

  it("keeps the reservation when staff refuse, and tells the client staff will contact them", async () => {
    const { phone, chatId, booking } = await reminded();
    await send(phone, "2");
    const cancel = (await stored(phone)).requests.at(-1)!;
    h.sent.length = 0;
    await fromStaff(`no ${cancel.number}`);
    expect(await bookingStatus(booking.id)).toBe("booked");
    expect((await stored(phone)).requests.at(-1)!.status).toBe("rejected");
    expect(h.sent.at(-1)).toMatchObject({ chatId, text: "❌ We could not cancel your reservation.\nA staff member will contact you." });
  });

  it("edits the reservation with option 4: no cancel option, and the change goes to staff", async () => {
    const { phone, booking } = await approved();
    await send(phone, "hi", "1", "4");
    expect(h.sent.at(-1)!.text).toMatch(/^📋 Your reservation:\n📅 .+\n\n✏️ What would you like to change\? Send it in one message\.$/);
    h.sent.length = 0;
    await send(phone, "Make it 5 pm");
    expect(h.sent.find(message => message.chatId === staffChat)!.text).toContain(booking.reference);
  });

  it("refuses a new booking while a reservation or a request is upcoming", async () => {
    const { phone } = client();
    await confirmed(phone);
    await send(phone, "hi", "1", "1");
    expect(h.sent.at(-1)!.text).toContain("⚠️ You already have an upcoming reservation, so a new one cannot be booked.");
    expect(h.sent.at(-1)!.text).toContain("(waiting for confirmation)");
  });

  it("refuses an address change for a cancellation", async () => {
    const { phone } = await reminded();
    await send(phone, "2");
    const cancel = (await stored(phone)).requests.at(-1)!;
    await fromStaff(`address ${cancel.number} street 9`);
    expect(h.sent.at(-1)!.text).toBe(`Request #${cancel.number} is a cancellation. It has no address to change.`);
  });
});

describe("two staff numbers", () => {
  const second = `+20${randomInt(1000000000, 1099999999)}`, secondChat = `${second.slice(1)}@c.us`;
  beforeEach(() => { phones.push(second); h = harness({ ...settings, staffPhones: [staff, second] }); });
  const from = async (phone: string, text: string) => { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); };

  it("sends a new request to both", async () => {
    const { phone, chatId } = client();
    await toConfirm(phone);
    h.sent.length = 0;
    await from(phone, "1");
    expect(h.sent.map(message => message.chatId)).toEqual([staffChat, secondChat, chatId]);
    expect(h.sent[1]!.text).toBe(h.sent[0]!.text);
  });

  it("tells the other number about an approval and refuses its later decision", async () => {
    const { phone, chatId } = client();
    const number = await confirmed(phone);
    h.sent.length = 0;
    await from(second, `yes ${number}`);
    expect(h.sent.map(message => message.chatId)).toEqual([secondChat, chatId, staffChat]);
    expect(h.sent[2]!.text).toContain(`Request #${number} was approved by ${second}.`);
    h.sent.length = 0;
    await from(staff, `no ${number} Too late`);
    expect(h.sent).toEqual([expect.objectContaining({ chatId: staffChat, text: `Request #${number} was already approved.` })]);
    expect((await stored(phone)).requests[0]!.status).toBe("approved");
  });

  it("tells the other number about a rejection and refuses its later decision", async () => {
    const { phone, chatId } = client();
    const number = await confirmed(phone);
    h.sent.length = 0;
    await from(staff, `no ${number} Fully booked`);
    expect(h.sent.map(message => message.chatId)).toEqual([staffChat, chatId, secondChat]);
    expect(h.sent[2]!.text).toContain(`Request #${number} was rejected by ${staff}: Fully booked`);
    h.sent.length = 0;
    await from(second, `yes ${number}`);
    expect(h.sent).toEqual([expect.objectContaining({ chatId: secondChat, text: `Request #${number} was already rejected.` })]);
    expect((await stored(phone)).requests[0]!.status).toBe("rejected");
  });

  it("sends a changed address to the other number too", async () => {
    const { phone } = client();
    const number = await confirmed(phone);
    h.sent.length = 0;
    await from(second, `address ${number} house 30`);
    expect(h.sent.map(message => message.chatId)).toEqual([secondChat, staffChat]);
    expect(h.sent[1]!.text).toContain(`The address of #${number} was changed by ${second}.`);
    expect(h.sent[1]!.text).toContain("منزل 30");
  });

  it("never treats either number as a client", async () => {
    await from(second, "hello");
    expect(h.sent.at(-1)).toMatchObject({ chatId: secondChat });
    expect(h.sent.at(-1)!.text).toContain("Commands:");
    await deliver(h.app, ownMessage(second, "note"));
    expect((await stored(second)).conversation!.aiPaused).toBe(false);
  });
});

describe("staff takeover", () => {
  it("stops the AI when staff reply from the phone, keeps the messages, and resumes on ai on", async () => {
    const { phone } = client();
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    expect((await deliver(h.app, ownMessage(phone, "أهلاً، معك الموظف"))).status).toBe(200);
    h.sent.length = 0;
    await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
    expect(h.sent).toEqual([]);
    const { conversation, messages } = await stored(phone);
    expect(conversation!.aiPaused).toBe(true);
    expect(messages.map(message => [message.direction, message.body])).toContainEqual(["outbound", "أهلاً، معك الموظف"]);
    expect(messages.at(-1)).toMatchObject({ direction: "inbound", status: "done" });
    await fromStaff(`ai on ${phone}`);
    expect(h.sent.at(-1)!.text).toBe(`The AI answers ${phone} again.`);
    h.sent.length = 0;
    await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
    expect(h.sent).toHaveLength(1);
  });

  it("answers again on its own after 15 minutes with no message between staff and the client", async () => {
    const { phone } = client();
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    await deliver(h.app, ownMessage(phone, "أهلاً، معك الموظف"));
    h.advance(10 * 60_000);
    h.sent.length = 0;
    await deliver(h.app, payload(phone, "شكراً")); await h.whatsapp.idle();
    expect(h.sent).toEqual([]);
    // Ten minutes after the client's last message: still within 15 minutes of the chat's last message.
    h.advance(10 * 60_000);
    await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
    expect(h.sent).toEqual([]);
    h.advance(16 * 60_000);
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.text).toContain("1. English\n2. العربية");
    expect((await stored(phone)).conversation!.aiPaused).toBe(false);
  });

  it("keeps answering when OpenWA reports the AI's own replies as sent", async () => {
    const { phone } = client();
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    expect((await deliver(h.app, ownMessage(phone, h.sent.at(-1)!.text))).status).toBe(200);
    const { conversation, messages } = await stored(phone);
    expect(conversation!.aiPaused).toBe(false);
    expect(messages.filter(message => message.direction === "outbound")).toHaveLength(1);
    h.sent.length = 0;
    await deliver(h.app, payload(phone, "2")); await h.whatsapp.idle();
    expect(h.sent).toHaveLength(1);
  });

  it("does not pause when the report arrives before the send has finished", async () => {
    const { phone } = client();
    let reply = "";
    h.failSends(message => { reply = message.text; return { status: 503 }; });
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    await deliver(h.app, ownMessage(phone, reply));
    expect((await stored(phone)).conversation!.aiPaused).toBe(false);
  });

  it("still pauses when staff type the AI's words themselves later", async () => {
    const { phone } = client();
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    const reply = h.sent.at(-1)!.text;
    h.advance(16 * 60_000);
    await deliver(h.app, ownMessage(phone, reply));
    expect((await stored(phone)).conversation!.aiPaused).toBe(true);
  });

  it("starts paused when staff message a client first, and ignores a message to the staff number", async () => {
    const { phone } = client();
    await deliver(h.app, ownMessage(phone, "مرحبا من الموظف"));
    expect((await stored(phone)).conversation!.aiPaused).toBe(true);
    await deliver(h.app, ownMessage(staff, "note"));
    expect((await stored(staff)).messages.some(message => message.body === "note")).toBe(false);
  });

  it("counts a repeated phone message once", async () => {
    const { phone } = client();
    const body = ownMessage(phone, "مرة واحدة");
    await deliver(h.app, body); await deliver(h.app, body);
    expect((await stored(phone)).messages).toHaveLength(1);
  });
});
