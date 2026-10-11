# Just4Kids old-app parity phases

Created: 2026-10-11. Product authority: [project-contract.md](project-contract.md). Related trackers: [backend-phases.md](backend-phases.md), [frontend-phases.md](frontend-phases.md). Repository rules: [AGENTS.md](../AGENTS.md).

## Why

The client compared the new dashboard with the old PHP system (just4kids.hodib.com) and said he cannot use the new one. He works in the old system every day and values its layout and flow. Goal: about 80% resemblance in layout and workflow, **built in this project's own design quality** (not a copy of the old styling or its bugs). The old-app capture (screenshots, HTML, notes) is kept outside this repository because it contains real customer data.

## Scope decisions (2026-10-11)

Included:

- Barber photo.
- Special-needs children count on bookings.
- Payment method on collection: cash, link, KNET.
- Client active/stopped status.
- Salon work: daily in-shop entry and its reports.
- UI parity: barber-cards home, barber-first time-slot booking, barber home cards, WhatsApp-to-barber action, fixed cancel reasons, old-style menu grouping.

Excluded: notifications, PWA install, GPS tracking (stays excluded by the contract), English/Tagalog UI (Arabic stays), delivery fee, managed areas list, customer-facing pages, any change to pricing (branch adult/child prices stay).

Contract changes this requires: payment methods other than cash (contract currently allows full cash only), and salon walk-in totals (new). Update [project-contract.md](project-contract.md) when each phase starts.

## Checklist rules

Same as the backend tracker: each phase is a vertical slice (contracts, migration, services, authorization, endpoints, tests, then web). `[x]` means implemented and verified with evidence.

## Status

| Phase | Area | Backend | Web |
| --- | --- | --- | --- |
| P1 | Barber photo | Yes | Yes |
| P2 | Special-needs children | Yes | Yes |
| P3 | Client active/stopped | Yes | Yes |
| P4 | Payment method (cash / link / KNET) | Yes | Yes |
| P5 | Salon daily work and reports | Yes | Yes |
| P6 | UI parity screens | Yes (day filter) | Yes (client review pending) |

## P1 — Barber photo

- [x] Administrator uploads, replaces, or removes a barber photo (JPEG/PNG/WEBP, max 2 MB, re-encoded and resized on save).
- [x] Stored in a persistent upload directory (new Compose volume), served through an authenticated API route; never from user-supplied paths.
- [x] Photo shown in barber lists, booking views, booking snapshots (current photo, not historical), and the barber's own profile.
- [x] Tests: type/size limits, authorization, replacement and removal, missing-file fallback.
- [x] Add the upload volume to `scripts/deploy.sh` documentation and the VPS backup notes.

Evidence (2026-10-11): `PUT /employees/:id/photo` (admin + CSRF, raw JPEG/PNG/WEBP body, 2 MB cap) re-encodes to a 512 px square JPEG through `sharp`; `DELETE` removes it; `GET /employees/:id/photo` (any signed-in user) serves the file or 404 `PHOTO_NOT_FOUND`. Files live under `UPLOADS_DIR` (`/app/uploads` in Compose, new `uploads-data` volume) as `<accountId>.jpg`, never a caller-supplied path; the dashboard keys the current photo off the assigned barber ID so booking views/snapshots always show the current photo. Web adds an avatar with initial fallback plus upload/replace/remove on the barber page, shown in barber lists, own profile, booking list/detail/invoice, and eligible-barber selection. Tests: `apps/api/tests/employee-photos.test.ts` (4) and `apps/web/tests/employee-photo.test.ts` (3). `pnpm check` green: lint, typecheck, 41 files/282 tests, build. Not yet browser-verified against real records.

Production hardening (2026-10-11, from review): `docker.api` pre-creates `/app/uploads` owned by `node` so a fresh `uploads-data` volume is writable (new volumes otherwise default to root ownership and every upload would fail). Photo decode uses `sharp.concurrency(1)` and a 24 MP input cap so an oversized phone photo cannot exhaust the API's memory. Migration `0008_robust_misty_knight.sql` adds nullable `employees.photo_updated_at`; uploads/removals set it, `employeeResponseSchema` returns it, and the web avatar appends `?v=<photoUpdatedAt>` so a replaced photo is not served from a browser image cache. Applied to test and development MySQL.

## P2 — Special-needs children

- [x] `specialChildCount` on bookings: integer, `0 ≤ special ≤ childCount`; included in create, edit, revisions, snapshots, and history.
- [x] No price change: special children are priced as children.
- [x] Reports show special-needs counts next to child counts (haircuts, barbers, branches, bookings).
- [x] Booking form, edit dialog, detail, and invoice show the count.

