import { bigint, datetime, foreignKey, index, int, json, mysqlEnum, mysqlTable, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

// WhatsApp intake data is kept indefinitely and is not linked to client records.
export type WhatsAppRequestDetails = { adults: number; children: number; address: string; date: string; window: string };
export type WhatsAppStaffAction =
  | ({ type: "new_request"; requestNumber: number } & WhatsAppRequestDetails)
  | { type: "update_request"; requestNumber: number; change: string }
  | { type: "forward"; summary: string };

export const whatsappConversations = mysqlTable("whatsapp_conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  phone: varchar("phone", { length: 16 }).notNull(),
  // Replies go to the sender's own chat, which may be a privacy id (@lid) rather than the phone.
  chatId: varchar("chat_id", { length: 255 }).notNull(),
  // A worker owns the conversation until leaseUntil; retryAt delays the next attempt after a failure.
  leaseUntil: datetime("lease_until", { mode: "date", fsp: 3 }),
  retryAt: datetime("retry_at", { mode: "date", fsp: 3 }),
  failures: int("failures").notNull().default(0),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, table => [uniqueIndex("whatsapp_conversations_phone_unique").on(table.phone)]);

export const whatsappRequests = mysqlTable("whatsapp_requests", {
  // The number staff see in summaries and updates ("WhatsApp request #12").
  number: int("number").autoincrement().primaryKey(),
  conversationId: varchar("conversation_id", { length: 36 }).notNull(),
  details: json("details").$type<WhatsAppRequestDetails>().notNull(),
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
  body: text("body").notNull(),
  // inbound: pending until the AI has answered; outbound: pending until OpenWA accepted it.
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
