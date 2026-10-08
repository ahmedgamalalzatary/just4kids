"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  AddressCreate, AddressUpdate, BookingCreate, BookingEdit, BranchCreate, BranchUpdate, ClientCreate, ClientUpdate, EligibilityQuery,
  EmployeeAdminUpdate, EmployeeCreate, ScheduleException, VisitCorrection, VisitTransition, WeeklySchedule,
} from "@just4kids/contracts";
import type { ReportFilters } from "@/lib/reports";
import { apiRequest } from "./client";
import { useApiMutation } from "./session";
import type {
  Address, Booking, BookingRevision, Branch, BranchReport, Client, ClientSummary, Eligibility, Employee, EmployeeReport, HaircutReport, Page, Payment, PaymentDetails,
  ReservationReport, Schedule, VisitEvent,
} from "./types";

export const keys = {
  branches: ["branches"] as const,
  employees: ["employees"] as const,
  employee: (id: string) => ["employees", id] as const,
  myEmployee: ["employees", "me"] as const,
  schedule: (id: string) => ["schedules", id] as const,
  mySchedule: ["schedules", "me"] as const,
  eligible: (query: EligibilityQuery) => ["availability", query] as const,
  clients: ["clients"] as const,
  clientList: (q: string, offset: number) => ["clients", "list", q, offset] as const,
  client: (id: string) => ["clients", id] as const,
  bookings: ["bookings"] as const,
  bookingList: (offset: number) => ["bookings", "list", offset] as const,
  booking: (id: string) => ["bookings", id] as const,
  reports: ["reports"] as const,
};

const PAGE_SIZE = 20;
export { PAGE_SIZE };

// Branches -------------------------------------------------------------------

export function useBranches(enabled = true) {
  return useQuery({ queryKey: keys.branches, queryFn: ({ signal }) => apiRequest<{ branches: Branch[] }>("/branches", { signal }).then(result => result.branches), enabled });
}

export function useCreateBranch() {
  return useApiMutation((input: BranchCreate, csrfToken) => apiRequest<Branch>("/branches", { method: "POST", body: input, csrfToken }), { invalidate: () => [keys.branches] });
}

export function useUpdateBranch() {
  return useApiMutation(({ id, ...input }: BranchUpdate & { id: string }, csrfToken) => apiRequest<Branch>(`/branches/${id}`, { method: "PATCH", body: input, csrfToken }), {
    invalidate: () => [keys.branches, keys.employees, keys.reports],
  });
}

// Employees ------------------------------------------------------------------

export function useEmployees(enabled = true) {
  return useQuery({ queryKey: keys.employees, queryFn: ({ signal }) => apiRequest<{ employees: Employee[] }>("/employees", { signal }).then(result => result.employees), enabled });
}

export function useEmployee(id: string) {
  return useQuery({ queryKey: keys.employee(id), queryFn: ({ signal }) => apiRequest<Employee>(`/employees/${id}`, { signal }) });
}

export function useMyEmployee(enabled = true) {
  return useQuery({ queryKey: keys.myEmployee, queryFn: ({ signal }) => apiRequest<Employee>("/employees/me", { signal }), enabled });
}

export function useCreateEmployee() {
  return useApiMutation((input: EmployeeCreate, csrfToken) => apiRequest<Employee>("/employees", { method: "POST", body: input, csrfToken }), { invalidate: () => [keys.employees] });
}

export function useUpdateEmployee() {
  return useApiMutation(({ id, ...input }: EmployeeAdminUpdate & { id: string }, csrfToken) => apiRequest<Employee>(`/employees/${id}`, { method: "PATCH", body: input, csrfToken }), {
    invalidate: () => [keys.employees, keys.reports],
  });
}

export function useResetEmployeePassword() {
  return useApiMutation(({ id, password }: { id: string; password: string }, csrfToken) => apiRequest<void>(`/employees/${id}/reset-password`, { method: "POST", body: { password }, csrfToken }));
}

export function useUpdateMyName() {
  return useApiMutation((input: { displayName: string }, csrfToken) => apiRequest<Employee>("/employees/me", { method: "PATCH", body: input, csrfToken }), {
    invalidate: () => [keys.myEmployee, keys.reports],
  });
}

