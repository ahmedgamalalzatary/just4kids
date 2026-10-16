import type { z } from "zod";
import type { clientLookupResponseSchema } from "@just4kids/contracts";
import type {
  areaResponseSchema,
  accountSchema, addressResponseSchema, barberCollectionEventSchema, barberCollectionReportResponseSchema, barberCollectionResponseSchema, bookingMessageResponseSchema, bookingResponseSchema, bookingRevisionResponseSchema, branchResponseSchema, clientReportResponseSchema,
  clientResponseSchema, clientStatusEventSchema, clientSummarySchema, eligibilityResponseSchema, employeeReportResponseSchema, employeeResponseSchema, haircutReportResponseSchema,
  comprehensiveReportResponseSchema, reservationReportResponseSchema,
  salonEntryEventSchema, salonEntryResponseSchema, salonReportResponseSchema, scheduleResponseSchema, sessionResponseSchema, timeBlockResponseSchema, visitEventResponseSchema,
} from "@just4kids/contracts";

export type Account = z.output<typeof accountSchema>;
export type Session = z.output<typeof sessionResponseSchema>;
export type Branch = z.output<typeof branchResponseSchema>;
export type Employee = z.output<typeof employeeResponseSchema>;
export type Schedule = z.output<typeof scheduleResponseSchema>;
export type TimeBlock = z.output<typeof timeBlockResponseSchema>;
export type Eligibility = z.output<typeof eligibilityResponseSchema>;
export type ClientSummary = z.output<typeof clientSummarySchema>;
export type Client = z.output<typeof clientResponseSchema>;
export type ClientLookup = z.output<typeof clientLookupResponseSchema>;
export type ClientStatusEvent = z.output<typeof clientStatusEventSchema>;
export type Address = z.output<typeof addressResponseSchema>;
export type Area = z.output<typeof areaResponseSchema>;
export type Booking = z.output<typeof bookingResponseSchema>;
export type VisitEvent = z.output<typeof visitEventResponseSchema>;
export type BookingMessage = z.output<typeof bookingMessageResponseSchema>;
export type BookingRevision = z.output<typeof bookingRevisionResponseSchema>;

export type Page<Key extends string, Item> = { [K in Key]: Item[] } & { total: number; limit: number; offset: number };

export type ReservationReport = z.output<typeof reservationReportResponseSchema>;
export type HaircutReport = z.output<typeof haircutReportResponseSchema>;
export type EmployeeReport = z.output<typeof employeeReportResponseSchema>;
export type ClientReport = z.output<typeof clientReportResponseSchema>;
export type SalonEntry = z.output<typeof salonEntryResponseSchema>;
export type SalonEntryEvent = z.output<typeof salonEntryEventSchema>;
export type SalonReport = z.output<typeof salonReportResponseSchema>;
export type BarberCollection = z.output<typeof barberCollectionResponseSchema>;
export type BarberCollectionEvent = z.output<typeof barberCollectionEventSchema>;
export type BarberCollectionReport = z.output<typeof barberCollectionReportResponseSchema>;
export type ComprehensiveReport = z.output<typeof comprehensiveReportResponseSchema>;
