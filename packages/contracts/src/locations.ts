import { z } from "zod";

/** How often a signed-in barber's phone reports its position. */
export const LOCATION_REPORT_MS = 30_000;

export const locationUpdateSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).transform(Math.round),
});

const lastLocation = z.strictObject({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().int(),
  updatedAt: z.iso.datetime(),
});

// The barber's reservation in progress or next one today, so the map says where they are heading.
const nextBooking = z.strictObject({
  id: z.uuid(),
  startTime: z.string(),
  endTime: z.string(),
  area: z.string(),
  visitStatus: z.enum(["booked", "arrived"]),
});

export const barberLocationSchema = z.strictObject({
  employeeId: z.uuid(),
  displayName: z.string(),
  location: lastLocation.nullable(),
  nextBooking: nextBooking.nullable(),
});
export const barberLocationsResponseSchema = z.strictObject({ barbers: z.array(barberLocationSchema) });

export type LocationUpdate = z.infer<typeof locationUpdateSchema>;
export type BarberLocation = z.infer<typeof barberLocationSchema>;
export type BarberLocationsResponse = z.infer<typeof barberLocationsResponseSchema>;
