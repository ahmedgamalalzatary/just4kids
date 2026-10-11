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
| P3 | Client active/stopped | No | No |
| P4 | Payment method (cash / link / KNET) | No | No |
| P5 | Salon daily work and reports | No | No |
| P6 | UI parity screens | — | No |

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

- [ ] `enabled` on clients; administrator can stop or reactivate with a reason recorded in history.
- [ ] A stopped client cannot receive new bookings (clear Arabic error); existing bookings are unaffected.
- [ ] Client list filter: all / active / stopped; badge in lists and lookup results.

## P4 — Payment method

Decided 2026-10-11: **one method per payment**, still the full invoice amount (no split payments).

- [ ] Payment `method` enum `cash | link | knet`; required when recording; shown in payment history; included in undo/reconciliation events.
- [ ] Existing receipts migrate as `cash`.
- [ ] Reports split collected amounts by method (barber, branch, invoices/cash reports) with totals.
- [ ] Barber and administrator payment dialogs: method picker.

## P5 — Salon daily work

Decided 2026-10-11: **one entry per branch per day**.

- [ ] Daily entry: date, branch, children count, cash, link, KNET amounts (exact 3-decimal KWD), auto total, entered by, timestamps; one entry per branch per date, editable with history.
- [ ] Administrator-only create/edit; listing by period.
- [ ] Salon report: period filter, daily rows, totals, print.
- [ ] Comprehensive report: barbers plus salon rows, per-method totals, share of total.

## P6 — UI parity screens (web)

Follow the old app's layout and flow with the existing design system (tokens, components, RTL, light/dark).

- [ ] Navigation regrouped like the old sidebar: الحلاقين (barbers, working hours) · النظام (clients, branches, salon work) · التقارير.
- [ ] Administrator home: grid of barber cards: photo, enabled state, today's next/current booking, today's count, primary action "حجز لهذا الحلاق"; quick tiles: bookings of the day, barbers' work, salon work, salon report.
- [ ] Barber-first booking: pick barber → date → **30-minute time pills** built from working hours/exceptions and existing bookings (free / booked with details on hover) → booking form (client phone lookup, children/adults, special, address, notes).
- [ ] Day bookings list (old "توجيه الحجز"): per-day table with barber photo, time chip, client, counts, actions: WhatsApp to barber (prefilled booking details via `wa.me`), edit, cancel.
- [ ] Cancel dialog with fixed reasons: العميل غير متواجد، العميل ألغى الحجز، لا يوجد رد على الهاتف، مشكلة في العنوان، تأخير بسبب الزحمة، مشكلة من الحلاق، سبب آخر (free text required for "سبب آخر").
- [ ] Barber home: two large cards: today's bookings (open count) and today's revenue; orders list with tap-to-call, complete, cancel.
- [ ] Mobile-first check of every changed screen at 390 px (barbers use phones).
- [ ] Client review of the home, booking, and barber screens before polishing the rest.
