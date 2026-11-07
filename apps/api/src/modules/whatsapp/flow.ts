import { z } from "zod";
import { ADDRESS_NOT_PROVIDED, addressCreateSchema } from "@just4kids/contracts";
import type { WhatsAppAddress, WhatsAppExtra, WhatsAppFlow, WhatsAppFlowStep, WhatsAppHospital, WhatsAppMedia, WhatsAppRequestDetails, WhatsAppWho } from "@just4kids/db/schema";
import type { Interpretation } from "./ai.js";
import { addressText, homeLabels, hospitalLabels, parseLabeledParts } from "./address-input.js";

// Shown in the reservation when the client sent only a location link; staff can complete it in the dashboard.
export const NOT_PROVIDED = ADDRESS_NOT_PROVIDED;
// A client silent for longer than this starts again from the language list; an unconfirmed request is dropped.
export const IDLE_RESET_MS = 15 * 60_000;
const SALON_LOCATION ="https://maps.google.com/maps?q=29.086143493652344%2C48.121238708496094&z=17&hl=en";

// free: each barber's free whole hours by date, for the days in bookingDays.
export type FlowContext = { barbers: { id: string; name: string; nameAr?: string | null }[]; areas: { id: string; name: string }[]; now: Date; free: Record<string, Record<string, string[]>> };
export type StaffNotice =
  | { type: "new_request"; details: WhatsAppRequestDetails }
  | { type: "change"; text: string }
  | { type: "forward"; summary: string }
  | { type: "talk" };
// image: the price list photo and its caption, sent before the reply. pause: the AI stops for this client until staff send "ai on".
export type Turn = { state: WhatsAppFlow; reply: string; staff?: StaffNotice; image?: { media: WhatsAppMedia; caption: string }; pause?: true };
type Language = "en" | "ar";

