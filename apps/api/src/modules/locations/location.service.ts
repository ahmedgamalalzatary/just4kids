import { barberLocationsResponseSchema, locationUpdateSchema } from "@just4kids/contracts";
import type { LocationRepository } from "./location.repository.js";

/** Kuwait is UTC+3 without daylight saving. */
function kuwaitNow(now: Date) {
  const local = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export function createLocationService(repository: LocationRepository) {
  return {
    async report(employeeId: string, body: unknown, now = new Date()) {
      await repository.save(employeeId, locationUpdateSchema.parse(body), now);
    },
    async list(now = new Date()) {
      const { date, time } = kuwaitNow(now);
      const [rows, visits] = await Promise.all([repository.barbers(date), repository.openVisits(date, time)]);
      return barberLocationsResponseSchema.parse({
        barbers: rows.map(row => {
          const visit = visits.find(item => item.employeeId === row.employeeId);
          return {
            employeeId: row.employeeId,
            displayName: row.displayName,
            location: row.location ? { latitude: Number(row.location.latitude), longitude: Number(row.location.longitude), accuracy: row.location.accuracy, updatedAt: row.location.updatedAt.toISOString() } : null,
            nextBooking: visit ? { id: visit.id, startTime: visit.startTime, endTime: visit.endTime, area: visit.address.area, visitStatus: visit.visitStatus } : null,
          };
        }),
      });
    },
  };
}

export type LocationService = ReturnType<typeof createLocationService>;
