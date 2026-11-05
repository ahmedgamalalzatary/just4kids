import type { WhatsAppAddress, WhatsAppRequestDetails, WhatsAppWho } from "@just4kids/db/schema";
import { extraNote, NOT_PROVIDED, type StaffNotice } from "./flow.js";

const ADDRESS_FORMAT = "address 12 block 3, street 5, house 10, https://maps.app.goo.gl/...";
const STAFF_HELP = `Commands:\nyes 12 — approve request 12\nyes 12 Lenny — approve and choose the barber\nno 12 reason — reject request 12\n${ADDRESS_FORMAT} — change the address of request 12 before approving it\nai on +96550000000 — the AI answers that client again`;
export const addressHelp = () => `Write the parts to change, separated by commas, for example:\n${ADDRESS_FORMAT}\nParts: area, block, street, house, building, avenue, floor, apartment, and a Google Maps link. Arabic names work too (منطقة، قطعة، شارع، منزل، بناية، جادة، دور، شقة). Parts you leave out stay as they are.`;

const WHO_LABELS: Record<WhatsAppWho, string> = { boy: "ولد", girl: "بنت", baby: "رضيع", special: "ذوو احتياجات خاصة", both: "ولد وبنت", medical: "خدمة حالة مرضية", adults: "كبار", family: "كبار وأطفال" };

function requestLines(details: WhatsAppRequestDetails) {
  const { address } = details;
  const parts: [string, string | null][] = [["قطعة", address.block], ["شارع", address.street], ["منزل", address.houseNumber], ["بناية", address.buildingName], ["جادة", address.avenue], ["دور", address.floor], ["شقة", address.apartment]];
  const typed = parts.filter(([, value]) => value && value !== NOT_PROVIDED).map(([label, value]) => `${label} ${value}`).join("، ");
  return [
    ...(details.who ? [`لمن: ${WHO_LABELS[details.who]}`] : []), `الكبار: ${details.adults}`, `الأطفال: ${details.children}`, ...(details.specialChildren ? [`ذوو احتياجات خاصة: ${details.specialChildren}`] : []),
    `الحلاق: ${details.barberName ?? "أي حلاق (يختار الموظف)"}`, `التاريخ: ${details.date}`, `الوقت: ${details.startTime} - ${details.endTime}`, ...(details.extra ? [extraNote(details.extra)] : []),
    ...(details.extraHourBusy ? ["⚠️ الحلاق غير متاح في ساعة الخدمة الإضافية. تواصل مع العميل وأنشئ الحجز يدوياً من لوحة التحكم."] : []),
    `المنطقة: ${details.area}`, ...(typed ? [`العنوان: ${typed}`] : []), ...(address.mapsUrl ? [`الموقع: ${address.mapsUrl}`] : []),
  ];
}

/** The message sent to the staff number: a reservation request uses the Arabic template, the rest is English; client text is copied as written. */
export function staffMessage(notice: StaffNotice, phone: string, requestNumber: number | null, earlierRequests: number[] = []) {
  if (notice.type === "new_request") {
    const approve = notice.details.barberId ? `yes ${requestNumber}` : `yes ${requestNumber} <اسم الحلاق>`;
    return [`طلب حجز جديد من واتساب #${requestNumber}`, `العميل: ${phone}`, ...requestLines(notice.details), "", `للموافقة: ${approve}`, `للرفض: no ${requestNumber} <السبب>`, `لتعديل العنوان: address ${requestNumber} قطعة 3، شارع 5، منزل 10، <رابط الخرائط>`, "أو أنشئ الحجز من لوحة التحكم، ثم ارفض الطلب هنا."].join("\n");
  }
  if (notice.type === "change") return ["Client wants to change or cancel", `Client: ${phone}`, ...(earlierRequests.length ? [`Requests: ${earlierRequests.map(number => `#${number}`).join(", ")}`] : []), `Message: ${notice.text}`].join("\n");
  if (notice.type === "talk") return ["Client wants to talk to an employee", `Client: ${phone}`, `The AI is stopped for this client. To turn it back on: ai on ${phone}`].join("\n");
  return ["WhatsApp message for staff", `Client: ${phone}`, notice.summary].join("\n");
}

/** The English alert sent to the staff number when the AI cannot answer a client. */
export function aiFailureMessage(phone: string, reason: string, texts: string[]) {
  return ["WhatsApp AI could not answer", `Client: ${phone}`, `Reason: ${reason}`, "The client got no reply. Please contact them.", "Client's messages:", ...texts].join("\n");
}

export type StaffCommand = { type: "approve"; number: number; barber: string | null } | { type: "reject"; number: number; reason: string | null } | { type: "address"; number: number; text: string } | { type: "resume"; phone: string } | { type: "help" };

type AddressPart = Exclude<keyof WhatsAppAddress, "mapsUrl"> | "area";
const ADDRESS_LABELS: Record<string, AddressPart> = {
  area: "area", "منطقة": "area", "المنطقة": "area", block: "block", "قطعة": "block", "القطعة": "block", street: "street", "شارع": "street", "الشارع": "street",
  house: "houseNumber", "منزل": "houseNumber", "المنزل": "houseNumber", "بيت": "houseNumber", building: "buildingName", "بناية": "buildingName", "البناية": "buildingName", "عمارة": "buildingName",
  avenue: "avenue", "جادة": "avenue", "الجادة": "avenue", floor: "floor", "دور": "floor", "الدور": "floor", "طابق": "floor", apartment: "apartment", flat: "apartment", "شقة": "apartment", "الشقة": "apartment",
};
/** Reads the parts of an "address" command; null when a part has no known name. */
export function parseStaffAddress(text: string): { parts: Partial<Record<AddressPart, string>>; mapsUrl: string | null } | null {
  const parts: Partial<Record<AddressPart, string>> = {};
  // A Google Maps link can hold commas, so it is taken out before the parts are split.
  const links = text.match(/https?:\/\/\S+/gi) ?? [];
  if (links.length > 1) return null;
  const mapsUrl = links[0] ?? null;
  for (const piece of (mapsUrl ? text.replace(mapsUrl, "") : text).split(/[,،\n]+/).map(item => item.trim()).filter(Boolean)) {
    const named = /^(\S+)\s*:?\s*(.+)$/.exec(piece);
    const part = named ? ADDRESS_LABELS[named[1]!.replace(/:$/, "").toLowerCase()] : undefined;
    if (!part) return null;
    parts[part] = named![2]!.trim();
  }
  return Object.keys(parts).length || mapsUrl ? { parts, mapsUrl } : null;
}

/** Reads a message from the staff number. */
export function parseStaffCommand(raw: string): StaffCommand {
  const text = raw.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).trim();
  const address = /^(?:address|عنوان)\s+#?(\d+)\s+([\s\S]+)$/i.exec(text);
  if (address) return { type: "address", number: Number(address[1]), text: address[2]!.trim() };
  const decision = /^(yes|no)\s+#?(\d+)(?:\s+([\s\S]+))?$/i.exec(text);
  if (decision) {
    const number = Number(decision[2]), rest = decision[3]?.trim() || null;
    return decision[1]!.toLowerCase() === "yes" ? { type: "approve", number, barber: rest } : { type: "reject", number, reason: rest };
  }
  const resume = /^ai\s+on\s+\+?(\d{8,15})$/i.exec(text);
  return resume ? { type: "resume", phone: `+${resume[1]}` } : { type: "help" };
}
export const staffHelp = () => STAFF_HELP;
