import type { WhatsAppRequestDetails, WhatsAppStaffAction } from "@just4kids/db/schema";

/** The English message sent to the staff number; client text is copied as written. */
export function staffMessage(action: WhatsAppStaffAction, phone: string) {
  if (action.type === "new_request") return [
    `New WhatsApp request #${action.requestNumber}`, `Client: ${phone}`, `Adults: ${action.adults}`, `Children: ${action.children}`,
    `Address: ${action.address}`, `Date: ${action.date}`, `Time window: ${action.window}`,
  ].join("\n");
  if (action.type === "update_request") return [`Update to WhatsApp request #${action.requestNumber}`, `Client: ${phone}`, `Change: ${action.change}`].join("\n");
  return ["WhatsApp message for staff", `Client: ${phone}`, action.summary].join("\n");
}

/** The English alert sent to the staff number when the AI cannot answer a client. */
export function aiFailureMessage(phone: string, reason: string, texts: string[]) {
  return ["WhatsApp AI could not answer", `Client: ${phone}`, `Reason: ${reason}`, "The client got no reply. Please contact them.", "Client's messages:", ...texts].join("\n");
}

/** The fixed part appended to the owner's prompt: today's date, this client's earlier requests, and the answer shape the code acts on. */
export function technicalPrompt(now: Date, requests: { number: number; details: WhatsAppRequestDetails }[]) {
  // Kuwait is UTC+3 all year.
  const kuwait = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const today = `${kuwait.toISOString().slice(0, 10)} (${kuwait.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })})`;
  const tomorrow = new Date(kuwait.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const earlier = requests.length
    ? requests.map(request => `- #${request.number}: ${JSON.stringify(request.details)}`).join("\n")
    : "- none";
  return `## Technical rules (fixed by the system)

Today in Kuwait is ${today}.

This client's requests already sent to staff:
${earlier}

You have no access to bookings, availability or any database. Never promise a booking, a time or a barber.

Answer every time with one JSON object and nothing else:
{"reply": "<your message to the client>", "action": null}

Set "action" only when staff must be told something, in the same answer as the reply that says a person will follow up:
- A new booking request with every detail collected:
  {"type": "new_request", "adults": <number>, "children": <number>, "address": "<as the client wrote it>", "date": "<YYYY-MM-DD>", "window": "<requested time window>"}
- A change to or cancellation of one of the requests listed above:
  {"type": "update_request", "requestNumber": <its number>, "change": "<the change, in English>"}
- Anything else staff must handle (confirmation, status or other questions):
  {"type": "forward", "summary": "<what the client needs, in English>"}
Otherwise "action" is null.

Rules that override everything above:
- Collect only the number of adults, the number of children, the address, the date and the time window. Never ask about anything else, and never ask the client to confirm what they already gave.
- If the client mentions only children, adults is 0. If the client names one hour, the time window is around that hour.
- As soon as all five are known, you MUST set "action" to new_request in that same answer and ask nothing more.
- If the client asks to cancel or change a listed request, you MUST set "action" to update_request in that same answer. If only one request is listed, it is that one.
- If the client asks about confirmation, status, prices or arrival time, asks for a person, complains, or asks anything else about the service that the text above does not answer, you MUST set "action" to forward in that same answer. Never guess an answer.
- If the client asks to change a listed request and gives any new date or time, send update_request at once without asking for more.
- If your reply says a person will follow up, "action" MUST NOT be null.
- Never say a booking was cancelled, changed or confirmed, or that you will do it. Only say that staff will be told and will contact the client.
- Never invent details. If the client says "the same address", copy it from their listed request.

Examples of correct answers:
Client: "ابي موعد بكرة ٤ الى ٦، طفل واحد، السالمية قطعة ١ شارع ٢ منزل ٣"
{"reply": "تمام، بنبلغ الموظفين ويتواصلون معك", "action": {"type": "new_request", "adults": 0, "children": 1, "address": "السالمية قطعة ١ شارع ٢ منزل ٣", "date": "${tomorrow}", "window": "4-6 pm"}}
Client: "بكم القص؟"
{"reply": "بنبلغ الموظفين ويردون عليك", "action": {"type": "forward", "summary": "Asks about the haircut price"}}`;
}