Evidence (2026-10-11): `specialChildCount` is a booking integer that defaults to 0 and is validated `0 ≤ special ≤ childCount` in `bookingCreateSchema` (used for create and the merged edit) plus a database check. `bookingResponseSchema`/`invoiceResponseSchema` carry it, so create, edits, revisions, history, and snapshots include it; special children are priced as children (no pricing change). Reports gained a `special` quantity beside `adult`/`child` in `shapeMeasures` (haircuts and the barber/branch/client `work` measures) and in each invoice-report entry. Web adds a bounded special-needs counter to the booking form and edit dialog (with an Arabic bound message), and shows the count on the booking detail and invoice plus the report quantity split. Migration `0009_cynical_abomination.sql` adds `bookings.special_child_count DEFAULT 0 NOT NULL` and the extended counts check; applied to test and development MySQL. Tests: `apps/api/tests/booking-special-children.test.ts` (4), contracts `bookings.test.ts` (2 new), `apps/web/tests/booking.test.ts` (count helper). `pnpm check` green: lint, typecheck, 43 files/290 tests, build. Not yet browser-verified with real records.

## P3 — Client active/stopped

- [x] `enabled` on clients; administrator can stop or reactivate with a reason recorded in history.
- [x] A stopped client cannot receive new bookings (clear Arabic error); existing bookings are unaffected.
- [x] Client list filter: all / active / stopped; badge in lists and lookup results.

Evidence (2026-10-11): `clients.enabled` (default true) plus a `client_status_events` table (enabled/previousEnabled/reason/actor/time, with a changed-state check). Administrator `PATCH /clients/:id/status` requires `{ enabled, reason }` (CSRF + admin), records the event, and returns 409 `CLIENT_STATUS_UNCHANGED` when the state already matches; `GET /clients/:id/status-events` returns the ordered history. `clientSearchSchema` gained a `status` filter (`all`/`active`/`stopped`) used by `GET /clients`. Booking creation rejects a stopped client with 409 `CLIENT_DISABLED` and a clear Arabic message; existing bookings/reads are unaffected. Migration `0010_rainy_joshua_kane.sql` adds the column and table; applied to test and development MySQL. Web adds a status filter and «موقوف» badge to the client list and booking client picker, and a stop/reactivate dialog with a required reason plus a status-history card on the client page. Tests: `apps/api/tests/client-status.test.ts` (3), contracts `clients.test.ts` (2 new/updated), `apps/web/tests/client-status.test.tsx` (2). `pnpm check` green: lint, typecheck, 45 files/296 tests, build. Not yet browser-verified with real records.

## P4 — Payment method

Decided 2026-10-11: **one method per payment**, still the full invoice amount (no split payments).

- [x] Payment `method` enum `cash | link | knet`; required when recording; shown in payment history; included in undo/reconciliation events.
- [x] Existing receipts migrate as `cash`.
- [x] Reports split collected amounts by method (barber, branch, invoices/cash reports) with totals.
- [x] Barber and administrator payment dialogs: method picker.

Evidence (2026-10-11): `paymentMethodSchema` is `cash | link | knet`; `paymentRecordSchema` now requires `method`, and `paymentResponseSchema`/`paymentEventResponseSchema` carry it. `cash_payments.method` and `cash_payment_events.method` (both enum, default `cash`) are added by migration `0011_narrow_virginia_dare.sql`, so existing receipts become `cash`; applied to test and development MySQL. Recording stores the chosen method on the receipt and its `recorded` event; booking-edit reconciliation copies the receipt's method into `extra_cash`/`refund` events; `undo` copies it into the `voided` event. Reports: `reportCashSchema` adds `byMethod: { cash, link, knet }` beside the overall `count`/`total`, computed per barber and per branch (`performanceMeasures`) and in the invoice/cash report summary; each invoice-report entry's `cash` now includes `method`. Web: `paymentMethodLabels`/`paymentMethodOptions` (`apps/web/src/lib/payments.ts`), the payment dialog gains a required method picker (default cash), the payment history shows the method on the active receipt and each event, and barber/branch/invoice reports render the method split (`CashMoney`). Tests: `apps/api/tests/payments.test.ts` (method record/undo/reconcile), contracts `payments.test.ts` + `reports.test.ts`, `apps/web/tests/payment-method.test.ts`; `performance-reports.test.ts`/`client-invoice-reports.test.ts` updated to the split. `pnpm check` green: lint, typecheck, 46 files/301 tests, build. Not yet browser-verified with real records.

## P5 — Salon daily work

Decided 2026-10-11: **one entry per branch per day**.

