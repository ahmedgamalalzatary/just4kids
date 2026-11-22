import { and, asc, eq, gt, gte, inArray, isNull, or } from "drizzle-orm";
import type { createDatabase } from "@just4kids/db";
import { accounts, bookings, employeeLocations, employees } from "@just4kids/db/schema";
import type { LocationUpdate } from "@just4kids/contracts";

export function createLocationRepository(connection: ReturnType<typeof createDatabase>) {
  const { db } = connection;
  return {
    /** Replaces the barber's stored position with this one. */
    async save(employeeId: string, input: LocationUpdate, now: Date) {
      const values = { ...input, updatedAt: now };
      await db.insert(employeeLocations).values({ employeeId, ...values }).onDuplicateKeyUpdate({ set: values });
    },
    /** Barbers who can sign in today, with their last position if any. */
    async barbers(today: string) {
      return db.select({ employeeId: employees.accountId, displayName: employees.displayName, location: employeeLocations })
        .from(employees)
        .innerJoin(accounts, eq(accounts.id, employees.accountId))
        .leftJoin(employeeLocations, eq(employeeLocations.employeeId, employees.accountId))
        .where(and(eq(accounts.enabled, true), or(isNull(accounts.accessUntil), gte(accounts.accessUntil, today))))
        .orderBy(asc(employees.displayName), asc(employees.accountId));
    },
    /** Today's visits that are booked or under way and not yet over, earliest first. */
    async openVisits(today: string, time: string) {
      return db.select({ id: bookings.id, employeeId: bookings.employeeId, startTime: bookings.startTime, endTime: bookings.endTime, visitStatus: bookings.visitStatus, address: bookings.addressSnapshot })
        .from(bookings)
        .where(and(eq(bookings.date, today), gt(bookings.endTime, time), inArray(bookings.visitStatus, ["booked", "arrived"])))
        .orderBy(asc(bookings.startTime));
    },
  };
}

export type LocationRepository = ReturnType<typeof createLocationRepository>;
