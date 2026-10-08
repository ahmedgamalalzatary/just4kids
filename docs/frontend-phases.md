# Just4Kids frontend phases

Created: 2026-10-08. Product authority: [project-contract.md](project-contract.md). Backend tracker and API handoffs: [backend-phases.md](backend-phases.md). Repository rules: [AGENTS.md](../AGENTS.md).

## Checklist rules

- `[x]` means built in `apps/web` and passing web lint, typecheck, tests, and build.
- Real-record verification is tracked separately in each phase. Until it is checked, a screen has only been checked visually as an empty state or a form.
- Docker web image and Compose checks are out of this tracker for now.
- Phases follow the backend phase numbers. A frontend phase starts only after its backend phase is complete.

## Status

| Phase | Area | Built | Verified with real records |
| --- | --- | --- | --- |
| 0 | Foundation and design system | Yes | — |
| 1 | Login and access | Yes | No |
| 2 | Branches and barbers | Yes | No |
| 3 | Working schedules and eligible barbers | Yes | No |
| 4 | Clients and addresses | Yes | No |
| 5 | Manual booking and invoice | Yes | No |
| 6 | Visit actions and history | Yes | No |
| 7 | Reservation edits and revisions | Yes | No |
| 8 | Cash payment, undo, and reconciliation | Yes | No |
| 9–10 | Reservation, haircut, barber, and branch reports (backend ready) | No | No |
| 11–13 | Client/invoice reports and WhatsApp views | No | No |

## Phase 0 — Foundation and design system

- [x] Next.js App Router app in Arabic, right to left (`lang="ar" dir="rtl"`), with Western digits.
- [x] Design tokens in `src/app/globals.css` for light and dark: teal primary, sun-yellow accent, red destructive, and visit-status colours (booked, arrived, completed, cancelled, no-show).
- [x] Readex Pro font bundled locally; type scale; print styles that force the light palette and hide navigation.
- [x] shadcn/ui components through the CLI with right-to-left configuration, adjusted for the design: flat cards, 40px inputs, Arabic close labels, physical sheet sides, and a muted badge.
- [x] Light, dark, and system theme switch (`next-themes`).
- [x] Data layer: TanStack Query, a `/api` client with CSRF header and Arabic error envelope, 401 sign-out, no retry on 4xx, and reload of booking data after stale-version or conflict errors.
- [x] Arabic form validation (react-hook-form + zod) built on the shared contracts.
- [x] Exact fils money helpers and Kuwait-time helpers (dates, windows, durations).
- [x] Responsive shell: desktop sidebar, mobile header, slide-out menu, and bottom navigation.
- [x] just4kids wordmark and favicon.

## Phase 1 — Login and access

- [x] Phone/password login page that returns only to same-site paths after login.
- [x] Session gate: signed-out users go to login with a return path.
- [x] Role-aware navigation (administrator: bookings, clients, barbers, branches; barber: my bookings, my schedule, my profile) and logout.
- [x] Administrator-only pages show a clear message when a barber opens them directly.
- [ ] Verified with real records.

## Phase 2 — Branches and barbers

- [x] Branch list, create, and edit with adult/child prices and descriptive durations.
- [x] Barber list, create, and edit (name, phone, branch, enabled) and password reset.
- [x] Barber's own profile: display name only.
- [ ] Verified with real records.

## Phase 3 — Working schedules and eligible barbers

- [x] Weekly hours editor with several shifts per day.
- [x] Dated exceptions: closed day or special hours.
- [x] Barber's own read-only schedule.
- [x] Eligible-barber selection, with each barber's branch, while booking.
- [ ] Verified with real records.

## Phase 4 — Clients and addresses

- [x] Client search and pagination.
- [x] Create a client with a first address, and edit contact details.
- [x] Add and edit addresses with a Google Maps link or coordinates.
- [ ] Verified with real records.

## Phase 5 — Manual booking and invoice

- [x] Bookings list grouped by visit date, with pagination.
- [x] New-booking flow in numbered steps: client, address, date and window, counts, eligible barber, price summary.
- [x] Booking detail page with visit, invoice, and payment states shown separately.
- [x] Printable invoice through the browser's normal print.
- [ ] Verified with real records.

## Phase 6 — Visit actions and history

- [x] Visit actions that follow the timing rules, with confirmations.
- [x] Administrator status correction with a required reason.
- [x] Visit history.
- [ ] Verified with real records.

## Phase 7 — Reservation edits and revisions

- [x] Administrator edit dialog (address, barber, window, counts) with a price preview.
- [x] Revision history.
- [ ] Verified with real records.

## Phase 8 — Cash payment, undo, and reconciliation

- [x] Full cash recording for arrived/completed unpaid visits.
- [x] Administrator undo with a required reason.
- [x] Paid-edit reconciliation: extra cash or refund preview with the exact amount and a reason.
- [x] Cash history.
- [ ] Verified with real records.

## Fixed bugs

| Date | Bug | Fix |
| --- | --- | --- |
| 2026-10-08 | Mobile header: the menu button was on the left and the logo on the right | The menu button is now on the right and the logo on the left, matching right-to-left reading |
| 2026-10-08 | New booking on phones: the date field and the from/to time fields did not open their pickers when tapped or clicked | Date and time fields now open their picker from anywhere in the field; covered by `apps/web/tests/input.test.tsx` |

## Verification — 2026-10-08

| Check | Result |
| --- | --- |
| Baseline | Web lint, typecheck, and build passed before changes (4 tasks) |
| Web tests | 8 files, 34 tests: money, Kuwait time, visit rules, booking window/pricing/reconciliation, address and shift validation, API client, login form, date/time picker opening |
| Full repository | `pnpm check`: lint, typecheck, 33 test files/217 tests, and build passed |
| Browser | Playwright screenshots at 1440, 820, and 390 px, light and dark, against the running development API: login, bookings, new booking, clients, barbers, branches, mobile menu, branch form validation. The development database held no business records and the owner chose not to create any, so only empty states and forms were checked |
| Session hygiene | The local administrator session used for screenshots was revoked (logout 204, then session 401) |

Committed as `12adfef`.

## Pending

- Verify every journey with real records: booking detail, visit actions, edits, payments, invoice printing, and barber views.
- Bookings list date/status filters: the backend phase 9 report endpoints provide them; the frontend does not use them yet.
