# Just4Kids frontend phases

Current UI and client model (2026-10-16): the dashboard, validation/errors, dates, reports and barber WhatsApp handoff use English with a left-to-right layout. Saved user-entered text is preserved in its original language. Clients have a phone number and addresses; client names, address instructions and latitude/longitude are removed from forms, API contracts, database columns and saved reservation/revision JSON by migrations `0024_remove_client_details` and `0025_remove_client_receipt_details`. Confirmed 2026-10-16 (feature batch P8): a reservation carries **no price, invoice or payment**; the new-reservation screen shows only the reservation summary and the two save buttons, and the invoice and payment screens, badges and filters are removed. Money remains only in barber daily collections, salon entries, and the collection-based totals in the barber and comprehensive reports. The reservation action offers two buttons: **Save reservation** (save and return to today's reservations) and **Save & send via WhatsApp** (save, record the WhatsApp handoff, open WhatsApp for the barber, then return to today's reservations). This supersedes older UI/name/location/invoice descriptions below; the planned Arabic client-facing WhatsApp AI is unchanged.


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
| 5 | Manual booking (no invoice) | Yes | No |
| 6 | Visit actions and history | Yes | No |
| 7 | Reservation edits and revisions | Yes | No |
| 8 | Barber collections (reservation cash removed) | Yes | No |
| 9 | Reservation and haircut reports | Yes | No |
| 10 | Barber and branch performance reports | Yes | No |
| 11 | Client history and collection reports | Yes | No |
| 12–13 | WhatsApp booking views | No | No |

## Phase 0 — Foundation and design system

- [x] Next.js App Router app in English, left to right (`lang="en" dir="ltr"`), with Western digits.
- [x] Design tokens in `src/app/globals.css` for light and dark: teal primary, sun-yellow accent, red destructive, and visit-status colours (booked, arrived, completed, cancelled, no-show).
- [x] Readex Pro font bundled locally; type scale; print styles that force the light palette and hide navigation.
- [x] shadcn/ui components through the CLI with left-to-right configuration, adjusted for the design: flat cards, 40px inputs, English close labels, physical sheet sides, and a muted badge.
- [x] Light, dark, and system theme switch (`next-themes`).
- [x] Data layer: TanStack Query, a `/api` client with CSRF header and English error envelope, 401 sign-out, no retry on 4xx, and reload of booking data after stale-version or conflict errors.
- [x] English form validation (react-hook-form + zod) built on the shared contracts.
- [x] Exact fils money helpers and Kuwait-time helpers (dates, windows, durations).
- [x] Responsive shell: desktop sidebar, mobile header, slide-out menu, and bottom navigation.
- [x] just4kids wordmark and favicon.

## Phase 1 — Login and access

- [x] Phone/password login page that returns only to same-site paths after login.
- [x] Session gate: signed-out users go to login with a return path.
- [x] Role-aware navigation (administrator: bookings, clients, barbers, branches; barber: my bookings, my schedule, my profile) and logout.
- [x] Administrator-only pages show a clear message when a barber opens them directly.
- [x] Reports in the navigation for both roles (administrator: التقارير; barber: تقاريري).
- [ ] Verified with real records.

## Phase 2 — Branches and barbers

- [x] Branch list, create, and edit with a name and an address (adult/child prices and descriptive durations removed 2026-10-16).
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
- [x] Add and edit addresses with an optional Google Maps link.
- [ ] Verified with real records.

## Phase 5 — Manual booking (no invoice)

- [x] Bookings list grouped by visit date, with pagination.
- [x] New-booking flow in numbered steps: client, address, date and window, counts, eligible barber.
- [x] Booking detail page with visit states.
- [x] Changed 2026-10-16 (feature batch P8): the price summary, invoiced/payment states, and printable invoice are removed; a reservation has no price or invoice.
- [ ] Verified with real records.

## Phase 6 — Visit actions and history

- [x] Visit actions that follow the timing rules, with confirmations.
- [x] Administrator status correction with a required reason.
- [x] Visit history.
- [ ] Verified with real records.

## Phase 7 — Reservation edits and revisions

- [x] Administrator edit dialog (address, barber, window, counts).
- [x] Revision history.
- [x] Changed 2026-10-16 (feature batch P8): the price preview and paid-edit reconciliation are removed.
- [ ] Verified with real records.

