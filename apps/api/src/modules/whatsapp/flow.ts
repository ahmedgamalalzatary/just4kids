import { z } from "zod";
import { addressCreateSchema, eligibilityQuerySchema, isWholeHourWindow } from "@just4kids/contracts";
import type { WhatsAppAddress, WhatsAppFlow, WhatsAppFlowStep, WhatsAppRequestDetails, WhatsAppWho } from "@just4kids/db/schema";
import type { Interpretation } from "./ai.js";

// Shown in the reservation when the client sent only a location link; staff can complete it in the dashboard.
export const NOT_PROVIDED = "—";
const SALON_LOCATION = "https://maps.google.com/maps?q=29.086143493652344%2C48.121238708496094&z=17&hl=en";

export type FlowContext = { barbers: { id: string; name: string }[]; areas: { id: string; name: string }[]; now: Date };
export type StaffNotice =
  | { type: "new_request"; details: WhatsAppRequestDetails }
  | { type: "change"; text: string }
  | { type: "forward"; summary: string }
  | { type: "talk" };
// image: the caption of the price list photo, sent before the reply. pause: the AI stops for this client until staff send "ai on".
export type Turn = { state: WhatsAppFlow; reply: string; staff?: StaffNotice; image?: string; pause?: true };
type Language = "en" | "ar";