const copy = {
  en: {
    back: "Back to the previous step", languageSet: "✅ Language: English",
    menu: "✂️ *J4Kids Salon* — how can we help?", book: "Book an appointment", change: "Cancel or change a request", talk: "Talk to an employee", salonService: "Salon service", homePrices: "Home service price list", salonLocation: "Salon location", pick: "Send a number to choose.",
    who: "👶 Who is this for?", whoOptions: ["Boy", "Girl", "Baby", "Special needs", "Both (Girl & Boy)", "Medical condition service"],
    adults: "🔢 How many adults?", children: "🔢 How many kids?", barber: "💈 Which barber do you choose?", any: "Any barber", date: "📅 Preferred date:",
    time: (date: string) => `⏰ Available start times on ${date}:`,
    am: "am", pm: "pm", noon: "pm",
    noTimes: "⚠️ This barber has no free times in the next 7 days. Please choose another barber.", taken: "⚠️ That time is no longer free. Please choose again.",
    extra: "💅 Any extra service? It adds one hour to the visit.", noExtra: "No service", extraLine: "💅 Extra service:",
    visitType: "🏠 Is this visit at home or in a hospital?", home: "Home", hospital: "Hospital",
    area: "📍 Which area in Kuwait?", areaInvalid: "⚠️ We could not find that area in Kuwait. Please send the area name again.",
    address: "📍 Please write your address (block, street, house or building) or send your location as a Google Maps link.",
    addressInvalid: "⚠️ Please write the block, street and house or building.",
    hospitalAddress: "📍 Please send the hospital location: wing, floor, and room, or send a Google Maps link.",
    hospitalInvalid: "⚠️ Please send the hospital wing, floor, and room, or a Google Maps link.",
    linkInvalid: "⚠️ That is not a Google Maps link. Please send your location from Google Maps.",
    confirmHead: "Please confirm your request:", service: "✂️ Hair Cut — Home Service", hospitalService: "✂️ Hair Cut — Hospital Service",
    forLine: (adults: number, children: number) => `👶 Adults: ${adults} · Kids: ${children}`, barberLine: "💈 Barber:", addressLine: "📍 Address:", locationLine: "📍 Location:",
    hospitalLine: "🏥 Hospital location:", hospitalParts: (hospital: WhatsAppHospital) => `Wing ${hospital.wing}, Floor ${hospital.floor}, Room ${hospital.room}`,
    requestNote: "This is a request — our team will confirm the exact time.", confirm: "Confirm ✅", startOver: "Start over ❌",
    sent: "✅ Your request was sent to our team. They will contact you to confirm.",
    changeAsk: "✏️ What would you like to change or cancel? Send it in one message.", changeSent: "✅ We sent this to our team. They will contact you.", talkSent: "✅ We told our team. An employee will contact you soon.",
    invalid: "⚠️ Please send one of the numbers above.", countInvalid: "⚠️ Please send a number from 1 to 50.",
    approved: (date: string, time: string, barber: string) => `✅ Your reservation is confirmed.\n📅 ${date} · ${time}\n💈 Barber: ${barber}`,
    rejected: (reason: string | null) => `❌ We could not confirm your request.${reason ? `\n${reason}` : ""}\nA staff member will contact you if needed.`,
  },
  ar: {
    back: "الرجوع للخطوة السابقة", languageSet: "✅ اللغة: العربية",
    menu: "✂️ *صالون J4Kids* — كيف يمكننا مساعدتك؟", book: "حجز موعد", change: "إلغاء أو تعديل طلب", talk: "التحدث مع موظف", salonService: "خدمة الصالون", homePrices: "قائمة أسعار الخدمة المنزلية", salonLocation: "موقع الصالون", pick: "أرسل رقماً للاختيار.",
    who: "👶 لمن الحجز؟", whoOptions: ["ولد", "بنت", "رضيع", "ذوو احتياجات خاصة", "ولد وبنت", "خدمة حالة مرضية"],
    adults: "🔢 كم عدد الكبار؟", children: "🔢 كم عدد الأطفال؟", barber: "💈 أي حلاق تختار؟", any: "أي حلاق", date: "📅 التاريخ المفضل:",
    time: (date: string) => `⏰ أوقات البدء المتاحة يوم ${date}:`,
    am: "صباحاً", pm: "مساءً", noon: "ظهراً",
    noTimes: "⚠️ لا توجد أوقات متاحة لهذا الحلاق خلال الأيام السبعة القادمة. اختر حلاقاً آخر.", taken: "⚠️ هذا الوقت لم يعد متاحاً. اختر مرة أخرى.",
    extra: "💅 هل تريد خدمة إضافية؟ تضيف ساعة إلى مدة الزيارة.", noExtra: "بدون خدمة", extraLine: "💅 خدمة إضافية:",
    visitType: "🏠 هل الزيارة في المنزل أم في المستشفى؟", home: "المنزل", hospital: "المستشفى",
    area: "📍 في أي منطقة في الكويت؟", areaInvalid: "⚠️ لم نجد هذه المنطقة في الكويت. أرسل اسم المنطقة مرة أخرى.",
    address: "📍 اكتب عنوانك (القطعة، الشارع، المنزل أو البناية) أو أرسل موقعك كرابط خرائط Google.",
    addressInvalid: "⚠️ اكتب القطعة والشارع والمنزل أو البناية.",
    hospitalAddress: "📍 أرسل موقع المستشفى: الجناح، الدور، والغرفة، أو أرسل رابط خرائط Google.",
    hospitalInvalid: "⚠️ أرسل جناح المستشفى والدور والغرفة، أو أرسل رابط خرائط Google.",
    linkInvalid: "⚠️ هذا ليس رابط خرائط Google. أرسل موقعك من خرائط Google.",
    confirmHead: "يرجى تأكيد طلبك:", service: "✂️ قص شعر — خدمة منزلية", hospitalService: "✂️ قص شعر — خدمة مستشفى",
    forLine: (adults: number, children: number) => `👶 الكبار: ${adults} · الأطفال: ${children}`, barberLine: "💈 الحلاق:", addressLine: "📍 العنوان:", locationLine: "📍 الموقع:",
    hospitalLine: "🏥 موقع المستشفى:", hospitalParts: (hospital: WhatsAppHospital) => `جناح ${hospital.wing}، دور ${hospital.floor}، غرفة ${hospital.room}`,
    requestNote: "هذا طلب — سيؤكد فريقنا الوقت المحدد.", confirm: "تأكيد ✅", startOver: "البدء من جديد ❌",
    sent: "✅ تم إرسال طلبك إلى فريقنا. سيتواصلون معك للتأكيد.",
    changeAsk: "✏️ ما الذي تريد تعديله أو إلغاءه؟ أرسله في رسالة واحدة.", changeSent: "✅ أرسلنا هذا إلى فريقنا. سيتواصلون معك.", talkSent: "✅ أبلغنا فريقنا. سيتواصل معك موظف قريباً.",
    invalid: "⚠️ أرسل أحد الأرقام أعلاه.", countInvalid: "⚠️ أرسل رقماً من 1 إلى 50.",
    approved: (date: string, time: string, barber: string) => `✅ تم تأكيد حجزك.\n📅 ${date} · ${time}\n💈 الحلاق: ${barber}`,
    rejected: (reason: string | null) => `❌ لم نتمكن من تأكيد طلبك.${reason ? `\n${reason}` : ""}\nسيتواصل معك موظف عند الحاجة.`,
  },
} as const;

