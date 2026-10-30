import { z } from "zod";
import type { WhatsAppSettings } from "../../configs/env.js";

export const interpretationSchema = z.object({
  // The text sent to the client before the menu is repeated; empty when the message answered the step.
  reply: z.string().trim().max(2000).default(""),
  // What the message answers for the current step; the flow validates it.
  value: z.record(z.string(), z.unknown()).nullish(),
  // A summary for staff when the client needs a person.
  forward: z.string().trim().min(1).max(1000).nullish(),
});
export type Interpretation = z.infer<typeof interpretationSchema>;
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// Enough for the longest allowed reply; also caps the cost of one runaway answer.
const MAX_ANSWER_TOKENS = 2000;
// Low, so the model follows the answer rules consistently.
const TEMPERATURE = 0.3;
// Answers a retry cannot fix; the reason is shown to staff.
const refusals: Record<number, string> = {
  400: "the AI rejected the request",
  401: "the AI key was rejected",
  402: "the AI account has no credit",
  403: "the AI key or region was blocked",
  404: "the AI address or model was not found",
  421: "the AI's content filter blocked the message",
};
export class AiRefusedError extends Error {
  constructor(status: number, readonly reason: string) {
    super(`AI provider answered ${status}`);
  }
}

/** Reads the model's JSON answer; some providers wrap it in a Markdown code fence. */
export function parseInterpretation(content: string): Interpretation {
  const unfenced = content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");
  return interpretationSchema.parse(JSON.parse(unfenced));
}

/** Any provider with an OpenAI-compatible Chat Completions API. The model gets no tools; the code acts on its answer. */
export function createAi(settings: WhatsAppSettings["ai"], fetcher: typeof fetch = fetch) {
  return {
    async interpret(messages: ChatMessage[]): Promise<Interpretation> {
      const response = await fetcher(`${settings.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: settings.model, messages, response_format: { type: "json_object" }, max_completion_tokens: MAX_ANSWER_TOKENS, temperature: TEMPERATURE, ...(settings.thinking && { thinking: { type: settings.thinking } }) }),
        signal: AbortSignal.timeout(60_000),
      });
      const refusal = refusals[response.status];
      if (refusal) throw new AiRefusedError(response.status, refusal);
      if (!response.ok) throw new Error(`AI provider answered ${response.status}`);
      const body = await response.json() as { choices?: { message?: { content?: unknown } }[] };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("AI provider returned no message");
      return parseInterpretation(content);
    },
  };
}
export type Ai = ReturnType<typeof createAi>;
