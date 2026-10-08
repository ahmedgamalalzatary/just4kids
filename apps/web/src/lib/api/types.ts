import type { z } from "zod";
import type {
  accountSchema, addressResponseSchema, bookingResponseSchema, bookingRevisionResponseSchema, branchResponseSchema, clientResponseSchema,
  clientSummarySchema, eligibilityResponseSchema, employeeResponseSchema, invoiceResponseSchema, paymentEventResponseSchema, paymentResponseSchema,
  scheduleResponseSchema, sessionResponseSchema, visitEventResponseSchema,
} from "@just4kids/contracts";

export type Account = z.output<typeof accountSchema>;
export type Session = z.output<typeof sessionResponseSchema>;
export type Branch = z.output<typeof branchResponseSchema>;
export type Employee = z.output<typeof employeeResponseSchema>;
export type Schedule = z.output<typeof scheduleResponseSchema>;
export type Eligibility = z.output<typeof eligibilityResponseSchema>;
export type ClientSummary = z.output<typeof clientSummarySchema>;
export type Client = z.output<typeof clientResponseSchema>;
export type Address = z.output<typeof addressResponseSchema>;
export type Booking = z.output<typeof bookingResponseSchema>;
export type Invoice = z.output<typeof invoiceResponseSchema>;
export type VisitEvent = z.output<typeof visitEventResponseSchema>;
export type BookingRevision = z.output<typeof bookingRevisionResponseSchema>;
export type Payment = z.output<typeof paymentResponseSchema>;
export type PaymentEvent = z.output<typeof paymentEventResponseSchema>;

export type Page<Key extends string, Item> = { [K in Key]: Item[] } & { total: number; limit: number; offset: number };
export type PaymentDetails = { payment: Payment | null; payments: Payment[]; events: PaymentEvent[] };