- [x] Daily entry: date, branch, children count, cash, link, KNET amounts (exact 3-decimal KWD), auto total, entered by, timestamps; one entry per branch per date, editable with history.
- [x] Administrator-only create/edit; listing by period.
- [x] Salon report: period filter, daily rows, totals, print.
- [x] Comprehensive report: barbers plus salon rows, per-method totals, share of total.

Evidence (2026-10-11): new `salon_entries` (branch, date, childCount, cash/link/knet, server-computed total, enteredBy, timestamps; unique per branch+date; amount and total checks) and `salon_entry_events` (before/after history) via migration `0012_certain_carlie_cooper.sql`, applied to test and development MySQL. Administrator-only `GET /api/salon?from&to&branchId` returns `{ entries, totals }`, `POST /api/salon` creates (409 `SALON_ENTRY_EXISTS` on a duplicate branch+date, 404 unknown branch), `PATCH /api/salon/:id` edits and recomputes the total (409 `SALON_ENTRY_UNCHANGED`), `GET /api/salon/:id/history` returns events; all writes need CSRF. `GET /api/reports/comprehensive?from&to&branchId` (administrator-only) returns barber rows and one salon row with per-method `{count,total}` money, a `collected` total, and a one-decimal `share` of the grand total, plus grand `totals`. Web adds an admin `/salon` entry screen (`SalonFilterBar`, create/edit dialog computing the total, period table with totals), `/reports/salon` (daily rows + totals) and `/reports/comprehensive` (summary cards + barbers/salon rows + share) in the reports tabs, and the `شغل الصالون` nav item. Tests: `apps/api/tests/salon.test.ts` (6), contracts `salon.test.ts` (5), `apps/web/tests/salon.test.ts` (2). `pnpm check` green: lint, typecheck, 49 files/314 tests, build. Not yet browser-verified with real records.

## P6 — UI parity screens (web)

Follow the old app's layout and flow with the existing design system (tokens, components, RTL, light/dark).

- [x] Navigation regrouped like the old sidebar: الحلاقون (barbers and working hours, book for a barber) · النظام (clients, branches, salon work) · التقارير (reports, salon report, comprehensive report).
- [x] Administrator home: grid of barber cards: photo, enabled state, today's current/next booking, today's count, primary action "حجز لهذا الحلاق"; quick tiles: bookings of the day, barbers' work, salon work, salon report.
- [x] Barber-first booking: pick barber → date and visit length → **30-minute time pills** built from working hours/exceptions and existing bookings (free / booked with details on tap / unavailable) → client, address, children/special/adults.
- [x] Day bookings list (old "توجيه الحجز"): per-day list with barber photo, time chip, client, counts, actions: WhatsApp to barber (prefilled booking details via `wa.me`), edit, cancel.
- [x] Cancel dialog with fixed reasons: العميل غير متواجد، العميل ألغى الحجز، لا يوجد رد على الهاتف، مشكلة في العنوان، تأخير بسبب الزحمة، مشكلة من الحلاق، سبب آخر (free text required for "سبب آخر").
- [x] Barber home: two large cards: today's bookings (open count) and today's revenue; today's visits with tap-to-call, map, visit steps, payment, cancel.
- [ ] Mobile-first check of every changed screen at 390 px (barbers use phones). Done: barber home, all-bookings list, booking page, admin home. Still to check: admin day list and new booking at 390 px.
- [ ] Client review of the home, booking, and barber screens before polishing the rest.

Evidence (2026-10-11): API `GET /bookings` accepts optional `date` and `employeeId` (`bookingListQuerySchema`); with `date` the list is in start-time order, and employees stay limited to their own bookings whatever barber they send (`apps/api/tests/bookings.test.ts`, new test). Web: `apps/web/src/lib/day.ts` holds the slot builder (same coverage and blocking rules as the API's `isWindowAvailable`), the WhatsApp message, the fixed cancel reasons, the day summary (open/active/collected), current-or-next visit, and date shifting (`apps/web/tests/day.test.ts`, 9 tests). `useDayBookings` hook; `/` is the admin barber-cards home or the barber home (`components/home.tsx`); `/bookings` has a day view (date with previous/next, barber filter, address-kept filters) and the full list; `/bookings/new` is barber-first with time pills (`?barber=` preselects); `CancelVisitDialog` replaces the free-text cancel everywhere (`components/booking-actions.tsx`); shared row/card pieces in `components/day-bookings.tsx`. Login now lands on `/`. Colours switched to the old app's palette on request: navy primary `#243165`, yellow→orange main button (`sun` → `sun-end`), light-blue highlights, matching dark theme. Browser-checked on local dev with sample data: cards, pills (booked/past/blocked for 60 minutes), creating a booking, cancel with a fixed reason saved in history, WhatsApp text, barber home at 390 px, dark mode. `pnpm check` green: lint, typecheck, 50 files/324 tests, build.
