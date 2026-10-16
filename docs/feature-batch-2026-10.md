# Feature batch 2026-10

Created: 2026-10-16. Agreed with the user in chat on 2026-10-16. Repository rules: [AGENTS.md](../AGENTS.md). Product authority: [project-contract.md](project-contract.md); update it, [backend-phases.md](backend-phases.md) and [frontend-phases.md](frontend-phases.md) where a phase below changes documented behaviour.

Phases are ordered from easiest to hardest. Each phase is a vertical slice (database → contracts → API → web → tests → docs) and is finished and verified before the next one starts.

- `[ ]` pending, `[x]` implemented and verified with evidence.
- Item 2 from the request (multiple client addresses) is **skipped** by the user's decision.
- There is no production data to preserve, so destructive migrations (drop column/table) are allowed.

## Workflow for every phase

1. Baseline: lint, typecheck, test and build are green for the touched packages before changing anything.
2. Red/green TDD in small slices: write or update the failing test first, then the code.
3. Targeted green: lint, typecheck, test and build for the touched packages only.
4. After the last phase (it touches every package), the whole repository must be green: `pnpm check`.
5. Migrations are generated with `pnpm db:generate` from the edited Drizzle schema, given a descriptive name, and applied to the test database through `pnpm db:migrate:test` (run by `pnpm test`).
6. Run commands one after another. Dev server, build and tests can conflict with each other.

## Overview

```
P1  Inputs start empty          (#9)  web only                       easy
P2  Installable app icon        (#6)  web only                       easy
P3  Booked-hour bubble          (#1)  web only                       easy
P4  Two save buttons            (#5)  web only                       easy-medium
P5  Branch = name + address     (#8)  db → contracts → api → web     medium
P6  Flexible lock (start/end)   (#3)  contracts → api → web          medium
P7  Weekday on/off              (#7)  db → contracts → api → web     medium-hard
P8  Reservations without money  (#4)  db → contracts → api → web     hard
```

---

## P1 — Inputs start empty (#9)

**Goal:** inputs that open with a pre-filled `0` or `0.000` start empty. Grey placeholder hints stay as they are.

**Current problem:** the Collections and Salon forms put real values (`"0"`, `"0.000"`) into the inputs, so the user must delete them before typing.

**Changes**
- `apps/web/src/app/(app)/collections/page.tsx`: `blank()` (line ~76) and the barber-change reset (line ~106) use `""` instead of `"0"` / `"0.000"` for `normalChildren`, `specialChildren`, `cash`, `link` and `knet`. Editing an existing collection still shows its saved values.
- `apps/web/src/app/(app)/salon/page.tsx`: `blank()` (line ~26) uses `""` for `childCount`, `cash`, `link` and `knet`.
- On submit, an empty field counts as `0` / `0.000` (normalise just before building the request). Totals shown on the form treat empty as 0.
- Validation messages stay for invalid (non-empty) values only.

**Not changed:** `placeholder="0.000"`, `+965`, search hints and the other placeholders.

**Tests:** `apps/web/tests/collections-page.test.tsx` and `apps/web/tests/salon.test.ts`: a new form renders empty inputs, and saving with empty fields sends zeros.

- [x] P1 done

---

## P2 — Installable app icon (#6)

**Goal:** the site can be added to the phone or desktop home screen as an app, with the logo as its icon. This is not a full PWA: no service worker and no offline mode.

**Icon:** the yellow tilted "4" block from the wordmark (`apps/web/src/app/icon.svg`). App name: `just4kids`.

**Changes**
- `apps/web/src/app/manifest.ts` (Next metadata route → `/manifest.webmanifest`): `name` and `short_name` = `just4kids`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `background_color` and `theme_color` matching the light theme (`#f5f7fb`), and icons as listed below.
- Committed PNGs generated once from `icon.svg`:
  - `apps/web/public/icons/icon-192.png` (192×192, `purpose: "any"`)
  - `apps/web/public/icons/icon-512.png` (512×512, `purpose: "any"`)
  - `apps/web/public/icons/icon-maskable-512.png` (512×512, logo inside the safe zone on a solid background, `purpose: "maskable"`)
  - `apps/web/src/app/apple-icon.png` (180×180, for iOS "Add to Home Screen")
