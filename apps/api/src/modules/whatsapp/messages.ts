import type { WhatsAppRequestDetails, WhatsAppWho } from "@just4kids/db/schema";
import { NOT_PROVIDED, type StaffNotice } from "./flow.js";

const STAFF_HELP = "Commands:\nyes 12 — approve request 12\nyes 12 Lenny — approve and choose the barber\nno 12 reason — reject request 12\nai on +96550000000 — the AI answers that client again";

const WHO_LABELS: Record<WhatsAppWho, string> = { boy: "ولد", girl: "بنت", baby: "رضيع", special: "ذوو احتياجات خاصة", both: "ولد وبنت", adults: "كبار", family: "كبار وأطفال" };

function requestLines(details: WhatsAppRequestDetails) {
  const { address } = details;
  const parts: [string, string | null][] = [["قطعة", address.block], ["شارع", address.street], ["منزل", address.houseNumber], ["بناية", address.buildingName], ["جادة", address.avenue], ["دور", address.floor], ["شقة", address.apartment]];
  const typed = parts.filter(([, value]) => value && value !== NOT_PROVIDED).map(([label, value]) => `${label} ${value}`).join("، ");
  return [
    ...(details.who ? [`لمن: ${WHO_LABELS[details.who]}`] : []), `الكبار: ${details.adults}`, `الأطفال: ${details.children}`, ...(details.specialChildren ? [`ذوو احتياجات خاصة: ${details.specialChildren}`] : []),
    `الحلاق: ${details.barberName ?? "أي حلاق (يختار الموظف)"}`, `التاريخ: ${details.date}`, `الوقت: ${details.startTime} - ${details.endTime}`,
    `المنطقة: ${details.area}`, ...(typed ? [`العنوان: ${typed}`] : []), ...(address.mapsUrl ? [`الموقع: ${address.mapsUrl}`] : []),
  ];
}

/** The message sent to the staff number: a reservation request uses the Arabic template, the rest is English; client text is copied as written. */
export function staffMessage(notice: StaffNotice, phone: string, requestNumber: number | null, earlierRequests: number[] = []) {
  if (notice.type === "new_request") {
    const approve = notice.details.barberId ? `yes ${requestNumber}` : `yes ${requestNumber} <اسم الحلاق>`;
    return [`طلب حجز جديد من واتساب #${requestNumber}`, `العميل: ${phone}`, ...requestLines(notice.details), "", `للموافقة: ${approve}`, `للرفض: no ${requestNumber} <السبب>`, "أو أنشئ الحجز من لوحة التحكم، ثم ارفض الطلب هنا."].join("\n");
  }
  if (notice.type === "change") return ["Client wants to change or cancel", `Client: ${phone}`, ...(earlierRequests.length ? [`Requests: ${earlierRequests.map(number => `#${number}`).join(", ")}`] : []), `Message: ${notice.text}`].join("\n");
  if (notice.type === "talk") return ["Client wants to talk to an employee", `Client: ${phone}`, `The AI is stopped for this client. To turn it back on: ai on ${phone}`].join("\n");
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
