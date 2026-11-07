import { bigint, boolean, datetime, foreignKey, index, int, json, mysqlEnum, mysqlTable, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

// WhatsApp conversations are kept indefinitely; an approved request becomes a normal reservation.
// price_list is the home list; the salon list has its own photo.
export type WhatsAppMedia = "price_list" | "salon_price_list";
export type WhatsAppAddress = { block: string; street: string; houseNumber: string | null; buildingName: string | null; avenue: string | null; floor: string | null; apartment: string | null; mapsUrl: string | null; gate?: string | null; blueNumber?: string | null };
export type WhatsAppWho = "boy" | "girl" | "baby" | "special" | "both" | "medical" | "adults" | "family";
export type WhatsAppVisitType = "home" | "hospital";
export type WhatsAppHospital = { wing: string; floor: string; room: string };
// hair_wash is no longer offered; older requests keep it.
export type WhatsAppExtra = "manicure_pedicure" | "manicure" | "pedicure" | "hair_wash" | "hair_wash_treatment" | "blow_dry_styling" | "wavy_hair";
export type WhatsAppRequestDetails = {
  // The language of this request, for the client's approval or rejection; the chat's language restarts after each request. Older requests have none.
  language?: "en" | "ar" | null;
  // Null when the flow has no answer; requests saved before this field have none either.
  who?: WhatsAppWho | null;
  adults: number; children: number; specialChildren: number;
  // Null only on older requests where the client chose "any barber": staff name one when approving.
  barberId: string | null; barberName: string | null;
  date: string; startTime: string; endTime: string; areaId: string; area: string; address: WhatsAppAddress;
  // Older requests have none; null means the client chose no extra service.
  extra?: WhatsAppExtra | null;
  // Older requests have none, and are home visits.
  visitType?: WhatsAppVisitType | null;
  hospital?: WhatsAppHospital | null;
  // An extra service adds an hour; true when the barber was not free in that hour, so staff arrange the visit by hand.
  extraHourBusy?: boolean;
};
export type WhatsAppStaffAction =
  | ({ type: "new_request"; requestNumber: number } & WhatsAppRequestDetails)
  | { type: "change"; text: string }
  | { type: "talk" }
  | { type: "forward"; summary: string };
// Where one client is in the numbered menus.
export type WhatsAppFlowStep = "language" | "menu" | "who" | "adults" | "children" | "barber" | "date" | "time" | "extra" | "visitType" | "area" | "address" | "confirm" | "change";
export type WhatsAppFlow = {
  step: WhatsAppFlowStep; language: "en" | "ar" | null;
  // The step to return to after the client changes language in the middle of a booking.
  resume?: WhatsAppFlowStep;
  who?: WhatsAppWho; adults?: number; children?: number;
  // name is the English name; nameAr is shown to Arabic chats when set.
  barber?: { id: string; name: string; nameAr?: string | null } | null;
  date?: string; startTime?: string; endTime?: string; extra?: WhatsAppExtra | null; extraHourBusy?: boolean;
  // Older flows have none, and are home visits.
  visitType?: WhatsAppVisitType;
  // The hospital location, used as the reservation note; home-address fields stay unused.
  hospital?: WhatsAppHospital;
  // What the numbers of the last sent date, time or duration list stand for, so a list that changed since keeps its meaning.
  offered?: string[];
  area?: { id: string; name: string }; address?: WhatsAppAddress;
  // Keep supplied details while asking for missing required fields. A Maps link alone is also accepted.
  draft?: { written?: Partial<Omit<WhatsAppAddress, "mapsUrl">>; mapsUrl?: string };
};

export const whatsappConversations = mysqlTable("whatsapp_conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  phone: varchar("phone", { length: 16 }).notNull(),
  // Replies go to the sender's own chat, which may be a privacy id (@lid) rather than the phone.
  chatId: varchar("chat_id", { length: 255 }).notNull(),
  // A worker owns the conversation until leaseUntil; retryAt delays the next attempt after a failure.
  leaseUntil: datetime("lease_until", { mode: "date", fsp: 3 }),
  retryAt: datetime("retry_at", { mode: "date", fsp: 3 }),
  failures: int("failures").notNull().default(0),
  flow: json("flow").$type<WhatsAppFlow>(),
  // Staff took over from the business phone; the AI stays silent until staff send "ai on".
  aiPaused: boolean("ai_paused").notNull().default(false),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [uniqueIndex("whatsapp_conversations_phone_unique").on(table.phone)]);

export const whatsappRequests = mysqlTable("whatsapp_requests", {
  // The number staff see in summaries and updates ("WhatsApp request #12").
  number: int("number").autoincrement().primaryKey(),
  conversationId: varchar("conversation_id", { length: 36 }).notNull(),
  details: json("details").$type<WhatsAppRequestDetails>().notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  bookingId: varchar("booking_id", { length: 36 }),
  decidedAt: datetime("decided_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [
  index("whatsapp_requests_conversation_index").on(table.conversationId),
  foreignKey({ name: "whatsapp_request_conversation_fk", columns: [table.conversationId], foreignColumns: [whatsappConversations.id] }).onDelete("restrict"),
]);

export const whatsappMessages = mysqlTable("whatsapp_messages", {
  // The auto-increment id is the conversation order.
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  conversationId: varchar("conversation_id", { length: 36 }).notNull(),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  audience: mysqlEnum("audience", ["client", "staff"]).notNull(),
  // The text, or the caption when media is set.
  body: text("body").notNull(),
  // Set when the message is a photo from the API's assets instead of text.
  media: mysqlEnum("media", ["price_list", "salon_price_list"]),
  // inbound: pending until it has been answered; outbound: pending until OpenWA accepted it.
  status: mysqlEnum("status", ["pending", "done", "failed"]).notNull(),
  // inbound: OpenWA's X-OpenWA-Idempotency-Key; outbound: the Idempotency-Key sent with every attempt.
  idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
  chatId: varchar("chat_id", { length: 255 }).notNull(),
  // Outbound messages of one AI turn are sent in order; a failure stops the rest of that turn.
  turnId: varchar("turn_id", { length: 36 }),
  action: json("action").$type<WhatsAppStaffAction>(),
  requestNumber: int("request_number"),
  attempts: int("attempts").notNull().default(0),
  error: varchar("error", { length: 500 }),
  openwaMessageId: varchar("openwa_message_id", { length: 255 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  completedAt: datetime("completed_at", { mode: "date", fsp: 3 }),
}, table => [
  uniqueIndex("whatsapp_messages_idempotency_unique").on(table.idempotencyKey),
  index("whatsapp_messages_work_index").on(table.conversationId, table.status, table.id),
  foreignKey({ name: "whatsapp_message_conversation_fk", columns: [table.conversationId], foreignColumns: [whatsappConversations.id] }).onDelete("restrict"),
  foreignKey({ name: "whatsapp_message_request_fk", columns: [table.requestNumber], foreignColumns: [whatsappRequests.number] }).onDelete("restrict"),
]);
