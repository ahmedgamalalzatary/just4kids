import { createHmac, randomInt } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "@just4kids/db";
import { whatsappConversations, whatsappMessages, whatsappRequests } from "@just4kids/db/schema";
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

type Sent = { chatId: string; text: string; key: string };
type Decision = { reply: string; action: Record<string, unknown> | null };
function harness() {
  const sent: Sent[] = [], aiCalls: { role: string; content: string }[][] = [];
  const decisions: (Decision | Error)[] = [];
  let sendStatus: (sent: Sent) => { status: number; body?: unknown } = () => ({ status: 201 });
  let clock = new Date("2026-10-24T09:00:00.000Z");
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input), body = JSON.parse(String(init?.body));
    if (url === "http://ai.test/v1/chat/completions") {
      aiCalls.push(body.messages);
      const next = decisions.shift() ?? new Error("no AI answer queued");
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
    answer: (...next: (Decision | Error)[]) => { decisions.push(...next); },
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
const details = { adults: 2, children: 1, address: "حولي، قطعة 3، شارع 5، منزل 12", date: "2026-10-25", window: "4–6 pm" };

let h: ReturnType<typeof harness>;
// Workers pick up every due conversation, so no test may inherit another test's unfinished work (test database only).
beforeEach(async () => { await connection.db.update(whatsappMessages).set({ status: "failed" }).where(eq(whatsappMessages.status, "pending")); h = harness(); });
afterAll(async () => {
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
    expect((await deliver(h.app, payload(staff, "رسالة من الموظف"))).status).toBe(200);
    await h.whatsapp.idle();
    expect((await stored(phone)).conversation).toBeUndefined();
    expect((await stored(staff)).conversation).toBeUndefined();
    expect(h.aiCalls).toHaveLength(0);
  });

  it("is not blocked by the browser origin guard and needs no session", async () => {
    const { phone } = client();
    h.answer({ reply: "حياك الله", action: null });
    expect((await deliver(h.app, payload(phone, "السلام عليكم"))).status).toBe(200);
    await h.whatsapp.idle();
  });
});

