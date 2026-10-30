import type { WhatsAppRequestDetails } from "@just4kids/db/schema";
import { NOT_PROVIDED, type StaffNotice } from "./flow.js";

const STAFF_HELP = "Commands:\nyes 12 — approve request 12\nyes 12 Lenny — approve and choose the barber\nno 12 reason — reject request 12\nai on +96550000000 — the AI answers that client again";

function requestLines(details: WhatsAppRequestDetails) {
  const { address } = details;
  const parts: [string, string | null][] = [["Block", address.block], ["Street", address.street], ["House", address.houseNumber], ["Building", address.buildingName], ["Avenue", address.avenue], ["Floor", address.floor], ["Apartment", address.apartment]];
  const typed = parts.filter(([, value]) => value && value !== NOT_PROVIDED).map(([label, value]) => `${label} ${value}`).join(", ");
  return [
    `Adults: ${details.adults}`, `Children: ${details.children}`, ...(details.specialChildren ? [`Special needs: ${details.specialChildren}`] : []),
    `Barber: ${details.barberName ?? "Any barber (staff choose)"}`, `Date: ${details.date}`, `Time: ${details.startTime} - ${details.endTime}`,
    `Area: ${details.area}`, ...(typed ? [`Address: ${typed}`] : []), ...(address.mapsUrl ? [`Location: ${address.mapsUrl}`] : []),
  ];
}

/** The English message sent to the staff number; client text is copied as written. */
export function staffMessage(notice: StaffNotice, phone: string, requestNumber: number | null, earlierRequests: number[] = []) {
  if (notice.type === "new_request") {
    const approve = notice.details.barberId ? `yes ${requestNumber}` : `yes ${requestNumber} <barber name>`;
    return [`New WhatsApp request #${requestNumber}`, `Client: ${phone}`, ...requestLines(notice.details), "", `Approve: ${approve}`, `Reject: no ${requestNumber} <reason>`, "Or create it in the dashboard, then reject it here."].join("\n");
  }
  if (notice.type === "change") return ["Client wants to change or cancel", `Client: ${phone}`, ...(earlierRequests.length ? [`Requests: ${earlierRequests.map(number => `#${number}`).join(", ")}`] : []), `Message: ${notice.text}`].join("\n");
  if (notice.type === "talk") return ["Client wants to talk to staff", `Client: ${phone}`, "Reply from the business phone; the AI stops for this client."].join("\n");
  return ["WhatsApp message for staff", `Client: ${phone}`, notice.summary].join("\n");
}

/** The English alert sent to the staff number when the AI cannot answer a client. */
export function aiFailureMessage(phone: string, reason: string, texts: string[]) {
  return ["WhatsApp AI could not answer", `Client: ${phone}`, `Reason: ${reason}`, "The client got no reply. Please contact them.", "Client's messages:", ...texts].join("\n");
}

export type StaffCommand = { type: "approve"; number: number; barber: string | null } | { type: "reject"; number: number; reason: string | null } | { type: "resume"; phone: string } | { type: "help" };

/** Reads a message from the staff number. */
export function parseStaffCommand(raw: string): StaffCommand {
  const text = raw.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).trim();
  const decision = /^(yes|no)\s+#?(\d+)(?:\s+([\s\S]+))?$/i.exec(text);
  if (decision) {
    const number = Number(decision[2]), rest = decision[3]?.trim() || null;
    return decision[1]!.toLowerCase() === "yes" ? { type: "approve", number, barber: rest } : { type: "reject", number, reason: rest };
  }
  const resume = /^ai\s+on\s+\+?(\d{8,15})$/i.exec(text);
  return resume ? { type: "resume", phone: `+${resume[1]}` } : { type: "help" };
}
export const staffHelp = () => STAFF_HELP;
