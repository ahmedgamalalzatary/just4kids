import { createHmac, randomInt, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { accounts, areas, bookingVisitEvents, bookings, clientAddresses, clients, employeeWorkDays, employeeWorkIntervals, employees, whatsappConversations, whatsappMessages, whatsappRequests } from "@just4kids/db/schema";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/index.js";
import { apiEnvSchema } from "../src/configs/env.js";
import { createWhatsApp } from "../src/modules/whatsapp/index.js";
import { createWhatsAppRepository } from "../src/modules/whatsapp/whatsapp.repository.js";

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

type Sent = { chatId: string; text: string; key: string };
type Decision = { reply: string; value: Record<string, unknown> | null; forward: string | null };
const barberName = `Barber${randomInt(100000, 999999)}`, areaName = `Area${randomInt(100000, 999999)}`, barberId = randomUUID();
function harness() {
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
    throw new Error(`unexpected request to ${url}`);
  };
  const whatsapp = createWhatsApp(connection, settings, { fetch: fetcher, prompt: "OWNER RULES", now: () => clock });
  const app = createApp({ auth, connection, env, whatsapp });
  return {
    app, whatsapp, sent, aiCalls,
    answer: (...next: (Decision | Error | number)[]) => { decisions.push(...next); },
    failSends: (next: typeof sendStatus) => { sendStatus = next; },
    advance: (ms: number) => { clock = new Date(clock.getTime() + ms); },
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
  for (let day = 0; day < 7; day++) {
    await connection.db.insert(employeeWorkDays).values({ employeeId: barberId, dayOfWeek: day, active: true });
    await connection.db.insert(employeeWorkIntervals).values({ employeeId: barberId, dayOfWeek: day, startTime: "08:00", endTime: "23:00" });
  }
  const { barbers } = await createWhatsAppRepository(connection).options();
  barberOption = String(barbers.findIndex(barber => barber.id === barberId) + 1);
  anyBarberOption = String(barbers.length + 1);
});
let barberOption = "1", anyBarberOption = "2";
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

// Walks a client from the first message to the confirm step using only menu numbers.
async function toConfirm(phone: string, barberChoice: string, time = nextWindow(), address = "https://www.google.com/maps?q=29.3,48.0") {
  for (const text of ["مرحبا", "1", "1", "1", "1", barberChoice, "7", time, areaName, address]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
}
// Every test books its own window, because they all share one barber and date.
let windowHour = 8;
const nextWindow = () => { const hour = String(windowHour++).padStart(2, "0"); return `${hour}:00-${hour}:30`; };
async function confirmed(phone: string, barberChoice = barberOption, time = nextWindow()) {
  await toConfirm(phone, barberChoice, time);
  await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
  return (await stored(phone)).requests.at(-1)!.number;
}
const staffChat = `${staff.slice(1)}@c.us`;
const fromStaff = async (text: string) => { await deliver(h.app, payload(staff, text)); await h.whatsapp.idle(); };
const ownMessage = (phone: string, text: string) => { const digits = phone.slice(1); return { ...payload(phone, text, { fromMe: true, from: "96590000000@c.us", to: `${digits}@c.us` }), event: "message.sent" }; };

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
    await toConfirm(phone, barberOption);
    expect(h.sent.some(message => message.text.includes(barberName))).toBe(true);
    h.sent.length = 0;
    await deliver(h.app, payload(phone, "1")); await h.whatsapp.idle();
    const number = (await stored(phone)).requests[0]!.number;
    expect(h.sent.map(message => message.chatId)).toEqual([staffChat, chatId]);
    expect(h.sent[0]!.text).toContain(`طلب حجز جديد من واتساب #${number}`);
    expect(h.sent[0]!.text).toContain(`الحلاق: ${barberName}`);
    expect(h.sent[0]!.text).toContain("الموقع: https://www.google.com/maps?q=29.3,48.0");
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
    for (const text of ["مرحبا", "1", "2", "ألغ موعد الأحد"]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
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
    await toConfirm(phone, barberOption);
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
    await toConfirm(phone, barberOption);
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
    expect(booking!.addressSnapshot).toMatchObject({ area: areaName, block: "—", mapsUrl: "https://www.google.com/maps?q=29.3,48.0" });
    expect(h.sent.map(message => message.chatId)).toEqual([staffChat, chatId]);
    expect(h.sent[0]!.text).toContain(booking!.reference);
    h.sent.length = 0;
    await fromStaff(`yes ${number}`);
    expect(h.sent).toEqual([expect.objectContaining({ chatId: staffChat, text: `Request #${number} was already approved.` })]);
  });

  it("needs a barber when the client chose any, and refuses an unknown name", async () => {
    const { phone } = client();
    const number = await confirmed(phone, anyBarberOption);
    h.sent.length = 0;
    await fromStaff(`yes ${number}`);
    expect(h.sent[0]!.text).toContain(`Choose a barber for #${number}`);
    await fromStaff(`yes ${number} Nobody`);
    expect((await stored(phone)).requests[0]!.status).toBe("pending");
  });

  it("uses the existing client and keeps the request open when the barber is busy", async () => {
    const { phone } = client();
    const time = nextWindow();
    const first = await confirmed(phone, barberOption, time);
    await fromStaff(`yes ${first}`);
    for (const text of ["مرحبا", "1", "1", "1", "1", barberOption, "7", time, areaName, "https://www.google.com/maps?q=29.3,48.0", "1"]) { await deliver(h.app, payload(phone, text)); await h.whatsapp.idle(); }
    const second = (await stored(phone)).requests.at(-1)!.number;
    expect(second).not.toBe(first);
    h.sent.length = 0;
    await fromStaff(`yes ${second}`);
    expect(h.sent[0]!.text).toContain(`Request #${second} was not created`);
    const { requests } = await stored(phone);
    expect(requests.find(request => request.number === second)!.status).toBe("pending");
    expect(await connection.db.select().from(clients).where(eq(clients.phone, phone))).toHaveLength(1);
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