const whoValues: WhatsAppWho[] = ["boy", "girl", "baby", "special", "both", "medical"];
const extraLabels: Record<WhatsAppExtra, Record<Language, string>> = {
  manicure_pedicure: { en: "Manicure + Pedicure", ar: "مانيكير + باديكير" }, manicure: { en: "Manicure only", ar: "مانيكير فقط" }, pedicure: { en: "Pedicure only", ar: "باديكير فقط" },
  hair_wash: { en: "Hair wash only", ar: "غسيل شعر فقط" }, hair_wash_treatment: { en: "Hair wash with treatment", ar: "غسيل شعر مع علاج" },
  blow_dry_styling: { en: "Blow-dry with styling", ar: "استشوار مع تسريحة" }, wavy_hair: { en: "Wavy hair", ar: "شعر ويفي" },
};
// The extra services offered, in order.
const extraValues: WhatsAppExtra[] = ["manicure_pedicure", "manicure", "pedicure", "hair_wash_treatment", "blow_dry_styling", "wavy_hair"];
const extraLabel = (extra: WhatsAppExtra, language: Language) => extraLabels[extra][language];
/** A barber's name in the chat's language; an Arabic chat falls back to the English name. */
export const barberName = (barber: { name: string; nameAr?: string | null }, language: Language | null) => (language ?? "ar") === "ar" ? barber.nameAr || barber.name : barber.name;
/** The line on the staff message and the reservation's note; staff read Arabic. */
export const extraNote = (extra: WhatsAppExtra) => `خدمة إضافية: ${extraLabel(extra, "ar")}`;
const numbered = (options: readonly string[]) => options.map((option, index) => `${index + 1}. ${option}`).join("\n");
const westernDigits = (text: string) => text.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
const kuwaitDate = (now: Date, offset = 0) => new Date(now.getTime() + 3 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
export const bookingDays = (now: Date) => Array.from({ length: 7 }, (_, offset) => kuwaitDate(now, offset));
const dateLabel = (date: string, language: Language) => new Date(`${date}T12:00:00.000Z`).toLocaleDateString(language === "ar" ? "ar-KW" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const hourOf = (time: string) => Number(time.slice(0, 2));
const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
function hourLabel(time: string, language: Language) {
  const hour = hourOf(time), text = copy[language];
  return `${hour % 12 || 12} ${hour === 12 ? text.noon : hour < 12 ? text.am : text.pm}`;
}
const barberFree = (state: WhatsAppFlow, context: FlowContext) => context.free[state.barber?.id ?? ""] ?? {};
/** The barber's free hours of a date, without those already past. */
const freeStarts = (state: WhatsAppFlow, context: FlowContext, date: string) => (barberFree(state, context)[date] ?? []).filter(time => new Date(`${date}T${time}:00+03:00`).getTime() > context.now.getTime());
const openDates = (state: WhatsAppFlow, context: FlowContext) => bookingDays(context.now).filter(date => freeStarts(state, context, date).length);
/** The current choices of a list that depends on the barber's free time. */
function freshChoices(state: WhatsAppFlow, context: FlowContext) {
  if (state.step === "date") return openDates(state, context);
  if (state.step === "time") return freeStarts(state, context, state.date!);
  return undefined;
}

export function clientApproved(language: Language | null, details: { date: string; startTime: string; endTime: string }, barber: string) {
  const text = copy[language ?? "ar"];
  return text.approved(dateLabel(details.date, language ?? "ar"), `${details.startTime} - ${details.endTime}`, barber);
}
export function clientRejected(language: Language | null, reason: string | null) { return copy[language ?? "ar"].rejected(reason); }

/** The options of a numbered step, in the order the client sees them. */
function options(state: WhatsAppFlow, context: FlowContext, language: Language): readonly string[] {
  const text = copy[language];
  if (state.step === "language") return state.language ? ["English", "العربية", text.back] : ["English", "العربية"];
  if (state.step === "menu") return [text.book, text.homePrices, text.salonService, text.talk, text.change, text.back];
  if (state.step === "who") return [...text.whoOptions, text.back];
  if (state.step === "barber") return [...context.barbers.map(barber => barberName(barber, language)), text.back];
  const choices = state.offered ?? freshChoices(state, context) ?? [];
  if (state.step === "date") return [...choices.map(date => dateLabel(date, language)), text.back];
  if (state.step === "time") return [...choices.map(time => hourLabel(time, language)), text.back];
  if (state.step === "extra") return [...extraValues.map(extra => extraLabel(extra, language)), text.noExtra, text.back];
  if (state.step === "visitType") return [text.home, text.hospital, text.back];
  if (state.step === "confirm") return [text.confirm, text.startOver, text.back];
  return [];
}

function summary(state: WhatsAppFlow, context: FlowContext, language: Language) {
  const text = copy[language], address = state.address!;
  const hospital = state.visitType === "hospital";
  const typed = addressText(address, language);
  const location = hospital
    ? `${text.hospitalLine} ${[state.area!.name, state.hospital ? text.hospitalParts(state.hospital) : null].filter(Boolean).join(", ")}`
    : `${text.addressLine} ${[state.area!.name, typed].filter(Boolean).join(", ")}`;
  return [
    text.confirmHead, "", hospital ? text.hospitalService : text.service, text.forLine(state.adults ?? 0, state.children ?? 0),
    `${text.barberLine} ${state.barber ? barberName(state.barber, language) : text.any}`,
    `📅 ${dateLabel(state.date!, language)} · ${state.startTime} - ${state.endTime}`,
    ...(state.extra ? [`${text.extraLine} ${extraLabel(state.extra, language)}`] : []),
    location,
    ...(address.mapsUrl ? [`${text.locationLine} ${address.mapsUrl}`] : []),
    "", text.requestNote, "", numbered(options(state, context, language)),
  ].join("\n");
}

/** The exact text of a step; menus are always sent word for word. */
export function render(state: WhatsAppFlow, context: FlowContext) {
  const language = state.language ?? "ar", text = copy[language];
  switch (state.step) {
    case "language": return `👋 Welcome to *J4Kids Salon*!\nأهلاً بك في *صالون J4Kids*!\n\nSelect your language / اختر اللغة:\n\n${numbered(options(state, context, language))}`;
    case "menu": return `${text.menu}\n\n${numbered(options(state, context, language))}\n\n${text.pick}`;
    case "who": return `${text.who}\n\n${numbered(options(state, context, language))}`;
    case "adults": return text.adults;
    case "children": return text.children;
    case "barber": return `${text.barber}\n\n${numbered(options(state, context, language))}`;
    case "date": return `${text.date}\n\n${numbered(options(state, context, language))}`;
    case "time": return `${text.time(dateLabel(state.date!, language))}\n\n${numbered(options(state, context, language))}`;
    case "extra": return `${text.extra}\n\n${numbered(options(state, context, language))}`;
    case "visitType": return `${text.visitType}\n\n${numbered(options(state, context, language))}`;
    case "area": return text.area;
    case "address": return state.visitType === "hospital" ? text.hospitalAddress : text.address;
    case "confirm": return summary(state, context, language);
    case "change": return text.changeAsk;
  }
}

function move(state: WhatsAppFlow, step: WhatsAppFlowStep, context: FlowContext, prefix?: string, staff?: StaffNotice): Turn {
  const next: WhatsAppFlow = { ...state, step };
  delete next.offered;
  const choices = freshChoices(next, context);
  if (choices) next.offered = choices;
  return { state: next, reply: [prefix, render(next, context)].filter(Boolean).join("\n\n"), ...(staff ? { staff } : {}) };
}
function stay(state: WhatsAppFlow, context: FlowContext, message: string, staff?: StaffNotice): Turn { return move(state, state.step, context, message, staff); }
const freshBooking = (state: WhatsAppFlow): WhatsAppFlow => ({ step: "menu", language: state.language });
// A finished request: with no language saved, the client's next message opens the language list, whatever it says.
const finished: WhatsAppFlow = { step: "menu", language: null };

function details(state: WhatsAppFlow): WhatsAppRequestDetails {
  return {
    language: state.language, who: state.who ?? null, adults: state.adults ?? 0, children: state.children ?? 0, specialChildren: state.who === "special" ? state.children ?? 0 : 0,
    barberId: state.barber?.id ?? null, barberName: state.barber?.name ?? null, extra: state.extra ?? null, ...(state.extraHourBusy ? { extraHourBusy: true } : {}),
    visitType: state.visitType ?? "home", ...(state.hospital ? { hospital: state.hospital } : {}),
    date: state.date!, startTime: state.startTime!, endTime: state.endTime!, areaId: state.area!.id, area: state.area!.name, address: state.address!,
  };
}

/** The step the "back" option of a list returns to. */
function previousStep(state: WhatsAppFlow): WhatsAppFlowStep {
  switch (state.step) {
    case "language": return "menu";
    case "menu": return "language";
    case "who": return "menu";
    case "barber": return state.who === "adults" ? "adults" : "children";
    case "date": return "barber";
    case "time": return "date";
    case "extra": return "time";
    case "visitType": return "extra";
    case "area": return "visitType";
    case "confirm": return "address";
    default: return state.step;
  }
}

function pickDate(state: WhatsAppFlow, date: string, context: FlowContext): Turn {
  return openDates(state, context).includes(date) ? move({ ...state, date }, "time", context) : stay(state, context, copy[state.language ?? "ar"].taken);
}

/** Applies a menu number; null when the number is not one of the step's options. */
function applyChoice(state: WhatsAppFlow, choice: number, context: FlowContext): Turn | null {
  const language = state.language ?? "ar", list = options(state, context, language);
  if (!Number.isInteger(choice) || choice < 1 || choice > list.length) return null;
  if (list[choice - 1] === copy[language].back) {
    const { resume, ...rest } = state;
    return move(rest, resume ?? previousStep(state), context);
  }
  const value = state.offered?.[choice - 1] ?? freshChoices(state, context)?.[choice - 1];
  switch (state.step) {
    case "language": {
      const chosen: Language = choice === 1 ? "en" : "ar";
      const { resume, ...rest } = state;
      return move({ ...rest, language: chosen }, resume ?? "menu", context, copy[chosen].languageSet);
    }
    case "menu":
      switch (choice) {
        case 1: return move(freshBooking(state), "who", context);
        case 2: return { ...move(state, "menu", context), image: { media: "price_list", caption: copy[language].homePrices } };
        case 3: return { ...move(state, "menu", context, `📍 ${copy[language].salonLocation}\n${SALON_LOCATION}`), image: { media: "salon_price_list", caption: copy[language].salonService } };
        case 4: return { state: finished, reply: copy[language].talkSent, staff: { type: "talk" }, pause: true };
        case 5: return move(state, "change", context);
        default: return null;
      }
    case "who": {
      const who = whoValues[choice - 1]!;
      return move({ ...state, who }, who === "adults" || who === "family" ? "adults" : "children", context);
    }
    case "barber": {
      const next = { ...state, barber: context.barbers[choice - 1]! };
      return openDates(next, context).length ? move(next, "date", context) : stay(state, context, copy[language].noTimes);
    }
    case "date":
      return pickDate(state, value!, context);
    case "time":
      // A visit is one hour, two with an extra service; staff change it in the dashboard when needed.
      return freeStarts(state, context, state.date!).includes(value!) ? move({ ...state, startTime: value!, endTime: clock(hourOf(value!) + 1) }, "extra", context) : stay(state, context, copy[language].taken);
    case "extra": {
      const extra = extraValues[choice - 1] ?? null, hour = hourOf(state.startTime!);
      const rest = { ...state };
      delete rest.extraHourBusy;
      if (!extra) return move({ ...rest, extra, endTime: clock(hour + 1) }, "visitType", context);
      // The request is still sent when the extra hour is taken; staff see it flagged and arrange the visit.
      const busy = !(barberFree(state, context)[state.date!] ?? []).includes(clock(hour + 1));
      return move({ ...rest, extra, endTime: clock((hour + 2) % 24), ...(busy ? { extraHourBusy: true } : {}) }, "visitType", context);
    }
    case "visitType": {
      const visitType = choice === 1 ? "home" as const : "hospital" as const;
      const next = { ...state, visitType };
      if (visitType === "home") delete next.hospital;
      return move(next, "area", context);
    }
    case "confirm":
      if (choice === 2) return move({ step: "language", language: null }, "language", context);
      return { state: finished, reply: copy[language].sent, staff: { type: "new_request", details: details(state) } };
    default:
      return null;
  }
}

function applyCount(state: WhatsAppFlow, count: number, context: FlowContext): Turn {
  if (!Number.isInteger(count) || count < 1 || count > 50) return stay(state, context, copy[state.language ?? "ar"].countInvalid);
  if (state.step === "adults") return move({ ...state, adults: count }, state.who === "family" ? "children" : "barber", context);
  return move({ ...state, children: count }, "barber", context);
}

type WrittenInput = { [Key in keyof Omit<WhatsAppAddress, "mapsUrl">]?: string | null | undefined };
type HospitalInput = { wing?: string | null | undefined; floor?: string | null | undefined; room?: string | null | undefined };
const linkIn = (text: string) => /https?:\/\/\S+/.exec(text)?.[0] ?? null;
const isGoogleMapsLink = (link: string) => addressCreateSchema.shape.mapsUrl.safeParse(link).success;

/** A complete address for a link-only or hospital visit; the home fields that do not apply stay unused. */
function unusedHomeAddress(mapsUrl: string | null): WhatsAppAddress {
  return { block: NOT_PROVIDED, street: NOT_PROVIDED, houseNumber: NOT_PROVIDED, buildingName: null, avenue: null, floor: null, apartment: null, mapsUrl };
}
const trimmed = (value: string | null | undefined) => value?.trim() || null;
function hospitalFrom(input: HospitalInput): WhatsAppHospital | null {
  const wing = trimmed(input.wing), floor = trimmed(input.floor), room = trimmed(input.room);
  return wing && floor && room ? { wing, floor, room } : null;
}

function applyHospitalAddress(state: WhatsAppFlow, input: HospitalInput | null, link: string | null, context: FlowContext): Turn {
  const text = copy[state.language ?? "ar"];
  if (link && !isGoogleMapsLink(link)) return stay(state, context, text.linkInvalid);
  const hospital = (input ? hospitalFrom(input) : null) ?? state.hospital;
  if (!link && !hospital) return stay(state, context, text.hospitalInvalid);
  const next: WhatsAppFlow = { ...state, address: unusedHomeAddress(link) };
  if (hospital) next.hospital = hospital;
  else delete next.hospital;
  return move(next, "confirm", context);
}

/** The written address or the Google Maps link is enough; sending both is also allowed. */
function applyAddress(state: WhatsAppFlow, input: WrittenInput | HospitalInput | null, link: string | null, context: FlowContext): Turn {
  if (state.visitType === "hospital") return applyHospitalAddress(state, input, link, context);
  const text = copy[state.language ?? "ar"];
  if (link && !isGoogleMapsLink(link)) return stay(state, context, text.linkInvalid);
  const previous = state.draft, mapsUrl = link ?? previous?.mapsUrl ?? null;
  let written = previous?.written;
  if (input) {
    const home = input as WrittenInput;
    const gate = trimmed(home.gate) ?? written?.gate ?? null, blueNumber = trimmed(home.blueNumber) ?? written?.blueNumber ?? null;
    written = {
      block: trimmed(home.block) ?? written?.block ?? "", street: trimmed(home.street) ?? written?.street ?? "", houseNumber: trimmed(home.houseNumber) ?? written?.houseNumber ?? null, buildingName: trimmed(home.buildingName) ?? written?.buildingName ?? null,
      avenue: trimmed(home.avenue) ?? written?.avenue ?? null, floor: trimmed(home.floor) ?? written?.floor ?? null, apartment: trimmed(home.apartment) ?? written?.apartment ?? null,
      ...(gate ? { gate } : {}), ...(blueNumber ? { blueNumber } : {}),
    };
  }
  if (!written && !mapsUrl) return stay(state, context, text.address);
  // A Maps link is sufficient even after a partial written reply; retain the details already supplied.
  if (written && mapsUrl) written = {
    ...written, block: written.block || NOT_PROVIDED, street: written.street || NOT_PROVIDED,
    houseNumber: written.houseNumber ?? (written.buildingName ? null : NOT_PROVIDED),
  };
  // Revalidate a saved draft as well as newly supplied fields before advancing.
  const parsed = written ? addressCreateSchema.safeParse({ area: state.area!.name, ...written, mapsUrl }) : null;
  if (parsed && !parsed.success) {
    const arabic = state.language !== "en";
    const missing = [!written?.block ? arabic ? "القطعة" : "block" : null, !written?.street ? arabic ? "الشارع" : "street" : null, !written?.houseNumber && !written?.buildingName ? arabic ? "المنزل أو البناية" : "house or building" : null].filter(Boolean);
    const next = { ...state, draft: { written: written!, ...(mapsUrl ? { mapsUrl } : {}) } };
    if (missing.length) return { state: next, reply: arabic ? `📍 أرسل تفاصيل العنوان الناقصة: ${missing.join("، ")}.` : `📍 Please send the missing address details: ${missing.join(", ")}.` };
    return stay(next, context, text.addressInvalid);
  }
  const next: WhatsAppFlow = { ...state, address: parsed?.success ? { ...unusedHomeAddress(mapsUrl), ...written } : unusedHomeAddress(mapsUrl) };
  delete next.draft;
  return move(next, "confirm", context);
}
/** A new address step starts empty. */
function toAddress(state: WhatsAppFlow, area: { id: string; name: string }, context: FlowContext) {
  const next: WhatsAppFlow = { ...state, area };
  delete next.draft;
  return move(next, "address", context);
}

/** Handles input the code understands by itself, so menus never depend on the AI. Null means the AI should read it. */
function direct(state: WhatsAppFlow, raw: string, context: FlowContext): Turn | null {
  const text = westernDigits(raw).trim();
  const language = state.language ?? "ar";
  const number = /^\d{1,3}$/.test(text) ? Number(text) : null;
  if (state.step === "change") return { state: finished, reply: copy[language].changeSent, staff: { type: "change", text: raw.trim() } };
  if (number !== null) {
    if (state.step === "adults" || state.step === "children") return applyCount(state, number, context);
    if (options(state, context, language).length) return applyChoice(state, number, context) ?? stay(state, context, copy[language].invalid);
  }
  if (state.step === "area") {
    const area = context.areas.find(item => item.name.toLowerCase() === text.toLowerCase());
    if (area) return toAddress(state, area, context);
  }
  // A link with nothing else written needs no AI; written text, alone or with a link, is read by the AI.
  if (state.step === "address") {
    const link = linkIn(text);
    const parts = state.visitType === "hospital"
      ? parseLabeledParts(link ? text.replace(link, "") : text, hospitalLabels)
      : parseLabeledParts(link ? text.replace(link, "") : text, homeLabels);
    if (parts) return applyAddress(state, parts, link, context);
    if (link && !text.replace(link, "").trim()) return applyAddress(state, null, link, context);
  }
  return null;
}

const valueSchemas = {
  choice: z.object({ choice: z.number() }),
  count: z.object({ count: z.number() }),
  area: z.object({ area: z.string() }),
  date: z.object({ date: z.iso.date() }),
  address: z.object({ block: z.string().nullish(), street: z.string().nullish(), houseNumber: z.string().nullish(), buildingName: z.string().nullish(), avenue: z.string().nullish(), floor: z.string().nullish(), apartment: z.string().nullish(), gate: z.string().nullish(), blueNumber: z.string().nullish() }),
  hospital: z.object({ wing: z.string().nullish(), floor: z.string().nullish(), room: z.string().nullish() }),
};

/** Applies what the AI read from free text; everything is checked here, so the AI cannot skip a step or invent a value. */
function applyValue(state: WhatsAppFlow, value: Record<string, unknown>, context: FlowContext, link: string | null): Turn | null {
  if (state.step === "adults" || state.step === "children") {
    const parsed = valueSchemas.count.safeParse(value);
    return parsed.success ? applyCount(state, parsed.data.count, context) : null;
  }
  if (state.step === "area") {
    const parsed = valueSchemas.area.safeParse(value);
    const area = parsed.success ? context.areas.find(item => item.name === parsed.data.area) : undefined;
    return area ? toAddress(state, area, context) : stay(state, context, copy[state.language ?? "ar"].areaInvalid);
  }
  if (state.step === "address") {
    if (state.visitType === "hospital") {
      const parsed = valueSchemas.hospital.safeParse(value);
      return parsed.success ? applyHospitalAddress(state, parsed.data, link, context) : null;
    }
    const parsed = valueSchemas.address.safeParse(value);
    return parsed.success ? applyAddress(state, parsed.data, link, context) : null;
  }
  if (state.step === "date") {
    const parsed = valueSchemas.date.safeParse(value);
    if (parsed.success) return pickDate(state, parsed.data.date, context);
  }
  const parsed = valueSchemas.choice.safeParse(value);
  return parsed.success ? applyChoice(state, parsed.data.choice, context) : null;
}

/** What the AI must return for the client's current step. */
export function stepInstructions(state: WhatsAppFlow, context: FlowContext) {
  const language = state.language ?? "ar";
  const today = `${kuwaitDate(context.now)} (${new Date(`${kuwaitDate(context.now)}T12:00:00.000Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })})`;
  const list = options(state, context, language);
  const value: Partial<Record<WhatsAppFlowStep, string>> = {
    adults: '{"count": <number of adults>}', children: '{"count": <number of children>}',
    date: '{"date": "YYYY-MM-DD"} or {"choice": <option number>}',
    area: `{"area": "<one exact name from this list>"} only when you are sure which area the client means. Areas: ${context.areas.map(area => area.name).join(" | ")}`,
    address: state.visitType === "hospital"
      ? '{"wing": "...", "floor": "...", "room": "..."} with null for anything the client did not write. Leave out any link; the code reads it'
      : '{"block": "...", "street": "...", "houseNumber": "...", "buildingName": "...", "avenue": "...", "floor": "...", "apartment": "...", "gate": "...", "blueNumber": "..."} with null for anything the client did not write. Read labeled fields in any order, in Arabic or English; never assign numbers by their position. Leave out any link; the code reads it',
  };
  return `## Technical rules (fixed by the system)

