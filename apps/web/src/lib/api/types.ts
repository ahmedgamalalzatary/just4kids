import type { z } from "zod";
import type {
  accountSchema, addressResponseSchema, barberCollectionEventSchema, barberCollectionReportResponseSchema, barberCollectionResponseSchema, bookingMessageResponseSchema, bookingResponseSchema, bookingRevisionResponseSchema, branchResponseSchema, clientReportResponseSchema,
  clientResponseSchema, clientStatusEventSchema, clientSummarySchema, eligibilityResponseSchema, employeeReportResponseSchema, employeeResponseSchema, haircutReportResponseSchema, invoiceReportResponseSchema,
  comprehensiveReportResponseSchema, invoiceResponseSchema, paymentEventResponseSchema, paymentMethodSchema, paymentResponseSchema, reservationReportResponseSchema,
  salonEntryEventSchema, salonEntryResponseSchema, salonReportResponseSchema, scheduleResponseSchema, sessionResponseSchema, visitEventResponseSchema,
} from "@just4kids/contracts";

export type Account = z.output<typeof accountSchema>;
export type Session = z.output<typeof sessionResponseSchema>;
export type Branch = z.output<typeof branchResponseSchema>;
export type Employee = z.output<typeof employeeResponseSchema>;
export type Schedule = z.output<typeof scheduleResponseSchema>;
export type Eligibility = z.output<typeof eligibilityResponseSchema>;
export type ClientSummary = z.output<typeof clientSummarySchema>;
export type Client = z.output<typeof clientResponseSchema>;
export type ClientStatusEvent = z.output<typeof clientStatusEventSchema>;
export type Address = z.output<typeof addressResponseSchema>;
export type Booking = z.output<typeof bookingResponseSchema>;
export type Invoice = z.output<typeof invoiceResponseSchema>;
export type VisitEvent = z.output<typeof visitEventResponseSchema>;
export type BookingMessage = z.output<typeof bookingMessageResponseSchema>;
export type BookingRevision = z.output<typeof bookingRevisionResponseSchema>;
export type Payment = z.output<typeof paymentResponseSchema>;
export type PaymentEvent = z.output<typeof paymentEventResponseSchema>;
export type PaymentMethod = z.output<typeof paymentMethodSchema>;

export type Page<Key extends string, Item> = { [K in Key]: Item[] } & { total: number; limit: number; offset: number };
export type PaymentDetails = { payment: Payment | null; payments: Payment[]; events: PaymentEvent[] };

export type ReservationReport = z.output<typeof reservationReportResponseSchema>;
export type HaircutReport = z.output<typeof haircutReportResponseSchema>;
export type EmployeeReport = z.output<typeof employeeReportResponseSchema>;
export type ClientReport = z.output<typeof clientReportResponseSchema>;
export type InvoiceReport = z.output<typeof invoiceReportResponseSchema>;
export type SalonEntry = z.output<typeof salonEntryResponseSchema>;
export type SalonEntryEvent = z.output<typeof salonEntryEventSchema>;
export type SalonReport = z.output<typeof salonReportResponseSchema>;
export type BarberCollection = z.output<typeof barberCollectionResponseSchema>;
export type BarberCollectionEvent = z.output<typeof barberCollectionEventSchema>;
export type BarberCollectionReport = z.output<typeof barberCollectionReportResponseSchema>;
export type ComprehensiveReport = z.output<typeof comprehensiveReportResponseSchema>;
