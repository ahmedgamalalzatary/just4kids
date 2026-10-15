import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { bookings, bookingMessages } from "@just4kids/db/schema";
import type { Account } from "@just4kids/contracts";
import { bookingMessageResponseSchema } from "@just4kids/contracts";
import { HttpError } from "../../lib/http-error.js";

// Records a "sent to barber" message for the booking history (G13). Admin-only is enforced by the route.
export function createMessageService(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  return {
    async record(id: string, account: Account) {
      const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, id));
      if (!booking) throw new HttpError(404, "NOT_FOUND", "Reservation not found");
      const message = { id: randomUUID(), bookingId: id, kind: "sent_to_barber" as const, actorAccountId: account.id, occurredAt: new Date(Date.now()) };
      await db.insert(bookingMessages).values(message);
      return bookingMessageResponseSchema.parse({ ...message, occurredAt: message.occurredAt.toISOString() });
    },
  };
}
