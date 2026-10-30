import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseInbound, verifySignature, createOpenWa } from "../src/modules/whatsapp/openwa.js";
import { AiRefusedError, createAi, parseDecision } from "../src/modules/whatsapp/ai.js";
import { aiFailureMessage, staffMessage, technicalPrompt } from "../src/modules/whatsapp/messages.js";
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
    ["a location", message({ type: "location" })],
    ["an empty text", message({ body: "   " })],
    ["an unresolved privacy id", message({ from: "123@lid", chatId: "123@lid", senderPhone: null })],
    ["a malformed payload", { event: "message.received", sessionId: "business" }],
  ])("ignores %s", (_name, payload) => {
    expect(parseInbound(payload, "business")).toBeNull();
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
  it("retries later when OpenWA cannot be reached", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await createOpenWa(settings, fetcher).sendText("c", "t", "k")).toMatchObject({ status: "retry" });
  });
  it.each([[409, "IDEMPOTENCY_OUTCOME_UNKNOWN"], [422, "IDEMPOTENCY_KEY_REUSED"]])("gives up on %i %s, since a resend could duplicate the message", async (status, code) => {
    expect(await createOpenWa(settings, respond(status, { statusCode: status, code })).sendText("c", "t", "k")).toMatchObject({ status: "failed" });
  });
});

describe("AI decisions", () => {
  const request = { type: "new_request", adults: 2, children: 1, address: "حولي، قطعة 3، شارع 5، منزل 12", date: "2026-10-25", window: "4–6 pm" };
  it.each([
    { reply: "حياك الله، كم عدد الأشخاص؟", action: null },
    { reply: "تم، بنبلغ الموظفين", action: request },
    { reply: "تم، بنبلغ الموظفين بالتعديل", action: { type: "update_request", requestNumber: 3, change: "Cancel the visit" } },
    { reply: "بنبلغ الموظفين", action: { type: "forward", summary: "Asks whether request #3 is confirmed" } },
  ])("accepts %j", decision => {
    expect(parseDecision(JSON.stringify(decision))).toEqual(decision);
  });
  it("reads a JSON answer wrapped in a code fence", () => {
    expect(parseDecision("```json\n{\"reply\":\"أهلا\",\"action\":null}\n```")).toEqual({ reply: "أهلا", action: null });
  });
  it.each([
    "not json", "{}", JSON.stringify({ reply: "", action: null }), JSON.stringify({ reply: "x", action: { ...request, adults: 0, children: 0 } }),
    JSON.stringify({ reply: "x", action: { ...request, address: "" } }), JSON.stringify({ reply: "x", action: { type: "book_now" } }),
    JSON.stringify({ reply: "x", action: { type: "update_request", requestNumber: 0, change: "x" } }),
  ])("rejects %s", content => {
    expect(() => parseDecision(content)).toThrow();
  });
  it("calls the OpenAI-compatible chat completions endpoint and returns the decision", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify({ reply: "أهلا", action: null }) } }] }), { status: 200 }));
    const ai = createAi({ baseUrl: "https://ai.example.com/v1", apiKey: "ai-key", model: "model-1" }, fetcher);
    expect(await ai.decide([{ role: "system", content: "rules" }, { role: "user", content: "السلام عليكم" }])).toEqual({ reply: "أهلا", action: null });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://ai.example.com/v1/chat/completions");
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Bearer ai-key", "Content-Type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual({ model: "model-1", messages: [{ role: "system", content: "rules" }, { role: "user", content: "السلام عليكم" }], response_format: { type: "json_object" }, max_completion_tokens: 2000, temperature: 0.3 });
  });
  it("sends the thinking setting only when it is configured", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: "أهلا", action: null }) } }] }), { status: 200 }));
    await createAi({ baseUrl: "https://ai.example.com/v1", apiKey: "k", model: "m", thinking: "disabled" }, fetcher).decide([]);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).thinking).toEqual({ type: "disabled" });
  });
  it.each([400, 401, 402, 403, 404, 421])("marks a %i answer as a refusal that a retry cannot fix", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
    await expect(createAi({ baseUrl: "https://ai.example.com/v1", apiKey: "k", model: "m" }, fetcher).decide([])).rejects.toBeInstanceOf(AiRefusedError);
  });
  it.each([429, 500, 503])("treats a %i answer as temporary", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
    await expect(createAi({ baseUrl: "https://ai.example.com/v1", apiKey: "k", model: "m" }, fetcher).decide([])).rejects.not.toBeInstanceOf(AiRefusedError);
  });
  it("fails without exposing the API key when the provider refuses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{\"error\":\"bad key\"}", { status: 401 }));
    await expect(createAi({ baseUrl: "https://ai.example.com/v1", apiKey: "secret-ai-key", model: "m" }, fetcher).decide([])).rejects.toThrow(/401/);
    await expect(createAi({ baseUrl: "https://ai.example.com/v1", apiKey: "secret-ai-key", model: "m" }, fetcher).decide([])).rejects.not.toThrow(/secret-ai-key/);
  });
});