const copy = {
  en: {
    changeLanguage: "Change language / تغيير اللغة", back: "Back to the previous step", languageSet: "✅ Language: English",
    menu: "✂️ *J4Kids Salon* — how can we help?", book: "Book an appointment", change: "Cancel or change a request", talk: "Talk to an employee", salonPrices: "Salon price list", homePrices: "Home price list", salonLocation: "Salon location", pick: "Send a number to choose.",
    who: "👶 Who is this for?", whoOptions: ["Boy", "Girl", "Baby", "Special needs", "Both (Girl & Boy)"],
    adults: "🔢 How many adults?", children: "🔢 How many kids?", barber: "💈 Which barber do you choose?", any: "Any barber", date: "📅 Preferred date:",
    time: (date: string) => `⏰ What time on ${date}? Send the start and end, for example 4 pm to 6 pm.`,
    timeInvalid: "⚠️ The time must be in the future, start on the hour and last 1, 2, 3 or 4 whole hours. For example, 4 pm to 6 pm.",
    area: "📍 Which area in Kuwait?", areaInvalid: "⚠️ We could not find that area in Kuwait. Please send the area name again.",
    address: "📍 Please write your address (block, street, house or building). If you can't, send a Google Maps link.",
    addressInvalid: "⚠️ Please write the block, street and house or building. If you can't, send a Google Maps link.",
    confirmHead: "Please confirm your request:", service: "✂️ Hair Cut — Home Service",
    forLine: (adults: number, children: number) => `👶 Adults: ${adults} · Kids: ${children}`, barberLine: "💈 Barber:", addressLine: "📍 Address:", locationLine: "📍 Location:",
    requestNote: "This is a request — our team will confirm the exact time.", confirm: "Confirm ✅", startOver: "Start over ❌",
    sent: "✅ Your request was sent to our team. They will contact you to confirm.",
    changeAsk: "✏️ What would you like to change or cancel? Send it in one message.", changeSent: "✅ We sent this to our team. They will contact you.", talkSent: "✅ We told our team. An employee will contact you soon.",
    invalid: "⚠️ Please send one of the numbers above.", countInvalid: "⚠️ Please send a number from 1 to 50.",
    approved: (date: string, time: string, barber: string) => `✅ Your reservation is confirmed.\n📅 ${date} · ${time}\n💈 Barber: ${barber}`,
    rejected: (reason: string | null) => `❌ We could not confirm your request.${reason ? `\n${reason}` : ""}\nA staff member will contact you if needed.`,
  },
  ar: {
    changeLanguage: "Change language / تغيير اللغة", back: "الرجوع للخطوة السابقة", languageSet: "✅ اللغة: العربية",
    menu: "✂️ *صالون J4Kids* — كيف يمكننا مساعدتك؟", book: "حجز موعد", change: "إلغاء أو تعديل طلب", talk: "التحدث مع موظف", salonPrices: "قائمة أسعار الصالون", homePrices: "قائمة أسعار الخدمة المنزلية", salonLocation: "موقع الصالون", pick: "أرسل رقماً للاختيار.",
    who: "👶 لمن الحجز؟", whoOptions: ["ولد", "بنت", "رضيع", "ذوو احتياجات خاصة", "ولد وبنت"],
    adults: "🔢 كم عدد الكبار؟", children: "🔢 كم عدد الأطفال؟", barber: "💈 أي حلاق تختار؟", any: "أي حلاق", date: "📅 التاريخ المفضل:",
    time: (date: string) => `⏰ ما الوقت المناسب يوم ${date}؟ أرسل البداية والنهاية، مثال: من 4 إلى 6 مساءً.`,
    timeInvalid: "⚠️ يجب أن يكون الوقت في المستقبل، وأن يبدأ عند بداية الساعة، وأن تكون مدته 1 أو 2 أو 3 أو 4 ساعات كاملة. مثال: من 4 إلى 6 مساءً.",
    area: "📍 في أي منطقة في الكويت؟", areaInvalid: "⚠️ لم نجد هذه المنطقة في الكويت. أرسل اسم المنطقة مرة أخرى.",
    address: "📍 اكتب عنوانك (القطعة، الشارع، المنزل أو البناية). إذا لم تتمكن، أرسل رابط خرائط Google.",
    addressInvalid: "⚠️ اكتب القطعة والشارع والمنزل أو البناية. إذا لم تتمكن، أرسل رابط خرائط Google.",
    confirmHead: "يرجى تأكيد طلبك:", service: "✂️ قص شعر — خدمة منزلية",
    forLine: (adults: number, children: number) => `👶 الكبار: ${adults} · الأطفال: ${children}`, barberLine: "💈 الحلاق:", addressLine: "📍 العنوان:", locationLine: "📍 الموقع:",
    requestNote: "هذا طلب — سيؤكد فريقنا الوقت المحدد.", confirm: "تأكيد ✅", startOver: "البدء من جديد ❌",
    sent: "✅ تم إرسال طلبك إلى فريقنا. سيتواصلون معك للتأكيد.",
    changeAsk: "✏️ ما الذي تريد تعديله أو إلغاءه؟ أرسله في رسالة واحدة.", changeSent: "✅ أرسلنا هذا إلى فريقنا. سيتواصلون معك.", talkSent: "✅ أبلغنا فريقنا. سيتواصل معك موظف قريباً.",
    invalid: "⚠️ أرسل أحد الأرقام أعلاه.", countInvalid: "⚠️ أرسل رقماً من 1 إلى 50.",
    approved: (date: string, time: string, barber: string) => `✅ تم تأكيد حجزك.\n📅 ${date} · ${time}\n💈 الحلاق: ${barber}`,
    rejected: (reason: string | null) => `❌ لم نتمكن من تأكيد طلبك.${reason ? `\n${reason}` : ""}\nسيتواصل معك موظف عند الحاجة.`,
  },
} as const;