describe("WhatsApp intake", () => {
  it("collects a request, tells staff first, then tells the client a person will follow up", async () => {
    const { phone, chatId } = client();
    h.answer({ reply: "حياك الله، كم عدد الأشخاص والعنوان والموعد؟", action: null });
    await deliver(h.app, payload(phone, "أبي أحجز"));
    await h.whatsapp.idle();
    expect(h.sent).toEqual([{ chatId, text: "حياك الله، كم عدد الأشخاص والعنوان والموعد؟", key: expect.any(String) }]);

    h.answer({ reply: "تمام، بنبلغ الموظفين ويتواصلون معك", action: { type: "new_request", ...details } });
    await deliver(h.app, payload(phone, "شخصين وطفل، حولي قطعة 3 شارع 5 منزل 12، بكرة من 4 إلى 6"));
    await h.whatsapp.idle();
    const { messages, requests } = await stored(phone);
    expect(requests).toHaveLength(1);
    const number = requests[0]!.number;
    expect(h.sent.slice(1)).toEqual([
      { chatId: `${staff.slice(1)}@c.us`, text: `New WhatsApp request #${number}\nClient: ${phone}\nAdults: 2\nChildren: 1\nAddress: ${details.address}\nDate: 2026-10-25\nTime window: 4–6 pm`, key: expect.any(String) },
      { chatId, text: "تمام، بنبلغ الموظفين ويتواصلون معك", key: expect.any(String) },
    ]);
    expect(new Set(h.sent.map(message => message.key)).size).toBe(3);
    expect(messages.map(message => [message.direction, message.audience, message.status])).toEqual([
      ["inbound", "client", "done"], ["outbound", "client", "done"], ["inbound", "client", "done"], ["outbound", "staff", "done"], ["outbound", "client", "done"],
    ]);
    expect(requests[0]!.details).toEqual(details);
  });

  it("sends the owner's prompt, the fixed rules and the conversation history to the AI", async () => {
    const { phone } = client();
    h.answer({ reply: "كم عدد الأشخاص؟", action: null }, { reply: "والعنوان؟", action: null });
    await deliver(h.app, payload(phone, "أبي موعد")); await h.whatsapp.idle();
    await deliver(h.app, payload(phone, "شخصين")); await h.whatsapp.idle();
    const call = h.aiCalls[1]!;
    expect(call[0]!.role).toBe("system");
    expect(call[0]!.content.startsWith("OWNER RULES")).toBe(true);
    expect(call[0]!.content).toContain("\"new_request\"");
    expect(call.slice(1)).toEqual([{ role: "user", content: "أبي موعد" }, { role: "assistant", content: "كم عدد الأشخاص؟" }, { role: "user", content: "شخصين" }]);
  });

  it("answers duplicate and concurrent deliveries of one message once", async () => {
    const { phone } = client();
    h.answer({ reply: "أهلا", action: null }, { reply: "مكرر", action: null });
    const body = payload(phone, "مرحبا");
    const results = await Promise.all([deliver(h.app, body), deliver(h.app, body), deliver(h.app, body)]);
    expect(results.map(result => result.status)).toEqual([200, 200, 200]);
    await h.whatsapp.idle();
    await deliver(h.app, body); await h.whatsapp.idle();
    expect(h.aiCalls).toHaveLength(1);
    expect(h.sent.map(message => message.text)).toEqual(["أهلا"]);
    expect((await stored(phone)).messages).toHaveLength(2);
  });

  it("keeps each sender's conversation and requests apart", async () => {
    const first = client(), second = client();
    h.answer({ reply: "تم", action: { type: "new_request", ...details } });
    await deliver(h.app, payload(first.phone, "طلب العميل الأول")); await h.whatsapp.idle();
    const firstNumber = (await stored(first.phone)).requests[0]!.number;
    h.answer({ reply: "أهلا", action: null });
    await deliver(h.app, payload(second.phone, "مرحبا")); await h.whatsapp.idle();
    const call = h.aiCalls[1]!;
    expect(JSON.stringify(call)).not.toContain("طلب العميل الأول");
    expect(call[0]!.content).not.toContain(`#${firstNumber}`);
    expect(h.sent.at(-1)).toMatchObject({ chatId: second.chatId, text: "أهلا" });
  });

  it("sends staff an update naming the client's earlier request", async () => {
    const { phone } = client();
    h.answer({ reply: "تم", action: { type: "new_request", ...details } });
    await deliver(h.app, payload(phone, "طلب")); await h.whatsapp.idle();
    const number = (await stored(phone)).requests[0]!.number;
    h.answer({ reply: "بنبلغ الموظفين بالإلغاء", action: { type: "update_request", requestNumber: number, change: "Cancel the visit" } });
    await deliver(h.app, payload(phone, "ألغ الموعد")); await h.whatsapp.idle();
    expect(h.aiCalls[1]![0]!.content).toContain(`#${number}`);
    expect(h.sent.slice(-2).map(message => message.text)).toEqual([`Update to WhatsApp request #${number}\nClient: ${phone}\nChange: Cancel the visit`, "بنبلغ الموظفين بالإلغاء"]);
    expect((await stored(phone)).requests).toHaveLength(1);
  });

  it("forwards other questions to staff", async () => {
    const { phone } = client();
    h.answer({ reply: "بنبلغ الموظفين", action: { type: "forward", summary: "Asks whether the visit is confirmed" } });
    await deliver(h.app, payload(phone, "موعدي مأكد؟")); await h.whatsapp.idle();
    expect(h.sent.map(message => message.text)).toEqual([`WhatsApp message for staff\nClient: ${phone}\nAsks whether the visit is confirmed`, "بنبلغ الموظفين"]);
  });

  it("does not let the AI name another client's request", async () => {
    const other = client(), { phone } = client();
    h.answer({ reply: "تم", action: { type: "new_request", ...details } });
    await deliver(h.app, payload(other.phone, "طلب")); await h.whatsapp.idle();
    const foreign = (await stored(other.phone)).requests[0]!.number;
    h.sent.length = 0;
    h.answer({ reply: "تم", action: { type: "update_request", requestNumber: foreign, change: "Cancel" } });
    await deliver(h.app, payload(phone, "ألغ")); await h.whatsapp.idle();
    expect(h.sent).toEqual([]);
    expect((await stored(phone)).messages.map(message => message.status)).toEqual(["pending"]);
  });

  it("sends nothing while the AI fails and answers once it recovers", async () => {
    const { phone } = client();
    h.answer(new Error("down"));
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    expect(h.sent).toEqual([]);
    expect((await stored(phone)).messages.map(message => message.status)).toEqual(["pending"]);
    h.answer({ reply: "أهلا", action: null });
    await h.whatsapp.drain();
    expect(h.aiCalls).toHaveLength(1);
    h.advance(10 * 60_000);
    await h.whatsapp.drain();
    expect(h.aiCalls).toHaveLength(2);
    expect(h.sent.map(message => message.text)).toEqual(["أهلا"]);
  });

  it("holds the client reply until staff got the request, retrying with the same key", async () => {
    const { phone } = client();
    h.failSends(message => message.chatId.startsWith(staff.slice(1)) ? { status: 503, body: { statusCode: 503 } } : { status: 201 });
    h.answer({ reply: "تم، بنبلغ الموظفين", action: { type: "new_request", ...details } });
    await deliver(h.app, payload(phone, "طلب")); await h.whatsapp.idle();
    expect(h.sent).toEqual([]);
    const pending = (await stored(phone)).messages.filter(message => message.direction === "outbound");
    expect(pending.map(message => [message.audience, message.status, message.attempts])).toEqual([["staff", "pending", 1], ["client", "pending", 0]]);
    h.failSends(() => ({ status: 201 }));
    h.advance(10 * 60_000);
    await h.whatsapp.drain();
    expect(h.sent.map(message => [message.chatId.startsWith(staff.slice(1)) ? "staff" : "client", message.key])).toEqual([["staff", pending[0]!.idempotencyKey], ["client", pending[1]!.idempotencyKey]]);
    expect(h.aiCalls).toHaveLength(1);
  });

  it("never tells the client staff know when the staff send may have failed", async () => {
    const { phone } = client();
    h.failSends(message => message.chatId.startsWith(staff.slice(1)) ? { status: 409, body: { statusCode: 409, code: "IDEMPOTENCY_OUTCOME_UNKNOWN" } } : { status: 201 });
    h.answer({ reply: "تم، بنبلغ الموظفين", action: { type: "new_request", ...details } });
    await deliver(h.app, payload(phone, "طلب")); await h.whatsapp.idle();
    h.advance(10 * 60_000); await h.whatsapp.drain();
    expect(h.sent).toEqual([]);
    expect((await stored(phone)).messages.filter(message => message.direction === "outbound").map(message => [message.audience, message.status])).toEqual([["staff", "failed"], ["client", "failed"]]);
  });

  it("finishes stored work after a restart", async () => {
    const { phone } = client();
    h.answer(new Error("down"));
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    const restarted = harness();
    restarted.answer({ reply: "أهلا", action: null });
    restarted.advance(10 * 60_000);
    await restarted.whatsapp.drain();
    expect(restarted.sent.map(message => message.text)).toEqual(["أهلا"]);
  });

  it("lets only one worker answer a conversation at a time", async () => {
    const { phone } = client();
    h.answer(new Error("down"));
    await deliver(h.app, payload(phone, "مرحبا")); await h.whatsapp.idle();
    const a = harness(), b = harness();
    a.answer({ reply: "أهلا", action: null }); b.answer({ reply: "أهلا", action: null });
    a.advance(10 * 60_000); b.advance(10 * 60_000);
    await Promise.all([a.whatsapp.drain(), b.whatsapp.drain()]);
    expect(a.aiCalls.length + b.aiCalls.length).toBe(1);
    expect([...a.sent, ...b.sent].map(message => message.text)).toEqual(["أهلا"]);
  });
});