// Schedules ------------------------------------------------------------------

export function useSchedule(id: string) {
  return useQuery({ queryKey: keys.schedule(id), queryFn: ({ signal }) => apiRequest<Schedule>(`/schedules/${id}`, { signal }) });
}

export function useMySchedule(enabled = true) {
  return useQuery({ queryKey: keys.mySchedule, queryFn: ({ signal }) => apiRequest<Schedule>("/schedules/me", { signal }), enabled });
}

export function useReplaceWeekly() {
  return useApiMutation(({ id, ...input }: WeeklySchedule & { id: string }, csrfToken) => apiRequest<Schedule>(`/schedules/${id}/weekly`, { method: "PUT", body: input, csrfToken }), {
    invalidate: (_output, input) => [keys.schedule(input.id), ["availability"], keys.reports],
  });
}

export function useReplaceException() {
  return useApiMutation(({ id, date, ...input }: ScheduleException & { id: string; date: string }, csrfToken) =>
    apiRequest<Schedule>(`/schedules/${id}/exceptions/${date}`, { method: "PUT", body: input, csrfToken }), {
    invalidate: (_output, input) => [keys.schedule(input.id), ["availability"], keys.reports],
  });
}

export function useDeleteException() {
  return useApiMutation(({ id, date }: { id: string; date: string }, csrfToken) => apiRequest<void>(`/schedules/${id}/exceptions/${date}`, { method: "DELETE", csrfToken }), {
    invalidate: (_output, input) => [keys.schedule(input.id), ["availability"], keys.reports],
  });
}

export function useEligibleBarbers(query: EligibilityQuery | null) {
  return useQuery({
    queryKey: query ? keys.eligible(query) : ["availability", "idle"],
    queryFn: ({ signal }) => apiRequest<Eligibility>("/availability/eligible", { query: query ?? {}, signal }),
    enabled: query !== null,
    staleTime: 0,
  });
}

// Clients --------------------------------------------------------------------