## Phase 8 — Barber collections (reservation cash removed)

- [x] Administrator records one daily collection per barber (normal/special children, cash/link/KNET, server-computed total); barbers see only their own.
- [x] Collection history.
- [x] Changed 2026-10-16 (feature batch P8): the per-reservation full payment/undo and paid-edit reconciliation are removed; money lives only in barber collections and salon entries.
- [ ] Verified with real records.

## Phase 9 — Reservation and haircut reports

- [x] `/reports` layout shared by four tabs: title, print button, tabs, filters, and a line naming the report, date basis, range, and applied filters (shown on screen and on paper; Kuwait time).
- [x] Filters: date basis (visit date or booking-made date), from/to with a reversed-range error, search by reference or client phone, status, and source; branch and barber for the administrator only. Filters live in the page address, so tabs, links, and reloads keep them; malformed values are dropped.
- [x] Bookings report: summary of all matches (count, each visit status, manual/WhatsApp, administrator edits and status corrections) and paginated records linking to the booking page, with date, window, reference, source, creation time, edit/correction counts, and visit.
- [x] Haircuts report: totals and tables by date, branch, and barber (split per recorded branch), each with reserved, completed, open, cancelled, and no-show adult/child quantities. Rows link to the matching bookings.
- [x] Barbers see only their own work and are told so.
- [ ] Verified with real records.

## Phase 10 — Barber and branch performance reports

- [x] Barbers report (barber view: أدائي): per barber, bookings, completed visits, reserved and completed haircuts, reserved hours labelled as including travel, scheduled hours and utilisation (shown only for the visit-date basis with both dates; otherwise explained), and collected money from daily collections. Disabled barbers are marked.
- [x] Branches report: the same measures per branch, labelled by the branch recorded on each booking, with a barber breakdown table; links to the matching bookings.
- [x] Report data refreshes after booking, visit, edit, collection, salon, schedule, branch, and barber changes.
- [ ] Verified with real records.

## Phase 11 — Client history and collection reports

- [x] Clients report (العملاء): per client, contact details, bookings, completed visits (repeat visits), reserved and completed haircuts, and reserved hours; administrators can open the client's matching reservations.
- [x] Changed 2026-10-16 (feature batch P8): the "Invoices and payments" report and its payment-status filter are removed, as are the invoiced/payment measures in the Clients report. The Barbers and Comprehensive reports keep their collection-based totals.
- [x] Both pages print through the browser's normal print function; no PDF/CSV exports.
- [ ] Verified with real records.

## Fixed bugs

| Date | Bug | Fix |
| --- | --- | --- |
| 2026-10-08 | Mobile header: the menu button was on the left and the logo on the right | The menu button is now on the right and the logo on the left, matching right-to-left reading |
| 2026-10-08 | Printing on a wide (landscape) page squeezed the content into the narrow sidebar column, because the hidden sidebar left its grid column empty | The app shell is a single column when printing |
| 2026-10-08 | Durations used the wrong Arabic counted noun ("12 ساعات", "5 دقيقة") | 3–10 take the plural and 11+ the singular ("12 ساعة", "5 دقائق"); covered by `apps/web/tests/kuwait-time.test.ts` |
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

## Verification — reports (2026-10-08)

| Check | Result |
| --- | --- |
| Baseline | Full `pnpm check` green at `3e86572` |
| TDD | Report filter helpers (8 tests) and Arabic durations (2 tests) failed first, then passed. Filter form tests (5) were confirmed to fail when trimming, range blocking, or the barber scope note was removed |
| Browser | Playwright against the running development servers as the administrator: all four reports at 1440, 820, and 390 px, light and dark, and print emulation on A4 portrait and landscape. The database has no business records, so report responses were supplied with sample data inside the browser only (nothing written to the database). No horizontal page scroll; tables scroll inside their cards on screen and wrap to fit on paper. Fixed during this check: summary grid, phone booking rows, filter order, measure grouping, and the two bugs above. The local session was signed out (session 401). The barber view was checked by component tests only, as no barber account exists |
| Full repository | `pnpm check`: lint, typecheck, 38 test files/264 tests, and build passed |

## Pending

- Verify every journey with real records: booking detail, visit actions, edits, collections, salon entries, and barber views.
- Report pages were checked in the browser with sample responses only; verify them with real records, including the barber view.