- `apps/web/src/app/layout.tsx`: add `applicationName` and `appleWebApp: { capable: true, title: "just4kids", statusBarStyle: "default" }` to the metadata.
- Check that the manifest and icons load without a login: the API rewrite covers only `/api/*`, and `(app)` routes must not intercept them.

**Verify:** `next build` lists `/manifest.webmanifest`. In the browser, DevTools → Application → Manifest shows no errors and the icons render. On a phone, Chrome shows "Install app" and iOS Safari's "Add to Home Screen" shows the logo.

- [x] P2 done

---

## P3 — Booked-hour bubble (#1)

**Goal:** on the new-reservation time pills, hovering (mouse) or tapping (finger) a **booked** hour opens a dark bubble above the pill with the reservation summary. This follows the user's reference screenshot. The bubble **replaces** the details box that currently opens under the pills, and it has no link (information only).

**Bubble content (one line each):** time, client phone, area, children (special) and adults (`haircutSummary`), visit status, and notes when present. There is no "delivery" line because that field doesn't exist in this app.

**Changes**
- Add `apps/web/src/components/ui/popover.tsx` (shadcn Popover over the already installed `radix-ui` package). The Radix Tooltip in `ui/tooltip.tsx` doesn't open on touch, so it isn't used here.
- `apps/web/src/components/booking-slot-pills.tsx`:
  - booked pills are wrapped in a Popover: it opens on pointer hover (mouse), and a tap/click toggles it; it closes on outside tap, on Escape or when another pill opens. Only one is open at a time (`shown` state reused).
  - remove the details box (`details ? (...)` block) and the native `title` tooltip for booked pills.
  - booked pills stay non-selectable (they don't pick a start).
  - **Bug fix:** the locked-pill tooltip uses `?` instead of `·` (line ~93).
- Dark styling uses theme tokens (works in light and dark mode), with an arrow pointing to the pill and `side="top"` falling back to the bottom when there's no room.

**Tests:** `apps/web/tests/booking-slot-pills.test.tsx`: hover opens the bubble with the summary; click/tap toggles it; outside click closes it; the old details box is gone; the locked tooltip uses `·`.

- [x] P3 done

---

## P4 — Two save buttons (#5)

**Goal:** the single "Save reservation and send WhatsApp" button and its follow-up dialog are replaced by two buttons:

```
[ Save reservation ]               → create → toast → /bookings (today's list)
[ Save & send via WhatsApp ]       → create → record "sent to barber" → open WhatsApp to the barber → /bookings
```

**Changes**
- `apps/web/src/app/(app)/bookings/new/page.tsx`:
  - remove the "Reservation saved" dialog and the `created` / `sendProblem` dialog state.
  - **Save & send via WhatsApp** keeps today's pop-up-safe pattern from `lib/whatsapp.ts` (`sendLoggedWhatsApp`). The blank tab is reserved during the click, then the reservation is created, then the send is recorded with `useSendToBarber`, then the tab navigates to `whatsAppLink(barber.phone, booking)`. If creation fails, the tab closes and the form error shows. If only the send record fails, the reservation is already saved, so show the error with a toast and still go to `/bookings` (the barber can be messaged again from the reservation page).
  - both buttons are disabled while either is pending, and both follow the existing `ready` rules.
  - keep the existing error handling (`BARBER_UNAVAILABLE`, `PHONE_ALREADY_USED`, `CLIENT_DISABLED`, `AREA_UNAVAILABLE`).
- `docs/backend-phases.md` header: the "Save reservation and send WhatsApp" description is updated.

**Tests:** `apps/web/tests/phone-booking-page.test.tsx`: save-only goes to `/bookings` without opening a tab; WhatsApp save opens the tab, records the send and goes to `/bookings`; a failed create closes the tab.

- [x] P4 done

---

## P5 — Branch = name + address (#8)

**Goal:** a branch has only **name** and **address**. Prices and durations are deleted from the database, contracts, API and screens. "Location" is renamed to **Address** everywhere, including the database.

**Changes**
- `packages/db/src/schema/organization.ts`: drop `adult_price`, `child_price`, `adult_duration_minutes`, `child_duration_minutes` and their four CHECK constraints; rename `location` → `address` (`varchar(500)`, not null). Generate the migration and confirm it renames the column (not drop + add).
- `packages/contracts/src/organization.ts`: `branchCreateSchema` = `{ name, address }`; update and response schemas follow. Remove `kwdPriceSchema` only if nothing else uses it (bookings use it until P8; delete it in P8 if it's unused by then).
- `apps/api/src/modules/branches/*`: repository, service and controller use `name` and `address` only.
- Salon module and reports: check every branch read (salon entries and the salon/comprehensive reports) still compiles and shows the branch name.
- `apps/web/src/lib/forms.ts` (`branchFormSchema`), `apps/web/src/lib/api/types.ts`, `apps/web/src/app/(app)/branches/page.tsx`: the dialog shows Name and Address only; table columns become Name and Address; remove the price/duration text from the dialog description and the `formatKwd`/`formatDuration` imports if unused.
- Check `apps/web/src/lib/address.ts` and `apps/web/src/lib/whatsapp.ts` (both matched `location`) and change them only if they refer to branches.

**Tests:** `apps/api/tests/branches.test.ts`, `apps/api/tests/salon.test.ts`, `packages/contracts/tests/organization.test.ts`, plus web tests for the branches form: create/update with name and address; extra fields are rejected (strict schema).

- [x] P5 done

---

## P6 — Flexible lock with start and end (#3)

**Goal:** the admin locks any length of time, not only 30 minutes. In lock mode: tap a free start → pick an end (30-minute steps, only while the time stays free and inside working hours) → **Lock**. Unlocking removes the whole lock at once.

**Current state:** `employee_time_blocks` already stores `start_time` and `end_time`, so **no migration is needed**. The contract accepts only `startTime`, and the API always adds 30 minutes.

**Changes**
- `packages/contracts/src/availability.ts` `timeBlockCreateSchema`: add `endTime`; both times sit on the half-hour, `end > start`, same day.
- `apps/api/src/modules/schedules/schedule.repository.ts` `createBlock`: use `input.endTime` instead of `start + 30`; the existing conflict check (`isWindowAvailable` with working hours, bookings and other blocks) covers the whole window, and the future-start rule stays.
- `apps/web/src/lib/day.ts`: add a lock end-options helper (half-hour steps from the start until working time ends or a booking or lock starts), reusing the `buildEndOptions` logic. Check that `buildSlots` marks every half-hour inside a multi-slot block as locked (it uses an overlap test, so it should), and that tapping any of those half-hours selects the same block for unlocking.
- `apps/web/src/components/booking-slot-pills.tsx`: lock mode becomes two steps (start, then end pills), with an optional reason and a **Lock** button whose text shows the window (e.g. "Lock 4:00 pm – 5:30 pm"). The unlock text changes from "Unlock half-hour" to "Unlock" and shows the block's full window. Update the helper text ("Select a half-hour to lock…").
- `apps/web/src/lib/api/hooks.ts` `useCreateTimeBlock` payload includes `endTime`.

**Tests:** `apps/api/tests/time-blocks.test.ts` (multi-hour lock, overlap with a booking/lock/break is rejected, not on the half-hour is rejected, end ≤ start is rejected), `packages/contracts/tests/availability.test.ts`, `apps/web/tests/day.test.ts`, `apps/web/tests/booking-slot-pills.test.tsx`.

- [x] P6 done

---

## P7 — Weekday on/off (#7)

**Goal:** each of the 7 weekdays has an **Active / Inactive** switch per barber, separate from its working hours. An inactive day keeps its hours but accepts no bookings or locks.

**Rules (agreed)**
- Turning a day off is **blocked** when the barber has future bookings on that weekday (same `SCHEDULE_BOOKING_CONFLICT` behaviour as a changed shift).
- A **special-date exception** on an inactive weekday still opens that date with the exception's shifts.
- Only the **admin** changes the switches. Barbers **see** them read-only on their schedule page.
- An active day with no shifts is still closed (current behaviour).

**Changes**
- DB `packages/db/src/schema/schedules.ts`: new table `employee_work_days` (`employee_id`, `day_of_week` 0–6, `active` boolean, PK on both columns, FK to employees with cascade delete, day range CHECK). A missing row means **active**, so existing barbers stay unchanged.
- Contracts `packages/contracts/src/availability.ts`: weekly schedule request and response days gain `active: boolean`. All 7 days are always returned, so inactive days with stored hours come back too.
- API:
  - `availability.repository.ts` `readWorkingHours`: an inactive weekday gives no weekly intervals; an exception still overrides.
  - `availability.service.ts` `isWindowAvailable` and every caller (bookings, booking edits, eligibility, locks, `assertSchedulePreservesBookings`) get the active flag through `readWorkingHours`.
  - `schedule.repository.ts` replace-weekly stores the switches and intervals in the same transaction, then runs `assertSchedulePreservesBookings`.
  - schedule GET (`/:id`, `/me`) returns the switches.
- Web:
  - `apps/web/src/lib/day.ts` `workingIntervals`: inactive weekday → no intervals unless an exception exists, so slots show "day off".
  - `apps/web/src/components/schedule.tsx` `WeeklyScheduleEditor`: a Switch on each day row (shifts stay editable but dimmed while off; validation still applies to stored shifts); `WeeklyScheduleView` (barber page) shows Active/Inactive read-only.
  - `apps/web/src/lib/api/types.ts` and hooks follow the contract.

**Tests:** `apps/api/tests/schedules.test.ts` (save/read switches; turning off a day with a future booking → 409; exception on an off day opens it), `apps/api/tests/availability-service.test.ts`, `apps/api/tests/bookings.test.ts` (booking on an off day rejected), `apps/api/tests/time-blocks.test.ts`, `apps/web/tests/day.test.ts`, schedule editor and view tests.

- [ ] P7 done

---

## P8 — Reservations without money (#4)

**Goal:** a reservation has **no price, invoice or payment**. The new-reservation screen shows only the reservation summary and the two save buttons from P4. Money stays **only** where it isn't tied to a reservation: barber daily **Collections** (admin enters, barbers see), **Salon**, and the collection-based totals in the Barbers and Comprehensive reports. All of these stay unchanged.

```
REMOVE (reservation money only)              KEEP (unchanged)
 ├─ invoices table + invoice in bookings      ├─ barber_collections (+ events)
 ├─ cash_payments, cash_payment_events        ├─ salon_entries (+ events)
 ├─ Record / Void payment, method, badges     ├─ Collections + Salon pages
 ├─ edit reconciliation (extra cash/refund)   ├─ Barbers report collection cash
 ├─ /bookings/[id]/invoice page               └─ Comprehensive report
 ├─ Reports ▸ Invoices and payments page
 └─ invoice/receipt measures in Barbers and Clients reports
```

**Database** (`packages/db/src/schema`)
- `bookings.ts`: delete the `invoices` table.
- `payments.ts`: delete `cash_payments` and `cash_payment_events` (remove the file and its export from `schema/index.ts`).
- `visits.ts`: drop `previous_invoice_status` and `invoice_status` from `booking_visit_events`.
- One migration; tables that hold foreign keys are dropped first (payment events → payments → invoices).

**Contracts** (`packages/contracts/src`)
- `bookings.ts`: remove `amountCash` and `amountLink` from create schemas, `invoiceResponseSchema`, the legacy invoice snapshot preprocessing, `invoice` from `bookingResponseObjectSchema`, `reconciliation` from `bookingEditSchema`, and invoice statuses from `visitEventResponseSchema`.
- `payments.ts`: delete. `cash.ts`: keep `cashAmountSchema` if collections or salon use it; delete `cashReconciliationSchema`. Keep the cash/link/knet method enum if collections, salon or reports use it (move it into `cash.ts` if `payments.ts` was its only home).
- `reports.ts`: delete the invoice report schemas. Remove `invoices` and per-booking `cash` from `performance` (Barbers report keeps its collection `cash`, Clients report keeps work/visit counts). Update `index.ts` exports.
- `organization.ts`: delete `kwdPriceSchema` if unused.

**API** (`apps/api/src/modules`)
- `bookings/payment.service.ts`: delete, along with its routes in `bookings/index.ts`.
- `bookings/booking.repository.ts`, `booking.service.ts`: create and serialize without an invoice.
- `bookings/booking-edit.service.ts`: remove reconciliation and invoice logic.
- `bookings/visit.service.ts`: status changes no longer cancel or restore an invoice.
- `reports/report.repository.ts`, `report.service.ts`, `reports/index.ts`: delete `/reports/invoices`; remove the invoice and receipt joins and measures; keep the collection and salon measures.

**Web** (`apps/web/src`)
- `app/(app)/bookings/new/page.tsx`: remove the Cash/Link inputs, the total and the price from `ready` and the request.
- `app/(app)/bookings/[id]/page.tsx`: remove the invoice/payment card and the "View and print" link.
- Delete `app/(app)/bookings/[id]/invoice/page.tsx` and `app/(app)/reports/invoices/page.tsx`; remove the "Invoices and payments" entry and the payment-status filter in `components/reports.tsx`.
- `components/booking-actions.tsx`: delete `RecordPaymentButton` and `UndoPaymentDialog`; remove the invoice wording in the cancel/reopen confirm texts.
- `components/status.tsx` (`PaymentBadge`), `components/booking-history.tsx` (payment events), `components/booking-edit-dialog.tsx` (reconciliation), `components/day-bookings.tsx`, `components/home.tsx`, `app/(app)/bookings/page.tsx`, `app/(app)/reports/{page,clients,haircuts}.tsx`, `lib/booking-timeline.ts`, `lib/visit-rules.ts`, `lib/day.ts`: remove invoice and payment uses.
- `lib/api/hooks.ts`, `lib/api/types.ts`: delete invoice and payment hooks and types.
- `lib/money.ts`, `lib/payments.ts`: keep what Collections, Salon and reports still use; delete the rest (`typedPrice`, `invoiceTotal`, …).

**Tests**
- Delete `apps/api/tests/payments.test.ts` and the invoice parts of `apps/api/tests/client-invoice-reports.test.ts` (keep the client report parts); update `bookings`, `phone-booking`, `booking-edits`, `visits`, `performance-reports`, `reports`, `booking-tracking` and `booking-special-children` tests, the contracts tests, and the web tests (`phone-booking-page`, `day-bookings`, `booking-timeline`, `visit-rules`, `money`, `payment-method`, `report-*`).
- New assertions: creating a reservation with `amountCash` is rejected (strict schema); the booking response has no `invoice`; the payment and invoice endpoints return 404; the Barbers and Comprehensive reports still show collection totals.

**Docs:** update `project-contract.md`, `backend-phases.md` and `frontend-phases.md` wherever they describe reservation invoices, payments, reconciliation or the invoice report.

**Final gate:** `pnpm check` (lint, typecheck, test, build) is green across the whole repository.

- [ ] P8 done