describe("staff messages", () => {
  it("summarizes a new request in English with the client's text as written", () => {
    expect(staffMessage({ type: "new_request", requestNumber: 12, adults: 2, children: 1, address: "حولي، شارع 5", date: "2026-10-25", window: "4–6 pm" }, "+96550000001")).toBe([
      "New WhatsApp request #12", "Client: +96550000001", "Adults: 2", "Children: 1", "Address: حولي، شارع 5", "Date: 2026-10-25", "Time window: 4–6 pm",
    ].join("\n"));
  });
  it("names the earlier request in an update", () => {
    expect(staffMessage({ type: "update_request", requestNumber: 12, change: "Cancel the visit" }, "+96550000001")).toBe(["Update to WhatsApp request #12", "Client: +96550000001", "Change: Cancel the visit"].join("\n"));
  });
  it("forwards anything else for staff to handle", () => {
    expect(staffMessage({ type: "forward", summary: "Asks whether the visit is confirmed" }, "+96550000001")).toBe(["WhatsApp message for staff", "Client: +96550000001", "Asks whether the visit is confirmed"].join("\n"));
  });
});

describe("AI failure alert", () => {
  it("tells staff who got no reply, why, and what the client wrote", () => {
    expect(aiFailureMessage("+96550000001", "the AI account has no credit", ["أبي موعد", "بكرة"])).toBe([
      "WhatsApp AI could not answer", "Client: +96550000001", "Reason: the AI account has no credit", "The client got no reply. Please contact them.", "Client's messages:", "أبي موعد", "بكرة",
    ].join("\n"));
  });
});

describe("technical prompt", () => {
  it("states today's Kuwait date, the answer shape, and only this client's earlier requests", () => {
    const prompt = technicalPrompt(new Date("2026-10-24T22:30:00.000Z"), [{ number: 12, details: { adults: 2, children: 1, address: "حولي", date: "2026-10-25", window: "4–6 pm" } }]);
    expect(prompt).toContain("2026-10-25");
    expect(prompt).toContain("#12");
    expect(prompt).toContain("\"new_request\"");
    expect(prompt).toContain("\"update_request\"");
    expect(prompt).toContain("\"forward\"");
  });
  it("requires an action whenever the reply promises a person, and dates its example from tomorrow in Kuwait", () => {
    const prompt = technicalPrompt(new Date("2026-10-24T22:30:00.000Z"), []);
    expect(prompt).toContain("\"action\" MUST NOT be null");
    expect(prompt).toContain("\"date\": \"2026-10-26\"");
  });
});

describe("owner prompt", () => {
  it("is read from the prompt file, which ships with the API package", () => {
    expect(readOwnerPrompt().length).toBeGreaterThan(0);
    expect(apiPackage.files).toContain("prompts");
  });
});