Today in Kuwait is ${today}. Answer in ${language === "ar" ? "Arabic" : "English"}.

The code sends the menus. The client is at step "${state.step}" and wrote something that is not a menu number.${list.length ? `\nThe options are:\n${numbered(list)}` : ""}

Answer with one JSON object and nothing else:
{"reply": "<text>", "value": <object or null>, "forward": <text or null>}

- "value": what the client's message answers for this step, as ${value[state.step] ?? '{"choice": <option number>}'}. Otherwise null. Never guess a value.
- "reply": empty when "value" is set. Otherwise a short answer to the client's question, or a short request to answer the step. The code sends the menu again after it, so never list the options.
- "forward": a short English summary for staff when the client asks about confirmation or status, arrival time, asks for a person, complains, or asks about the service and the text above does not answer it. Then say in "reply" that staff will be told. Otherwise null.
- When the client asks about prices, do not forward. Say in "reply" that the home service price list is option 2 and the salon service (price list and location) is option 3 of the main menu, which opens when they send the word "menu" (in Arabic "القائمة").

You have no access to bookings. Never say that a booking is made, confirmed, changed or cancelled.`;
}

/** One client message: menu input is handled by the code, anything else goes through the AI. */
export async function advance(state: WhatsAppFlow | null, text: string, context: FlowContext, ask: (state: WhatsAppFlow) => Promise<Interpretation>): Promise<Turn> {
  if (!state?.language && state?.step !== "language") return move({ step: "language", language: null }, "language", context);
  if (/^(menu|القائمة|قائمة)$/i.test(text.trim())) return move(state.language ? freshBooking(state) : state, state.language ? "menu" : "language", context);
  // A client who chose "any barber" before that option was removed chooses a barber now.
  // "duration" is the removed how-long question, still saved for clients who were on it; they choose the start time again.
  const step: string = state.step;
  if (["date", "time", "duration"].includes(step) && !state.barber) return move(state, "barber", context);
  if (step === "duration") return move(state, "time", context);
  const handled = direct(state, text, context);
  if (handled) return handled;
  const answer = await ask(state);
  const link = state.step === "address" ? linkIn(westernDigits(text)) : null;
  const applied = answer.value ? applyValue(state, answer.value, context, link) : null;
  if (applied) return applied;
  // The client sent a link with text the AI could not read as an address: the link alone is enough.
  if (link) return applyAddress(state, null, link, context);
  const language = state.language ?? "ar";
  return stay(state, context, answer.reply || copy[language].invalid, answer.forward ? { type: "forward", summary: answer.forward } : undefined);
}
