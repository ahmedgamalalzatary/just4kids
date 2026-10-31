import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseInbound, parseOwnMessage, verifySignature, createOpenWa } from "../src/modules/whatsapp/openwa.js";
import { AiRefusedError, createAi, parseInterpretation } from "../src/modules/whatsapp/ai.js";
import { aiFailureMessage, parseStaffCommand, staffMessage } from "../src/modules/whatsapp/messages.js";
import { NOT_PROVIDED } from "../src/modules/whatsapp/flow.js";
import { readOwnerPrompt } from "../src/modules/whatsapp/index.js";
import apiPackage from "../package.json" with { type: "json" };

const secret = "s".repeat(32);
const sign = (body: string, key = secret) => `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
const message = (data: Record<string, unknown> = {}, envelope: Record<string, unknown> = {}) => ({
  event: "message.received", timestamp: "2026-10-24T10:00:00.000Z", sessionId: "business", idempotencyKey: "msg_business_ABC", deliveryId: "dlv_1",
  data: { id: "false_96550000001@c.us_ABC", from: "96550000001@c.us", to: "96590000000@c.us", chatId: "96550000001@c.us", body: "أبي موعد", type: "text", fromMe: false, isGroup: false, kind: "individual", timestamp: 1, ...data },
  ...envelope,
});

describe("OpenWA webhook signature", () => {
  it("accepts only the HMAC-SHA256 of the exact raw body", () => {
    const body = JSON.stringify(message());
    expect(verifySignature(Buffer.from(body), sign(body), secret)).toBe(true);
    expect(verifySignature(Buffer.from(`${body} `), sign(body), secret)).toBe(false);
    expect(verifySignature(Buffer.from(body), sign(body, "x".repeat(32)), secret)).toBe(false);
    expect(verifySignature(Buffer.from(body), sign(body).replace("sha256=", ""), secret)).toBe(false);
    expect(verifySignature(Buffer.from(body), "sha256=00", secret)).toBe(false);
    expect(verifySignature(Buffer.from(body), undefined, secret)).toBe(false);
  });
});

describe("OpenWA inbound messages", () => {
  it("reads a client's individual text message", () => {
    expect(parseInbound(message(), "business")).toEqual({ key: "msg_business_ABC", phone: "+96550000001", chatId: "96550000001@c.us", text: "أبي موعد" });
  });
  it("uses the resolved phone for a privacy-id sender and replies to the privacy-id chat", () => {
    expect(parseInbound(message({ from: "123456789@lid", chatId: "123456789@lid", senderPhone: "96550000002" }), "business")).toMatchObject({ phone: "+96550000002", chatId: "123456789@lid" });
  });
  it.each([
    ["another event", message({}, { event: "message.sent" })],
    ["another session", message({}, { sessionId: "other" })],
    ["the session's own message", message({ fromMe: true })],
    ["a group message", message({ isGroup: true, kind: "group", chatId: "1203630@g.us" })],
    ["a status broadcast", message({ kind: "status" })],
    ["a voice note", message({ type: "voice", body: "" })],
    ["an image", message({ type: "image" })],
    ["a location without coordinates", message({ type: "location" })],
    ["an empty text", message({ body: "   " })],
    ["an unresolved privacy id", message({ from: "123@lid", chatId: "123@lid", senderPhone: null })],
    ["a malformed payload", { event: "message.received", sessionId: "business" }],
  ])("ignores %s", (_name, payload) => {
    expect(parseInbound(payload, "business")).toBeNull();
  });
  it("turns a shared location into a Google Maps link", () => {
    expect(parseInbound(message({ type: "location", body: "", location: { latitude: 29.3, longitude: 48.05 } }), "business")).toMatchObject({ text: "https://www.google.com/maps?q=29.3,48.05" });
  });
});

describe("messages typed on the linked phone", () => {
  const own = (data: Record<string, unknown> = {}) => message({ fromMe: true, from: "96590000000@c.us", to: "96550000001@c.us", ...data }, { event: "message.sent" });
  it("reads the client's number from the recipient", () => {
    expect(parseOwnMessage(own(), "business")).toEqual({ key: "msg_business_ABC", phone: "+96550000001", chatId: "96550000001@c.us", text: "أبي موعد", media: false });
  });
  it("still reports a non-text reply", () => {
    expect(parseOwnMessage(own({ type: "image", body: "" }), "business")).toMatchObject({ text: "[image]", media: true });
  });
  it.each([["another session", message({ fromMe: true }, { event: "message.sent", sessionId: "other" })], ["a group", own({ isGroup: true })], ["a received message", message()]])("ignores %s", (_name, payload) => {
    expect(parseOwnMessage(payload, "business")).toBeNull();
  });
});

describe("OpenWA send-text", () => {
  const settings = { baseUrl: "http://openwa:2785", apiKey: "openwa-key", sessionId: "business session", webhookSecret: secret };
  const respond = (status: number, body: unknown) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("sends with the API key, a stable idempotency key, and no link preview", async () => {
    const fetcher = respond(201, { messageId: "true_x_1", timestamp: 1 });
    expect(await createOpenWa(settings, fetcher).sendText("96550000001@c.us", "مرحبا", "j4k-key-1")).toEqual({ status: "sent", messageId: "true_x_1" });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("http://openwa:2785/api/sessions/business%20session/messages/send-text");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": "openwa-key", "Idempotency-Key": "j4k-key-1" } });
    expect(JSON.parse(String(init?.body))).toEqual({ chatId: "96550000001@c.us", text: "مرحبا", linkPreview: false });
  });
  it.each([
    [409, { statusCode: 409, code: "IDEMPOTENCY_KEY_IN_PROGRESS" }], [429, { statusCode: 429, code: "SEND_PACING_LIMITED" }],
    [400, { statusCode: 400, message: "Session not active" }], [503, { statusCode: 503 }], [500, {}],
  ])("retries later on %i", async (status, body) => {
    expect(await createOpenWa(settings, respond(status, body)).sendText("c", "t", "k")).toMatchObject({ status: "retry" });
  });
  it("sends a photo with its caption and the same retry key", async () => {
    const fetcher = respond(201, { messageId: "true_x_2" });
    expect(await createOpenWa(settings, fetcher).sendImage("96550000001@c.us", { data: Buffer.from("photo"), mimetype: "image/jpeg", filename: "price-list.jpg" }, "Prices", "j4k-key-2")).toEqual({ status: "sent", messageId: "true_x_2" });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("http://openwa:2785/api/sessions/business%20session/messages/send-image");
    expect(init).toMatchObject({ headers: { "Idempotency-Key": "j4k-key-2" } });
    expect(JSON.parse(String(init!.body))).toEqual({ chatId: "96550000001@c.us", base64: Buffer.from("photo").toString("base64"), mimetype: "image/jpeg", filename: "price-list.jpg", caption: "Prices" });
  });
  it("retries later when OpenWA cannot be reached", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await createOpenWa(settings, fetcher).sendText("c", "t", "k")).toMatchObject({ status: "retry" });
  });
  it.each([[409, "IDEMPOTENCY_OUTCOME_UNKNOWN"], [422, "IDEMPOTENCY_KEY_REUSED"]])("gives up on %i %s, since a resend could duplicate the message", async (status, code) => {
    expect(await createOpenWa(settings, respond(status, { statusCode: status, code })).sendText("c", "t", "k")).toMatchObject({ status: "failed" });
  });
});

describe("AI answers", () => {
  it("reads a JSON answer, also inside a code fence, and defaults the optional parts", () => {
    expect(parseInterpretation(JSON.stringify({ reply: "أهلا", value: null, forward: null }))).toEqual({ reply: "أهلا", value: null, forward: null });
    expect(parseInterpretation("```json\n{\"value\":{\"count\":2}}\n```")).toEqual({ reply: "", value: { count: 2 } });
  });
  it.each(["not json", JSON.stringify({ reply: 3 }), JSON.stringify({ value: "x" })])("rejects %s", content => {
    expect(() => parseInterpretation(content)).toThrow();
  });
  const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: "أهلا", value: null, forward: null }) } }] }), { status: 200 });
  it("calls the OpenAI-compatible chat completions endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => ok());
    await createAi({ baseUrl: "https://ai.example.com/v1", apiKey: "ai-key", model: "model-1" }, fetcher).interpret([{ role: "user", content: "السلام عليكم" }]);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://ai.example.com/v1/chat/completions");
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Bearer ai-key", "Content-Type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual({ model: "model-1", messages: [{ role: "user", content: "السلام عليكم" }], response_format: { type: "json_object" }, max_completion_tokens: 2000, temperature: 0.3 });
  });
  it("sends the thinking setting only when it is configured", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => ok());
    await createAi({ baseUrl: "https://ai.example.com/v1", apiKey: "k", model: "m", thinking: "disabled" }, fetcher).interpret([]);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).thinking).toEqual({ type: "disabled" });
  });
  it.each([400, 401, 402, 403, 404, 421])("marks a %i answer as a refusal that a retry cannot fix", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
    await expect(createAi({ baseUrl: "https://ai.example.com/v1", apiKey: "k", model: "m" }, fetcher).interpret([])).rejects.toBeInstanceOf(AiRefusedError);
  });
  it.each([429, 500, 503])("treats a %i answer as temporary", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
    await expect(createAi({ baseUrl: "https://ai.example.com/v1", apiKey: "k", model: "m" }, fetcher).interpret([])).rejects.not.toBeInstanceOf(AiRefusedError);
  });
  it("fails without exposing the API key when the provider refuses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response("{}", { status: 401 }));
    await expect(createAi({ baseUrl: "https://ai.example.com/v1", apiKey: "secret-ai-key", model: "m" }, fetcher).interpret([])).rejects.not.toThrow(/secret-ai-key/);
  });
});