const whoValues: WhatsAppWho[] = ["boy", "girl", "baby", "special", "both"];
const numbered = (options: readonly string[]) => options.map((option, index) => `${index + 1}. ${option}`).join("\n");
const westernDigits = (text: string) => text.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
const kuwaitDate = (now: Date, offset = 0) => new Date(now.getTime() + 3 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const days = (now: Date) => Array.from({ length: 7 }, (_, offset) => kuwaitDate(now, offset));
const dateLabel = (date: string, language: Language) => new Date(`${date}T12:00:00.000Z`).toLocaleDateString(language === "ar" ? "ar-KW" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function clientApproved(language: Language | null, details: { date: string; startTime: string; endTime: string }, barber: string) {
  const text = copy[language ?? "ar"];
  return text.approved(dateLabel(details.date, language ?? "ar"), `${details.startTime} - ${details.endTime}`, barber);
}
export function clientRejected(language: Language | null, reason: string | null) { return copy[language ?? "ar"].rejected(reason); }

/** The options of a numbered step, in the order the client sees them. */
function options(state: WhatsAppFlow, context: FlowContext, language: Language): readonly string[] {
  const text = copy[language];
  if (state.step === "language") return state.language ? ["English", "العربية", text.back] : ["English", "العربية"];
  if (state.step === "menu") return [text.book, text.change, text.changeLanguage, text.talk, text.salonPrices, text.homePrices, text.salonLocation, text.back];
  if (state.step === "who") return [...text.whoOptions, text.changeLanguage, text.back];
  if (state.step === "barber") return [...context.barbers.map(barber => barber.name), text.any, text.changeLanguage, text.back];
  if (state.step === "date") return [...days(context.now).map(date => dateLabel(date, language)), text.changeLanguage, text.back];
  if (state.step === "confirm") return [text.confirm, text.startOver, text.changeLanguage, text.back];
  return [];
}

function summary(state: WhatsAppFlow, context: FlowContext, language: Language) {
  const text = copy[language], address = state.address!;
  const typed = [address.block, address.street, address.houseNumber ?? address.buildingName].filter(part => part && part !== NOT_PROVIDED).join(", ");
  return [
    text.confirmHead, "", text.service, text.forLine(state.adults ?? 0, state.children ?? 0),
    `${text.barberLine} ${state.barber?.name ?? text.any}`,
    `📅 ${dateLabel(state.date!, language)} · ${state.startTime} - ${state.endTime}`,
    `${text.addressLine} ${[state.area!.name, typed].filter(Boolean).join(", ")}`,
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
    case "time": return text.time(dateLabel(state.date!, language));
    case "area": return text.area;
    case "address": return text.address;
    case "confirm": return summary(state, context, language);
    case "change": return text.changeAsk;
  }
}

function move(state: WhatsAppFlow, step: WhatsAppFlowStep, context: FlowContext, prefix?: string, staff?: StaffNotice): Turn {
  const next: WhatsAppFlow = { ...state, step };
  return { state: next, reply: [prefix, render(next, context)].filter(Boolean).join("\n\n"), ...(staff ? { staff } : {}) };
}
function stay(state: WhatsAppFlow, context: FlowContext, message: string, staff?: StaffNotice): Turn { return move(state, state.step, context, message, staff); }
const freshBooking = (state: WhatsAppFlow): WhatsAppFlow => ({ step: "menu", language: state.language });
// A finished request: with no language saved, the client's next message opens the language list, whatever it says.
const finished: WhatsAppFlow = { step: "menu", language: null };

function details(state: WhatsAppFlow): WhatsAppRequestDetails {
  return {
    language: state.language, who: state.who ?? null, adults: state.adults ?? 0, children: state.children ?? 0, specialChildren: state.who === "special" ? state.children ?? 0 : 0,
    barberId: state.barber?.id ?? null, barberName: state.barber?.name ?? null,
    date: state.date!, startTime: state.startTime!, endTime: state.endTime!, areaId: state.area!.id, area: state.area!.name, address: state.address!,
  };
}

function chooseLanguageStep(state: WhatsAppFlow, context: FlowContext) {
  return move({ ...state, resume: state.step }, "language", context);
}

/** The step the "back" option of a list returns to. */
function previousStep(state: WhatsAppFlow): WhatsAppFlowStep {
  switch (state.step) {
    case "language": return "menu";
    case "menu": return "language";
    case "who": return "menu";
    case "barber": return state.who === "adults" ? "adults" : "children";
    case "date": return "barber";
    case "confirm": return "address";
    default: return state.step;
  }
}

/** Applies a menu number; null when the number is not one of the step's options. */
function applyChoice(state: WhatsAppFlow, choice: number, context: FlowContext): Turn | null {
  const language = state.language ?? "ar", count = options(state, context, language).length;
  if (!Number.isInteger(choice) || choice < 1 || choice > count) return null;
  // The last option of a list is "back", when the list has one.
  if (options(state, context, language).at(-1) === copy[language].back && choice === count) {
    const { resume, ...rest } = state;
    return move(rest, resume ?? previousStep(state), context);
  }
  // The option before it on these steps is always "change language".
  if (["who", "barber", "date", "confirm"].includes(state.step) && choice === count - 1) return chooseLanguageStep(state, context);
  switch (state.step) {
    case "language": {
      const chosen: Language = choice === 1 ? "en" : "ar";
      const { resume, ...rest } = state;
      return move({ ...rest, language: chosen }, resume ?? "menu", context, copy[chosen].languageSet);
    }
    case "menu":
      switch (choice) {
        case 1: return move(freshBooking(state), "who", context);
        case 2: return move(state, "change", context);
        case 3: return chooseLanguageStep(state, context);
        case 4: return { state: finished, reply: copy[language].talkSent, staff: { type: "talk" }, pause: true };
        case 5: return { ...move(state, "menu", context), image: copy[language].salonPrices };
        case 6: return { ...move(state, "menu", context), image: copy[language].homePrices };
        default: return move(state, "menu", context, `📍 ${copy[language].salonLocation}\n${SALON_LOCATION}`);
      }
    case "who": {
      const who = whoValues[choice - 1]!;
      return move({ ...state, who }, who === "adults" || who === "family" ? "adults" : "children", context);
    }
    case "barber":
      return move({ ...state, barber: context.barbers[choice - 1] ?? null }, "date", context);
    case "date":
      return move({ ...state, date: days(context.now)[choice - 1]! }, "time", context);
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

function applyTime(state: WhatsAppFlow, startTime: string, endTime: string, context: FlowContext): Turn {
  const valid = eligibilityQuerySchema.safeParse({ date: state.date, startTime, endTime }).success && isWholeHourWindow({ startTime, endTime }) && new Date(`${state.date}T${startTime}:00+03:00`).getTime() > context.now.getTime();
  if (!valid) return stay(state, context, copy[state.language ?? "ar"].timeInvalid);
  return move({ ...state, startTime, endTime }, "area", context);
}

function applyAddress(state: WhatsAppFlow, input: { [Key in keyof WhatsAppAddress]?: string | null | undefined }, context: FlowContext): Turn {
  const mapsUrl = input.mapsUrl ?? null;
  const part = (value: string | null | undefined) => value?.trim() || null;
  const address: WhatsAppAddress = {
    block: part(input.block) ?? (mapsUrl ? NOT_PROVIDED : ""), street: part(input.street) ?? (mapsUrl ? NOT_PROVIDED : ""),
    houseNumber: part(input.houseNumber) ?? (mapsUrl && !part(input.buildingName) ? NOT_PROVIDED : null), buildingName: part(input.buildingName),
    avenue: part(input.avenue), floor: part(input.floor), apartment: part(input.apartment), mapsUrl,
  };
  if (!addressCreateSchema.safeParse({ area: state.area!.name, ...address }).success) return stay(state, context, copy[state.language ?? "ar"].addressInvalid);
  return move({ ...state, address }, "confirm", context);
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
  if (state.step === "time") {
    const match = /^(\d{1,2}:\d{2})\s*(?:-|–|to|إلى)\s*(\d{1,2}:\d{2})$/i.exec(text);
    if (match) return applyTime(state, match[1]!.padStart(5, "0"), match[2]!.padStart(5, "0"), context);
  }
  if (state.step === "area") {
    const area = context.areas.find(item => item.name.toLowerCase() === text.toLowerCase());
    if (area) return move({ ...state, area }, "address", context);
  }
  if (state.step === "address") {
    const link = /https?:\/\/\S+/.exec(text);
    if (link) return applyAddress(state, { mapsUrl: link[0] }, context);
  }
  return null;
}

const valueSchemas = {
  choice: z.object({ choice: z.number() }),
  count: z.object({ count: z.number() }),
  time: z.object({ startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/) }),
  area: z.object({ area: z.string() }),
  date: z.object({ date: z.iso.date() }),
  address: z.object({ block: z.string().nullish(), street: z.string().nullish(), houseNumber: z.string().nullish(), buildingName: z.string().nullish(), avenue: z.string().nullish(), floor: z.string().nullish(), apartment: z.string().nullish() }),
};

/** Applies what the AI read from free text; everything is checked here, so the AI cannot skip a step or invent a value. */
function applyValue(state: WhatsAppFlow, value: Record<string, unknown>, context: FlowContext): Turn | null {
  if (state.step === "adults" || state.step === "children") {
    const parsed = valueSchemas.count.safeParse(value);
    return parsed.success ? applyCount(state, parsed.data.count, context) : null;
  }
  if (state.step === "time") {
    const parsed = valueSchemas.time.safeParse(value);
    return parsed.success ? applyTime(state, parsed.data.startTime, parsed.data.endTime, context) : null;
  }
  if (state.step === "area") {
    const parsed = valueSchemas.area.safeParse(value);
    const area = parsed.success ? context.areas.find(item => item.name === parsed.data.area) : undefined;
    return area ? move({ ...state, area }, "address", context) : stay(state, context, copy[state.language ?? "ar"].areaInvalid);
  }
  if (state.step === "address") {
    const parsed = valueSchemas.address.safeParse(value);
    return parsed.success ? applyAddress(state, parsed.data, context) : null;
  }
  if (state.step === "date") {
    const parsed = valueSchemas.date.safeParse(value);
    if (parsed.success) return parsed.data.date >= kuwaitDate(context.now) ? move({ ...state, date: parsed.data.date }, "time", context) : stay(state, context, copy[state.language ?? "ar"].timeInvalid);
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
    time: '{"startTime": "HH:MM", "endTime": "HH:MM"} in 24-hour time. Only when the client gave both a start and an end. Reservations start on the hour and last whole hours',
    date: '{"date": "YYYY-MM-DD"} or {"choice": <option number>}',
    area: `{"area": "<one exact name from this list>"} only when you are sure which area the client means. Areas: ${context.areas.map(area => area.name).join(" | ")}`,
    address: '{"block": "...", "street": "...", "houseNumber": "...", "buildingName": "...", "avenue": "...", "floor": "...", "apartment": "..."} with null for anything the client did not write',
  };
  return `## Technical rules (fixed by the system)

Today in Kuwait is ${today}. Answer in ${language === "ar" ? "Arabic" : "English"}.

The code sends the menus. The client is at step "${state.step}" and wrote something that is not a menu number.${list.length ? `\nThe options are:\n${numbered(list)}` : ""}

Answer with one JSON object and nothing else:
{"reply": "<text>", "value": <object or null>, "forward": <text or null>}

- "value": what the client's message answers for this step, as ${value[state.step] ?? '{"choice": <option number>}'}. Otherwise null. Never guess a value.
- "reply": empty when "value" is set. Otherwise a short answer to the client's question, or a short request to answer the step. The code sends the menu again after it, so never list the options.
- "forward": a short English summary for staff when the client asks about confirmation or status, arrival time, asks for a person, complains, or asks about the service and the text above does not answer it. Then say in "reply" that staff will be told. Otherwise null.
- When the client asks about prices, do not forward. Say in "reply" that the salon and home price lists are options 5 and 6 of the main menu, which opens when they send the word "menu" (in Arabic "القائمة").

You have no access to bookings. Never say that a booking is made, confirmed, changed or cancelled.`;
}

/** One client message: menu input is handled by the code, anything else goes through the AI. */
export async function advance(state: WhatsAppFlow | null, text: string, context: FlowContext, ask: (state: WhatsAppFlow) => Promise<Interpretation>): Promise<Turn> {
  if (!state?.language && state?.step !== "language") return move({ step: "language", language: null }, "language", context);
  if (/^(menu|القائمة|قائمة)$/i.test(text.trim())) return move(state.language ? freshBooking(state) : state, state.language ? "menu" : "language", context);
  const handled = direct(state, text, context);
  if (handled) return handled;
  const answer = await ask(state);
  const applied = answer.value ? applyValue(state, answer.value, context) : null;
  if (applied) return applied;
  const language = state.language ?? "ar";
  return stay(state, context, answer.reply || copy[language].invalid, answer.forward ? { type: "forward", summary: answer.forward } : undefined);
}
