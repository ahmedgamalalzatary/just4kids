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

/** The fixed part appended to the owner's prompt: today's date, this client's earlier requests, and the answer shape the code acts on. */
export function technicalPrompt(now: Date, requests: { number: number; details: WhatsAppRequestDetails }[]) {
  // Kuwait is UTC+3 all year.
  const kuwait = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const today = `${kuwait.toISOString().slice(0, 10)} (${kuwait.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })})`;
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
Otherwise "action" is null.`;
}