export function useClients(q: string, offset: number) {
  return useQuery({
    queryKey: keys.clientList(q, offset),
    queryFn: ({ signal }) => apiRequest<Page<"clients", ClientSummary>>("/clients", { query: { q, limit: PAGE_SIZE, offset }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useClient(id: string | null) {
  return useQuery({ queryKey: keys.client(id ?? ""), queryFn: ({ signal }) => apiRequest<Client>(`/clients/${id}`, { signal }), enabled: id !== null });
}

export function useCreateClient() {
  return useApiMutation((input: ClientCreate, csrfToken) => apiRequest<Client>("/clients", { method: "POST", body: input, csrfToken }), { invalidate: () => [keys.clients] });
}

export function useUpdateClient() {
  return useApiMutation(({ id, ...input }: ClientUpdate & { id: string }, csrfToken) => apiRequest<Client>(`/clients/${id}`, { method: "PATCH", body: input, csrfToken }), {
    invalidate: () => [keys.clients],
  });
}

export function useAddAddress() {
  return useApiMutation(({ clientId, ...input }: AddressCreate & { clientId: string }, csrfToken) =>
    apiRequest<Address>(`/clients/${clientId}/addresses`, { method: "POST", body: input, csrfToken }), {
    invalidate: (_output, input) => [keys.client(input.clientId)],
  });
}

export function useUpdateAddress() {
  return useApiMutation(({ clientId, addressId, ...input }: AddressUpdate & { clientId: string; addressId: string }, csrfToken) =>
    apiRequest<Address>(`/clients/${clientId}/addresses/${addressId}`, { method: "PATCH", body: input, csrfToken }), {
    invalidate: (_output, input) => [keys.client(input.clientId)],
  });
}

// Bookings -------------------------------------------------------------------

export function useBookings(offset: number) {
  return useQuery({
    queryKey: keys.bookingList(offset),
    queryFn: ({ signal }) => apiRequest<Page<"bookings", Booking>>("/bookings", { query: { limit: PAGE_SIZE, offset }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useBooking(id: string) {
  return useQuery({ queryKey: keys.booking(id), queryFn: ({ signal }) => apiRequest<Booking>(`/bookings/${id}`, { signal }) });
}

export function useBookingHistory(id: string) {
  return useQuery({ queryKey: [...keys.booking(id), "history"], queryFn: ({ signal }) => apiRequest<{ events: VisitEvent[] }>(`/bookings/${id}/history`, { signal }).then(result => result.events) });
}

export function useBookingRevisions(id: string) {
  return useQuery({ queryKey: [...keys.booking(id), "revisions"], queryFn: ({ signal }) => apiRequest<{ revisions: BookingRevision[] }>(`/bookings/${id}/revisions`, { signal }).then(result => result.revisions) });
}

export function useBookingPayments(id: string) {
  return useQuery({ queryKey: [...keys.booking(id), "payments"], queryFn: ({ signal }) => apiRequest<PaymentDetails>(`/bookings/${id}/payments`, { signal }) });
}

// Every booking write refreshes the whole booking (detail, history, revisions, payments), the lists, and the reports.
const bookingWrites = (id: string) => [keys.booking(id), [...keys.bookings, "list"], ["availability"], keys.reports] as const;

export function useCreateBooking() {
  return useApiMutation((input: BookingCreate, csrfToken) => apiRequest<Booking>("/bookings", { method: "POST", body: input, csrfToken }), {
    invalidate: () => [[...keys.bookings, "list"], ["availability"], keys.reports],
  });
}

export function useVisitTransition() {
  return useApiMutation(({ id, ...input }: VisitTransition & { id: string }, csrfToken) => apiRequest<Booking>(`/bookings/${id}/visit`, { method: "POST", body: input, csrfToken }), {
    invalidate: (_output, input) => bookingWrites(input.id),
  });
}

export function useVisitCorrection() {
  return useApiMutation(({ id, ...input }: VisitCorrection & { id: string }, csrfToken) => apiRequest<Booking>(`/bookings/${id}/visit/correction`, { method: "POST", body: input, csrfToken }), {
    invalidate: (_output, input) => bookingWrites(input.id),
  });
}

export function useEditBooking() {
  return useApiMutation(({ id, ...input }: BookingEdit & { id: string }, csrfToken) => apiRequest<Booking>(`/bookings/${id}`, { method: "PATCH", body: input, csrfToken }), {
    invalidate: (_output, input) => bookingWrites(input.id),
  });
}

export function useRecordPayment() {
  return useApiMutation(({ id, expectedVersion }: { id: string; expectedVersion: number }, csrfToken) =>
    apiRequest<{ booking: Booking; payment: Payment }>(`/bookings/${id}/payment`, { method: "POST", body: { expectedVersion }, csrfToken }), {
    invalidate: (_output, input) => bookingWrites(input.id),
  });
}

export function useUndoPayment() {
  return useApiMutation(({ id, ...input }: { id: string; expectedVersion: number; paymentId: string; reason: string }, csrfToken) =>
    apiRequest<{ booking: Booking; payment: Payment }>(`/bookings/${id}/payment/undo`, { method: "POST", body: input, csrfToken }), {
    invalidate: (_output, input) => bookingWrites(input.id),
  });
}

// Reports --------------------------------------------------------------------

function useReport<T>(path: string, filters: ReportFilters, page?: { offset: number }) {
  return useQuery({
    queryKey: [...keys.reports, path, filters, page?.offset ?? null],
    queryFn: ({ signal }) => apiRequest<T>(`/reports/${path}`, { query: { ...filters, ...(page ? { limit: PAGE_SIZE, offset: page.offset } : {}) }, signal }),
    placeholderData: keepPreviousData,
  });
}

export const useReservationReport = (filters: ReportFilters, offset: number) => useReport<ReservationReport>("reservations", filters, { offset });
export const useHaircutReport = (filters: ReportFilters) => useReport<HaircutReport>("haircuts", filters);
export const useEmployeeReport = (filters: ReportFilters) => useReport<EmployeeReport>("employees", filters);
export const useBranchReport = (filters: ReportFilters) => useReport<BranchReport>("branches", filters);