describe("staff messages", () => {
  const address = { block: "3", street: "5", houseNumber: "12", buildingName: null, avenue: null, floor: null, apartment: null, mapsUrl: null };
  const details = { who: "family" as const, adults: 1, children: 2, specialChildren: 1, barberId: "b1", barberName: "Lenny", date: "2026-11-01", startTime: "16:00", endTime: "18:00", areaId: "a1", area: "Hawally", address };
  it("sends the full request and how to answer it", () => {
    expect(staffMessage({ type: "new_request", details }, "+96550000001", 12)).toBe([
      "طلب حجز جديد من واتساب #12", "العميل: +96550000001", "لمن: كبار وأطفال", "الكبار: 1", "الأطفال: 2", "ذوو احتياجات خاصة: 1", "الحلاق: Lenny", "التاريخ: 2026-11-01", "الوقت: 16:00 - 18:00", "المنطقة: Hawally", "العنوان: قطعة 3، شارع 5، منزل 12",
      "", "للموافقة: yes 12", "للرفض: no 12 <السبب>", "أو أنشئ الحجز من لوحة التحكم، ثم ارفض الطلب هنا.",
    ].join("\n"));
  });
  it.each([["boy", "ولد"], ["girl", "بنت"], ["baby", "رضيع"], ["special", "ذوو احتياجات خاصة"], ["both", "ولد وبنت"], ["adults", "كبار"], ["family", "كبار وأطفال"]] as const)("tells staff the client chose %s", (who, label) => {
    expect(staffMessage({ type: "new_request", details: { ...details, who } }, "+96550000001", 12).split("\n")[2]).toBe(`لمن: ${label}`);
  });
  it("asks staff to name a barber and shows only the link for a link-only address", () => {
    const text = staffMessage({ type: "new_request", details: { ...details, barberId: null, barberName: null, address: { ...address, block: NOT_PROVIDED, street: NOT_PROVIDED, houseNumber: NOT_PROVIDED, mapsUrl: "https://maps.app.goo.gl/x" } } }, "+96550000001", 12);
    expect(text).toContain("الحلاق: أي حلاق (يختار الموظف)");
    expect(text).toContain("للموافقة: yes 12 <اسم الحلاق>");
    expect(text).toContain("الموقع: https://maps.app.goo.gl/x");
    expect(text).not.toContain("Address:");
  });
  it("copies a change request as written, and alerts when the AI fails", () => {
    expect(staffMessage({ type: "change", text: "ألغ الأحد" }, "+96550000001", null, [7])).toBe(["Client wants to change or cancel", "Client: +96550000001", "Requests: #7", "Message: ألغ الأحد"].join("\n"));
    expect(aiFailureMessage("+96550000001", "the AI account has no credit", ["أبي موعد", "بكرة"])).toBe(["WhatsApp AI could not answer", "Client: +96550000001", "Reason: the AI account has no credit", "The client got no reply. Please contact them.", "Client's messages:", "أبي موعد", "بكرة"].join("\n"));
  });
});

describe("staff commands", () => {
  it.each([
    ["yes 12", { type: "approve", number: 12, barber: null }], ["YES #12 Lenny", { type: "approve", number: 12, barber: "Lenny" }], ["yes ١٢", { type: "approve", number: 12, barber: null }],
    ["no 12", { type: "reject", number: 12, reason: null }], ["no 12 barber is busy", { type: "reject", number: 12, reason: "barber is busy" }],
    ["ai on +96550000001", { type: "resume", phone: "+96550000001" }], ["AI ON 96550000001", { type: "resume", phone: "+96550000001" }],
    ["hello", { type: "help" }], ["yes", { type: "help" }],
  ])("reads %s", (text, command) => {
    expect(parseStaffCommand(text)).toEqual(command);
  });
});

describe("owner prompt", () => {
  it("is read from the prompt file, which ships with the API package", () => {
    expect(readOwnerPrompt().length).toBeGreaterThan(0);
    expect(apiPackage.files).toContain("prompts");
  });
});
