# Just4Kids backend phases

Current UI and client model (2026-10-16): the dashboard, validation/errors, dates, reports and barber WhatsApp handoff use English with a left-to-right layout. Saved user-entered text is preserved in its original language. Clients have a phone number and addresses; client names, address instructions and latitude/longitude are removed from forms, API contracts, database columns and saved reservation/revision JSON by migrations `0024_remove_client_details` and `0025_remove_client_receipt_details`. Confirmed 2026-10-16 (feature batch P8): a reservation carries **no price, invoice or payment**; the `invoices`, `cash_payments` and `cash_payment_events` tables and the invoice/cash-payment endpoints and reports are removed, and saving creates the reservation and initial history atomically. Money remains only in barber daily collections and salon entries and their report measures. The reservation action offers two buttons: **Save reservation** (save and return to today's reservations) and **Save & send via WhatsApp** (save, record the WhatsApp handoff, open WhatsApp for the barber, then return to today's reservations). This supersedes older UI/name/location/invoice descriptions below. Confirmed 2026-10-21: the Arabic client-facing WhatsApp AI only collects booking requests and hands them to staff; it does not book (phase 12 below; phase 13 is removed).


Created: 2026-09-29. Product authority: [project-contract.md](project-contract.md). Frontend tracker: [frontend-phases.md](frontend-phases.md). Repository rules: [AGENTS.md](../AGENTS.md). Setup commands: [README.md](../README.md).

## Scope and checklist rules

The initial task covered documentation and setup verification. Backend phases 1–10 are now implemented, including phase 7 paid-edit reconciliation through phase 8. Feature batch P8 (2026-10-16) removes reservation price, invoice and payment entirely (`invoices`, `cash_payments` and `cash_payment_events` tables, the invoice/payment endpoints, and the invoice/cash report); barber collections and salon entries remain. The employee phone-change/login race found during the 2026-10-02 review is fixed with a real-MySQL regression test. Phase 5 completes phase 3's booking-aware eligibility and schedule-edit protection; phase 6 adds visit actions, corrections, and history. On 2026-10-08 the user requested the web frontend for the completed backend phases 1–8 and then the phase 9–10 reports; its foundation, screens, and report pages are implemented and tracked in [frontend-phases.md](frontend-phases.md). Per-slice frontend and whole-slice acceptance items stay unchecked until verified with real records end to end.

Backend work covers `apps/api`, backend contracts in `packages/contracts`, `packages/db`, and necessary backend configuration/dependencies/documentation. Frontend work in `apps/web` is done only when the user explicitly requests it, as on 2026-10-08. Do not change `apps/web` or frontend dependencies as part of backend-only work.

Each feature slice describes a usable journey across backend and frontend. Finish and verify the backend for that journey together, including contracts, migrations, services, authorization, endpoints, and tests; then the frontend can consume it without waiting for an unrelated backend phase. Avoid separate project-wide schema, API, or UI implementation phases.

- `[x]` means implemented and verified, with evidence. Existing scaffolding does not establish feature completion.
- `[ ]` means pending, including all frontend work in this document.
- A backend-complete slice is ready for frontend integration. The **whole slice remains incomplete** until its frontend and end-to-end acceptance are also complete.
- Phase 0 and the final production phase are shared prerequisites/completion gates; the intervening phases are vertical product slices.
- Add/install/configure pinned backend dependencies when the consuming slice needs them, updating the lockfile and environment examples together. Do not preinstall speculative integrations.
- Each slice introduces its own database migrations. Preserve historical data; do not replace the empty scaffold with every future table at once.
- Pending contract proposals are decision gates, not approved implementation rules. Confirm them before dependent implementation.

## Inspected project state

Current backend state reviewed on 2026-10-02; frontend and container entries retain their earlier inspection status:

| Area | Existing state |
| --- | --- |
| Workspace | pnpm/Turborepo monorepo; pinned versions, lint/typecheck/build/test commands |
| API | Express infrastructure; authentication, branches, employees, schedules, clients/addresses, reservations, visit actions/corrections/history, reservation edits/revisions, barber collections, salon entries, and reservation/haircut/barber/collection reports implemented |
| Contracts | Zod health, auth, branch, employee, schedule, eligibility, client/address, booking, visit mutation/history, reservation edit/revision, barber collection, salon entry, and report filter/response contracts |
| Database | Drizzle/mysql2; auth (0000), branch/employee (0001), schedule (0002), client/address (0003), booking (0004), visit history/version (0005), reservation revisions (0006), barber collections/events, salon entries/events, branch address, work-day switches; reservation money removed in feature batch P8 |
| Tests | Auth/organization/schedule/client/booking behavior, shared contracts, and real isolated MySQL checks, including concurrency and rollback |
| Frontend | English LTR dashboard for backend phases 1–10 with shadcn/ui, design tokens, light/dark themes; checks and RTL shell verified, journeys with real records not yet verified |
| Containers | Separate API/web Dockerfiles, Compose, secret-excluding Docker ignore file; execution unverified |
| Local tools | Node `24.14.0`, pnpm `12.4.1`, MySQL listener on port `3306`; Docker command unavailable |
| Business features | Backend phases 1–12 implemented (phase 12 awaits a real OpenWA/AI check); phase 13 removed (2026-10-21); phase 14 and all frontend journeys pending |

No existing frontend item is marked complete. Its scaffold has been inspected for context only.

## Phase 0 — Verified development foundation

Outcome: backend development and isolated tests can run from the documented workspace.

Backend/setup checklist:

- [x] Verify/install the locked API dependency graph, including contracts, database, and shared config.
- [x] Verify local Node/pnpm versions against repository pins.
- [x] Verify root `.env` development database connectivity without exposing credentials.
- [x] Verify `.env.test` selects `just4kids_test` and real database tests connect there.
- [x] Verify API/contracts/database lint, typecheck, tests, and builds sequentially.
- [x] Verify compiled API liveness and JSON infrastructure behavior.
- [x] Verify environment files stay ignored and no frontend files are changed.
- [x] Verify the API production deployment package and its runtime imports/HTTP health without Docker.
- [ ] Verify the API production image using Docker when Docker is available.

Frontend checklist (separate owner):

- [x] Verify frontend dependency installation, lint, typecheck, tests, and build.
- [x] Verify English LTR responsive shell and same-origin API proxy in the browser.
- [ ] Verify the web production image and Compose integration when Docker is available.

Acceptance:

- [ ] Both applications run together with isolated tests and verified container packaging.

## Phase 1 — Administrator login and access protection

Depends on: phase 0 backend checks. Decisions confirmed: seven-day MySQL-backed HttpOnly cookie sessions; production Secure/`__Host-` cookies; env-synchronized sole administrator; international phone format; administrator-managed employee credential resets. Employee phone/profile editing remains in phase 2.

Outcome: the sole administrator can sign in safely and protected records require the correct role and owner.

Backend checklist:

- [x] Add account/session contracts, persistence, migrations, and safe password storage for the selected authentication design.
- [x] Provide environment-based setup/update for exactly one administrator; prevent a second administrator and public registration.
- [x] Implement phone/password login, current-account lookup, logout, and seven-day absolute session expiry/revocation.
- [x] Implement reusable administrator/employee authorization and account ownership checks. Each future record endpoint must enforce ownership using its database record's owner.
- [x] Configure login-abuse limits, pre-login/session CSRF tokens, same-origin checks, secure production cookies, and required environment validation.
- [x] Test invalid login, expiry/logout, origin/CSRF denial, role and ownership boundaries, environment credential rotation, and sole-admin integrity; pass targeted checks.

Frontend checklist:

- [ ] Build the shared English phone/password login page, session handling, logout, and role-aware navigation.
- [ ] Show usable authentication/authorization errors and expired-session behavior on all screen sizes.

Acceptance:

- [ ] Administrator can log in/out through the dashboard; unauthenticated or unauthorized users cannot obtain protected records.

Backend evidence: migration `0000_massive_white_tiger.sql` applied to development and isolated test MySQL; live API login/session against the development administrator passed. API, DB, and contract tests plus lint/typecheck/build passed for the touched workspaces. The local administrator credentials are editable only in ignored `.env`; production requires a separate stronger password and HTTPS `APP_ORIGIN`. No frontend login page or client-side handling was implemented.

Verification follow-up (2026-10-02): the review found a session-creation race with phase 2 employee phone changes. Session creation now rechecks the verified phone, enabled status, and password hash under the account lock; the real-MySQL regression test rejects the old-phone login and verifies that login with the new phone succeeds.

## Phase 2 — Branches, prices, and employee accounts

Depends on: phase 1. Decisions confirmed: employee self-edits display name only; administrator changes phone/branch/active status and resets passwords; branches use name, location/address, adult/child KWD prices, and descriptive haircut durations (amended 2026-10-16: the prices and durations were removed; a branch is now name and address). No other branch settings are required in this phase.

Outcome: administrator creates branches and barbers; each barber signs in and can edit only permitted profile details.

Backend checklist:

- [x] Add branch/employee contracts, tables, migrations, and authorized list/detail/create/update operations.
- [x] Store branch adult/child prices exactly and descriptive haircut durations; prohibit floating-point money totals.
- [x] Link each employee to a branch and provide administrator-managed credentials/reset operations under the agreed policy.
- [x] Enforce exactly the administrator and employee roles; restrict employee reads/edits to permitted own-profile fields.
- [x] Keep stable branch/account IDs on employee transfer and branch price changes. Booking/invoice snapshots preserving historical attribution and prices are explicitly required in phase 5, when bookings exist.
- [x] Test branch pricing validation, account creation/reset, profile restrictions, cross-employee denial, and transfers; pass targeted checks.
- [x] Prevent an in-progress login using an employee's old phone from creating a valid session after an administrator phone change; add regression coverage for this sequence and pass targeted checks.

Frontend checklist:

- [ ] Build branch/pricing management and employee/account management for the administrator.
- [ ] Build the employee's own permitted profile screen and role-specific navigation.

Acceptance:

- [ ] Administrator manages a branch and barber; that barber signs in and cannot edit another employee or branch prices.

Backend evidence: migration `0001_dazzling_power_pack.sql` applied to development and isolated test MySQL. Live authenticated branch and employee list requests passed against the development database. Admin create/update/reset, employee login/own display-name update, CSRF, ownership, duplicate-phone rollback, transfer, and session-revocation tests pass. Backend targeted lint/typecheck/tests/build and whole-repository lint/typecheck/tests/build passed (62 tests). No branch or employee business records were invented in the development database, no frontend source was changed, and frontend/whole-slice items remain pending.

Race fix evidence (2026-10-02): the regression test verified old-phone credentials, changed the phone through the real employee repository, then resumed the real session-creation path against `just4kids_test`. It failed before the fix because login succeeded. `auth.repository.ts` now compares the verified phone as well as enabled status and password hash under the account lock. The regression now passes, old-phone login fails, and new-phone login succeeds. Targeted API lint/typecheck/build and authentication/employee checks passed; the final repository verification is recorded with phase 5 below. Phase 2 backend completion is restored; frontend and whole-slice acceptance remain pending.

## Phase 3 — Working schedules and eligible barbers

Depends on: phase 2. Confirmed: `Asia/Kuwait` local date/time, same-day shifts/windows, adjacent windows allowed, booked/arrived/completed block the original window, cancelled/no-show release it, and schedule edits that would exclude a blocking booking whose reserved end is still in the future are refused. Weekly hours have dated exceptions.

Outcome: administrator controls working availability; a requested window returns eligible barbers and their branches.

Backend checklist:

- [x] Add weekly and dated-exception contracts, persistence, migration, and administrator schedule operations; allow employee own-schedule reads only.
- [x] Implement a shared availability decision reusable by manual booking, AI booking, rescheduling, and reassignment.
- [x] Complete booking-aware integration in phase 5: load blocking reservations for eligibility and transactional booking decisions, and refuse schedule edits that would exclude an existing blocking booking whose reserved end is still in the future.
- [x] Validate the entire requested window against working shifts/date exceptions and the confirmed blocking/released visit-state policy in the shared decision.
- [x] Enforce inclusive 20-minute to 4-hour bounds independently of counts and descriptive haircut durations.
- [x] Return enabled eligible barbers with their branch; do not calculate travel time or add buffers outside the selected window.
- [x] Test schedule boundaries, overlap/adjacency, Kuwait calendar dates, invalid windows, and ownership; pass targeted checks.

Frontend checklist:

- [ ] Build administrator schedule editing and the employee's own schedule view.
- [ ] Build date/window selection and eligible barber selection showing each branch.

Acceptance:

- [ ] Working-hour changes and requested windows produce the same eligibility results used by later booking actions.

Original backend evidence: migration `0002_sour_oracle.sql` applied to development and isolated test MySQL; a subsequent `pnpm db:generate` found no schema drift. Authenticated schedule read/write and eligible-barber API tests, exact-window contract tests, shared visit-state overlap tests, and real database schema tests passed. Targeted backend lint/typecheck/tests/build passed (contracts 23, database 9, API 44 tests); full `pnpm lint`, `pnpm typecheck`, `pnpm test` (76 tests), and `pnpm build` passed. The API production dependency package loaded and served `/health`.

Phase 5 integration evidence (2026-10-02): eligibility reads working hours, exceptions, and saved reservations in one database transaction. Booking creation and all schedule mutations share account-then-employee locks. At that point, weekly replacement, exception replacement, and exception deletion rechecked every existing blocking booking and rolled back with `SCHEDULE_BOOKING_CONFLICT` (409) if the edited hours exclude it. Real-MySQL tests cover blocking/released visit states, refused weekly/dated edits, refused restoration of weekly hours, and booking-versus-closure races. Frontend and whole-slice acceptance remain pending.

CodeRabbit follow-up (2026-10-02): `coderabbit review --committed --base backup-main --agent --fresh` reviewed the three commits through `8e64878` and returned one major finding: historical blocking visits permanently prevented new weekly hours. The owner confirmed that ended reservation windows must not prevent schedule changes. The guard now queries today/future dates in Kuwait, skips windows at or past their end, and reuses working hours per date. Six real-MySQL regression cases failed before the fix and pass afterward, covering past booked/arrived/completed records, unchanged invoice/history, Kuwait midnight, ongoing windows, and the exact end boundary. Targeted booking/visit/schedule tests passed (3 files, 39 tests); forced backend lint/typecheck/build passed (11 tasks). No migration or frontend changes are required.

Weekday switches (2026-10-16, feature batch P7): migration `0029_add_employee_work_days` adds `employee_work_days` (a missing row means active). Weekly schedule request and response days carry `active`; an inactive weekday returns no weekly intervals while a dated exception still overrides. `readWorkingHours` and the eligibility read apply the flag for bookings, edits, locks, restoration, and schedule guards. Save/read switches, a future-booking conflict on turning a day off, and an exception reopening an inactive day are covered by API tests.

## Phase 4 — Clients and usable service addresses

Depends on: phase 1. Confirmed: one client per international-format phone; each address requires area, block, street, and house number or building name. Optional location data is a Google Maps link.

Outcome: administrator maintains the primary contact and reusable visit addresses.

Backend checklist:

- [x] Add client/address contracts, tables, migration, and administrator search/list/detail/create/update operations.
- [x] Support area, block, street, house number or building name, optional floor/apartment.
- [x] Accept a Google Maps link alongside usable visit details; floor/apartment are optional.
- [x] Support unique primary-contact phone lookup/reuse for the later WhatsApp journey behind administrator authorization and an internal service.
- [x] Expose complete address records for phase 5 to snapshot; do not add child profiles. Phase 5 now saves the selected address in the reservation transaction.
- [x] Test contact/address validation, lookup, role boundaries, and snapshot-ready data; pass targeted checks.

Frontend checklist:

- [ ] Build client search/list/details and contact/address editing.
- [ ] Build reusable address selection and location/link inputs appropriate to property type.

Acceptance:

- [ ] Administrator can find and update a client with a usable home-visit address without losing historical visit details.

Original backend evidence: migration `0003_easy_lucky_pierre.sql` applied to development and isolated test MySQL; `pnpm db:generate` found no schema drift. Administrator client/address API operations, strict contracts, exact phone lookup, duplicate-phone rollback, literal search terms, address ownership, and real database schema tests passed. Targeted backend lint/typecheck/tests/build passed (contracts 27, database 11, API 48 tests); full `pnpm lint`, `pnpm typecheck`, `pnpm test` (86 tests), and `pnpm build` passed. The API production dependency package loaded and served `/health`. Phase 5 now verifies saved client/address snapshots remain unchanged after current records are edited. Frontend and whole-slice acceptance remain pending.

## Phase 5 — Manual reservation and its initial invoice

> Superseded 2026-10-16 by feature batch P8: a reservation has no invoice or payment. The notes below record the original phase-5 implementation and are kept for history.

Depends on: phases 2–4. Decisions confirmed on 2026-10-02: initial invoices contain booking reference, issue date, saved client/address/barber/branch details, adult/child quantities and unit prices, line amounts, and KWD total, with no tax or extra business/tax fields. New bookings must start strictly in the future in Kuwait, with no extra lead-time cutoff.

Outcome: administrator books one client with one barber/window/address and receives one combined invoice immediately.

Backend checklist:

- [x] Add booking/invoice contracts, tables, migrations, readable booking references, source attribution, and authorized list/detail operations.
- [x] Validate integer non-negative adult/child counts with at least one haircut, one barber, one address, and one shared window.
- [x] Recheck availability inside the booking transaction and serialize conflicting writes for the same barber.
- [x] Use the phase 3 shared availability decision with blocking reservation rows in eligible-barber reads and booking transactions; reject schedule edits that would exclude an existing blocking booking whose reserved end is still in the future while holding the same employee lock.
- [x] Atomically save reservation and invoice; roll back both on failure.
- [x] Snapshot address, employee/branch attribution, counts, and agreed unit prices; compute exact totals from branch prices.
- [x] Copy the selected client's address into the reservation transaction so later client/address edits do not change past visit details.
- [x] Expose booking/invoice detail and print-ready data, separate visit/invoice/payment states, and employee-own record reads.
- [x] Keep the creation service reusable by AI with actor/client authorization enforced outside model control.
- [x] Test simultaneous conflicting bookings, rollback, endpoint boundaries, snapshots, one invoice, and direct-record ownership.
- [x] Explicitly test that three 20-minute haircuts can fit an otherwise available 20-minute window under the contract; pass targeted checks.

Frontend checklist:

- [ ] Build administrator booking creation, eligible barber selection, price review, reservation list/detail, and employee-own reservation views.
- [ ] Build the combined English invoice view with normal browser print/Save as PDF.
- [ ] Display backend conflict/validation errors and a booking reference only after creation succeeds.

Acceptance:

- [ ] One manual submission produces one reservation and invoice; simultaneous overlapping submissions cannot both succeed.

Backend handoff: administrator `POST /api/bookings` accepts `{ clientId, addressId, employeeId, date, startTime, endTime, adultCount, childCount }` and returns 201 with a committed booking, `J4K-` reference, saved snapshots, and nested invoice. `GET /api/bookings?limit=20&offset=0` returns `{ bookings, total, limit, offset }`; `GET /api/bookings/:id` and `GET /api/bookings/:id/invoice` enforce assigned-employee ownership, while administrator reads span all records. All browser writes require the session CSRF token and matching origin. Input/source/price injection is rejected; non-future starts return `BOOKING_START_NOT_FUTURE` (400), conflicts/disabled barbers return `BARBER_UNAVAILABLE` (409), and missing client/address/employee/branch records return their corresponding 404 codes. Invoice data includes all confirmed fields and exact KWD line amounts/total. Initial states are visit `booked`, invoice `issued`, and payment `unpaid`; phase 6 now provides visit/history endpoints, while phases 7–8 now provide reservation-edit and cash endpoints. The internal AI context requires a trusted sender client ID and administrator service account and assigns source itself; WhatsApp onboarding/webhooks/idempotency remain phase 12.

Backend evidence (2026-10-02): migration `0004_brown_the_fallen.sql` creates booking/invoice tables, restrictive history foreign keys, a unique booking reference, one-invoice-per-booking uniqueness, counts/window constraints, and exact decimal amounts. Real-MySQL booking tests verify one invoice, concurrent overlap rejection, adjacent windows, 20-minute/four-hour bounds, counts independent of duration, transactional rollback on invoice failure, employee ownership, schedule conflicts/races, trusted AI source/client scope, large exact totals, and snapshots after client/address/branch/employee edits and transfer. No new dependency or environment setting is required. Frontend and whole-slice acceptance remain unchecked.

Final verification (2026-10-02):

| Check | Result |
| --- | --- |
| Targeted backend lint/typecheck/build | `pnpm exec turbo run lint typecheck build --filter='@just4kids/api...' --concurrency=1 --force`: 11/11 tasks passed without cached results |
| Booking tests | 14 API tests and 10 contract tests passed; the phone-change regression also passed |
| Full repository checks | `pnpm lint`, `pnpm typecheck`, `pnpm test` (21 files, 113 tests), and `pnpm build` passed |
| Migrations | `pnpm db:migrate:test` and `pnpm db:migrate` succeeded; booking/invoice migration applied to isolated test and development MySQL |
| Compiled development API | Temporary local compiled API served administrator login and authenticated booking list with 200; both new tables were present; server closed and test login logged out |
| Change scope | Backend source/contracts/schema/migration/tests and documentation only; no frontend source, dependency, environment, or Git commit changes |

Verification cleanup: the initial missing-table red test left its temporary fixture when teardown failed. Teardown now checks table availability, the exact leftover fixture was removed from `just4kids_test`, and schedule tests plus the final full suite passed afterward. No development business records were created by the verification.

## Phase 6 — Employee visit workflow and cancellation history

Depends on: phase 5. Decisions confirmed on 2026-10-02: booked → arrived/cancelled/no-show; arrived → completed/cancelled/no-show. Normal arrival/completion require the reserved start to have been reached; no-show requires the end to have been reached. Employees cannot change terminal states. Administrator corrections can change any state with a required reason and availability recheck when restoring a blocking state; reopening restores the existing invoice and preserves cash/payment history. Clients may cancel only their own strictly future booked visits, with no additional cutoff. Actual WhatsApp action wiring remains phase 13. Blocking/released states and preservation of the completed visit's original reserved window are confirmed by the contract.

Outcome: the assigned barber records arrival, completion, cancellation, or no-show; history remains visible.

Backend checklist:

- [x] Implement confirmed visit transitions with actor/time history and administrator-only terminal corrections where agreed.
- [x] Permit the assigned employee's allowed actions; deny employee rescheduling/reassignment and access to other barbers' records.
- [x] Apply confirmed availability release rules and preserve the original reserved window on completion.
- [x] Cancel the existing invoice when a booking is cancelled while retaining invoice/payment history; do not automatically refund cash.
- [x] Keep visit status independent of payment status and do not create or reprice invoices when marking completed/paid.
- [x] Test transitions, forbidden actions, retained history, invoice cancellation, and concurrency; pass targeted checks.

Frontend checklist:

- [ ] Build employee visit action controls and administrator status/history views.
- [ ] Display arrival at the address, no-shows, cancellation, invoice status, and payment status distinctly.

Acceptance:

- [ ] Assigned barber records a permitted transition; other employees are denied and cancelled/no-show history remains available.

Backend handoff: `POST /api/bookings/:id/visit` accepts `{ status, expectedVersion, reason? }` for normal actions by the administrator or assigned employee. `POST /api/bookings/:id/visit/correction` is administrator-only and requires `{ status, expectedVersion, reason }`. Successful writes return the updated booking/invoice with incremented `visitVersion`; clients must read the current version and reload after a stale-write error. `GET /api/bookings/:id/history` returns `{ events }` in version order and uses the same administrator/assigned-employee ownership checks. Browser changes require matching origin and session CSRF protection. No employee reschedule/reassign endpoint is exposed.

Error contracts: invalid payloads/blank correction reasons return `INVALID_INPUT` (400); ownership/role denial returns 403; missing records return 404. `VISIT_CONFLICT`, `INVALID_VISIT_TRANSITION`, `VISIT_TOO_EARLY`, `CLIENT_CANCELLATION_NOT_ALLOWED`, and restore conflicts (`BARBER_UNAVAILABLE`) return 409. Visit, invoice-status, and history writes share the employee/account locks used by booking and schedules and commit atomically; a failed action leaves all three unchanged. Cancellation sets the existing invoice to cancelled, no-show leaves it issued, and corrections away from cancelled restore it to issued. Amounts, unit prices, invoice identity, payment status, and original reserved window are preserved. Phase 8 now provides cash recording and detailed payment history; visit actions never change or delete payment data.

The internal `cancelForClient` service accepts a server-verified sender client ID and a current visit version, validates own future booked scope, and uses the same transactional cancellation path. No public client login/action endpoint, WhatsApp provider, or webhook was added. New manual/AI reservations receive an initial event in their creation transaction. Migration `0005_old_dragon_man.sql` adds history and `visit_version`; old reservations receive a system baseline preserving the current visit/invoice state and explicitly noting that earlier transition details are unavailable, rather than inventing historical actors or times. History foreign keys restrict deletion and `(booking_id, version)` is unique. No dependency/environment changes are required.

Backend evidence (2026-10-02): the new action test failed with 404 before implementation; contract validation failed before its schemas existed. Targeted tests now cover normal transitions/timing, actor/time order, employee ownership/CSRF/correction denial, terminal restrictions, unpaid completion, cancelled paid status, no-show invoice behavior, administrator corrections/reopening, stale competing writes, availability and schedule restore failures, reopening versus new-booking races, atomic rollback on history failure, client scope/state/timing, and legacy migration baselines. Frontend and whole-slice acceptance remain unchecked.

Final verification (2026-10-02):

| Check | Result |
| --- | --- |
| Baseline | Backend lint/typecheck/build passed (11 forced tasks), and the existing 14 booking API tests passed before phase 6 implementation |
| Targeted checks | Backend lint/typecheck/build passed (11 forced tasks); booking/visit API and booking contract tests passed (3 files, 41 tests, including 16 visit tests) |
| Full repository | `pnpm lint`, `pnpm typecheck`, `pnpm test` (22 files, 130 tests), and `pnpm build` passed |
| Migration/schema | `pnpm db:migrate:test` and `pnpm db:migrate` succeeded for test/development; `pnpm db:generate` reported no schema drift |
| Upgrade/atomicity | Exact migration baseline SQL preserved a legacy completed/paid fixture without invented actors; injected history failure rolled back visit/invoice changes; concurrent transitions/corrections/reopening tests passed against real MySQL |
| Scope/commit | Phase 5 and the earlier gap fix committed as `273180b`; phase 6 is included in the accompanying implementation commit. No frontend source, dependency, or environment changes |

## Phase 7 — Reservation edits, rescheduling, and reassignment

> Amended 2026-10-16 by feature batch P8: edits no longer carry any price/invoice or paid-edit reconciliation. The pricing and reconciliation notes below are historical.

Depends on: phases 5–6. Confirmed on 2026-10-02: administrator edits only booked visits before their original start; new windows must also start strictly in the future, with no extra cutoff. Count edits and same-recorded-branch reassignment keep agreed unit prices; different-branch reassignment uses the destination branch's current prices. Phase 8 now permits paid edits with exact extra-cash/refund reconciliation when the total changes; edits preserving the paid total need no cash adjustment. Client rescheduling remains a phase 13 decision.

Outcome: administrator updates a reservation safely, retaining its identity and invoice revision history.

Backend checklist:

- [x] Add authorized address/count/window/barber edit contracts and shared transactional services; employees cannot reschedule or reassign.
- [x] Recheck availability at commit for every window/barber change, including conflicting concurrent edits.
- [x] Preserve the original booking/window/invoice if a reschedule or reassignment fails.
- [x] Preserve agreed prices for time/address-only edits; revise the existing invoice on count/barber/branch changes under confirmed pricing rules.
- [x] Retain revision actor/time, previous values, and historical branch/employee attribution; never create another invoice for the same reservation.
- [x] Reject paid amount changes without exact extra-cash/refund reconciliation; retain original cash history.
- [x] Integrate permitted paid edits with phase 8 reconciliation, completing phase 7 backend.
- [x] Test failed-edit rollback, concurrent conflicts, price preservation/revisions, role boundaries, and payment safeguards; pass targeted checks.

Frontend checklist:

- [ ] Build administrator edit/reschedule/reassign flows with availability feedback and clear invoice changes.
- [ ] Display revision history and preserve the previous booking in the UI after a failed change.

Acceptance:

- [ ] Administrator moves a visit to an available barber/window; a failed change preserves all original records and successful changes revise one existing invoice.

Backend handoff (2026-10-02): administrator-only `PATCH /api/bookings/:id` accepts `{ expectedVersion, reason?, addressId?, employeeId?, date?, startTime?, endTime?, adultCount?, childCount? }`, with at least one editable field. Partial changes are merged with locked current values and validated together; client identity, prices, source, and statuses cannot be supplied. The address must belong to the existing client. Supplying `addressId` snapshots that saved address's current fields, including when reselecting the same address; omitting it preserves the agreed address snapshot. Time/count/address-only changes preserve historical client/barber/branch details, including after a current barber transfers branches. Actual reassignment records the destination barber/branch and applies the confirmed pricing rules.

The existing `visitVersion` is now the shared reservation mutation version and advances on edits, visit actions, and payment actions. All edit and visit callers must send the latest value; a stale visit action after an edit returns `VISIT_CONFLICT`. Visit history, reservation revisions, and cash history each retain their own ordered events, so versions may have gaps within each list. Both employees are locked in stable ID order before a reassignment; edits share the booking/schedule/visit locks, recheck the original and proposed start before saving, and atomically update one booking/invoice with one revision. Failed availability, validation, stale writes, or revision persistence preserve all original values. No-op edits are refused without adding history.

`GET /api/bookings/:id/revisions` returns `{ revisions }` ordered by version, with actor account ID, UTC time, optional reason, and complete `before`/`after` booking/invoice snapshots. Administrators and the currently assigned employee may read them. Reassignment removes the former employee's booking/invoice/visit-history/revision access and gives it to the new employee; history authorization/read run in one transaction. Edits require the normal origin and session CSRF protection. Invalid payloads return `INVALID_INPUT` (400); a non-future proposed start returns `BOOKING_START_NOT_FUTURE` (400); missing bookings/barbers/addresses return 404. `BOOKING_CONFLICT`, `BOOKING_EDIT_NOT_ALLOWED`, `BOOKING_UNCHANGED`, and availability conflicts (`BARBER_UNAVAILABLE`) return 409. Employee writes return 403.

Migration `0006_nice_romulus.sql` adds immutable reservation/invoice revision snapshots with restrictive booking/account foreign keys and a unique booking/version pair. Existing records remain unchanged; their current values become the first revision's `before` snapshot when edited. No frontend, dependency, or environment changes are needed. Phase 8 now supplies paid-edit reconciliation; WhatsApp rescheduling/provider wiring remains pending.

Backend verification (2026-10-02): the initial edit test failed with 404 and its contract test failed before the schema existed; all 12 initial API edit cases failed before the endpoint was implemented. Targeted booking/visit/schedule/edit/contract checks passed, including 15 edit API tests and 21 booking contract tests. The start-crossing regression failed with an incorrectly accepted edit, then passed after the final start recheck. Real MySQL tests verify exact same/different-branch pricing, time/address price preservation, retained invoice identity, immutable ordered revisions, current ownership after reassignment, cross-client address denial, employee/CSRF denial, paid/state/time safeguards, conflict rollback, competing edits, opposite-barber swaps, reschedule versus new-booking races, and injected revision failure rollback. Forced backend lint/typecheck/build passed (11 tasks). Full `pnpm check` passed: repository lint, typecheck, 23 test files/161 tests, and build. Test/development migrations succeeded; `pnpm db:generate` reported no schema drift. Phase 7 unpaid edits are included in the accompanying implementation commit; frontend and whole-slice acceptance remain unchecked.

## Phase 8 — Full cash payment, corrections, and reconciliation

> Superseded 2026-10-16 by feature batch P8: reservation price, invoice and payment were removed entirely. The `invoices`, `cash_payments` and `cash_payment_events` tables, the `/api/bookings/:id/payment*` and invoice endpoints, and the invoice/cash report no longer exist. Money now lives only in barber daily collections and salon entries. The notes below record the original phase-8 implementation and are kept for history.

Depends on: phases 5–6 and phase 7 edit services. Confirmed on 2026-10-02: full cash recording only for arrived/completed visits; administrator-only mistaken-entry undo with a required reason and preserved history; paid total changes require the exact extra cash/refund and reason recorded atomically with the edit. Cancellation never automatically refunds cash. Amended 2026-10-12: only the administrator records payments; employees see them read-only.

Outcome: the administrator records one full cash payment; employees see it read-only and the administrator can correct it with an audit trail.

Backend checklist:

- [x] Add payment/correction contracts, tables, migrations, and authorized detail/action endpoints.
- [x] Record one full cash payment on the reservation's invoice; prohibit partial/split/deposit/online payments and duplicate active payments.
- [x] Protect simultaneous payment submissions and keep payment and visit state independent.
- [x] Restrict correction/undo to administrator and preserve actor, time, reason, and previous values.
- [x] Implement confirmed paid-edit reconciliation atomically with invoice revisions and payment history, completing phase 7's paid-edit dependency.
- [x] Retain cash history on cancellation; never interpret cancellation as an automatic cash refund.
- [x] Test duplicate/racing payments, exact amounts, employee ownership, correction authorization/history, and paid-change reconciliation; pass targeted checks.

Frontend checklist:

- [ ] Build administrator full-cash recording and separate payment/visit indicators.
- [ ] Build administrator correction/undo/reconciliation flows with reasons and visible payment history.

Acceptance:

- [ ] Repeated cash recording cannot create a second active payment; administrator corrections and paid edits preserve an understandable history.

Backend handoff (2026-10-02; amended 2026-10-12: administrator-only): `POST /api/bookings/:id/payment` accepts `{ expectedVersion, method }` (`cash` | `link` | `knet`, required) for the administrator and records the complete issued invoice amount only when the visit is arrived/completed. Callers cannot choose the amount or recorder. `POST /api/bookings/:id/payment/undo` is administrator-only and requires `{ expectedVersion, paymentId, reason }`, identifying the current active receipt. Both return `{ booking, payment }`, advance the shared `visitVersion`, and atomically update invoice payment status, cash receipt, and actor/time/before/after history. Visit status, invoice identity/prices/amount, and reserved window remain unchanged. Undo marks the receipt voided and invoice unpaid; it creates no refund. A later replacement receipt preserves the voided one and must still satisfy arrived/completed state rules.

`GET /api/bookings/:id/payments` returns `{ payment, payments, events }`: the current active receipt or null, all original/voided receipts, and ordered recording/undo/reconciliation events. Receipt `originalAmount` and `bookingAtReceipt` retain the original complete invoice and historical barber/branch attribution; `amount` is the current reconciled amount. Events retain previous/new receipt values, actor, UTC time, reason, kind (`recorded`, `voided`, `extra_cash`, `refund`), amount, shared version, and the associated invoice-revision ID for adjustments. A void event's amount identifies the entry corrected; it is not a cash refund. Administrators/current assigned employees may read; reassignment removes former employees' access while preserving original receipt attribution. Browser changes require origin/CSRF protection. No public client payment endpoints or additional payment methods were added.

Paid future-booked edits use the phase 7 `PATCH` endpoint, adding `reconciliation: { action: "extra_cash" | "refund", amount: "5.125", reason: "required reason" }` only when the paid total changes. Amounts use exact canonical three-decimal KWD strings and must equal the absolute difference; direction must match the increase/decrease. The same invoice/active receipt are adjusted, with the original receipt retained and one linked revision/event committed together. Paid edits preserving total need no reconciliation. Unpaid edits or unchanged totals reject supplied reconciliation. Existing booked/future-start restrictions and availability/pricing rules remain in force; administrator visit corrections may restore an eligible future booked visit without altering its cash history.

Error contracts: malformed payloads return `INVALID_INPUT` (400); missing booking returns 404; role/ownership/CSRF denial returns 403. `PAYMENT_NOT_ALLOWED`, `PAYMENT_ALREADY_RECORDED`, `PAYMENT_CONFLICT`, `PAYMENT_RECORD_MISSING`, `RECONCILIATION_REQUIRED`, `RECONCILIATION_MISMATCH`, and `RECONCILIATION_NOT_ALLOWED` return 409. A paid flag without its corresponding real receipt blocks edits instead of inventing cash history. All payment actions and paid edits share employee/booking/invoice locks; stale versions and losing concurrent writes leave original records intact. Cancellation retains an active paid receipt and creates no cash adjustment. Refund entries in this slice are the explicit differences attached to permitted paid edits.

Migration `0007_married_stark_industries.sql` adds `cash_payments` and `cash_payment_events`, exact `DECIMAL(24,3)` values, restrictive history foreign keys, required correction reasons, linked adjustment revisions, and database-enforced one-active-receipt-per-invoice uniqueness using a generated nullable invoice key. Existing reservations/invoices stay unchanged. The read-only development check found no pre-existing paid invoices, so no historical receipts or actors were fabricated. No frontend/dependency/environment changes are required. Backend implementation is included in the accompanying cash implementation commit; frontend and whole-slice acceptance remain unchecked.

Backend verification (2026-10-02): baseline forced backend lint/typecheck/build passed (11 tasks), and existing booking/visit/edit/contract checks passed (4 files, 72 tests). Cash contracts failed before implementation; all nine initial cash API cases failed with missing endpoints. Paid reconciliation then failed under the previous blanket paid-edit restriction, and the unpaid-reconciliation case exposed an incorrectly accepted adjustment before the new checks. Targeted checks now pass (6 files, 94 tests, including 19 payment API tests and 3 payment contract tests), covering full exact receipts, arrived/completed restrictions, cancellation/no-show denial, employee/CSRF/source-amount restrictions, duplicate and independent concurrent receipts, direct database active-receipt uniqueness, required administrator undo reasons, replacement receipts, retained cancelled cash, exact extra-cash/refund direction/amount/reason, same-amount paid edits, branch reassignment with original receipt attribution, missing receipt guards, competing paid edits/undo, and injected recording/adjustment history failures with complete rollback. Forced backend lint/typecheck/build passed (11 tasks). Full `pnpm check` passed: lint, typecheck, 25 files/183 tests, and build. Test/development migrations succeeded; `pnpm db:generate` reported no schema drift. Phase 7 was committed as `2312ad8`; phase 8 changes are included in the accompanying cash implementation commit. No frontend files, dependencies, or environment settings changed.

## Phase 9 — Reservation overview and haircut reports

Depends on: phases 5–8. Since 2026-10-21 the WhatsApp AI creates no reservations, so the `ai` source receives no new records. Decisions confirmed on 2026-10-08: selectable visit-date or booking-date basis; haircut quantities shown as reserved plus completed/open/cancelled/no-show; changes count administrator edits and status corrections separately.

Outcome: administrator and employees inspect permitted reservations and haircut output using labelled date bases.

Backend checklist:

- [x] Provide authorized overview/reservation report summaries and detail records covering windows, statuses, manual/AI source, cancellations, no-shows, and changes.
- [x] Provide booked versus completed adult/child haircut quantities by date, branch, and employee.
- [x] Add search and applicable date/branch/employee/client/status/source filters with a labelled date basis.
- [x] Derive completed haircut quantities from completed reservations, independently of payment status.
- [x] Scope employee summaries and detail records to their own permitted records; preserve historical attribution.
- [x] Test filter/date boundaries, status/source measures, completed-but-unpaid visits, and cross-employee denial; pass targeted checks.

Frontend checklist:

- [ ] Build responsive English overview/reservation and haircut report pages, filters, summaries, and detail navigation.
- [ ] Show date basis and provide normal browser print layouts.

Acceptance:

- [ ] Filtered counts and quantities match permitted records, including completed unpaid visits and retained cancellations/no-shows.

Backend handoff (2026-10-08): `GET /api/reports/reservations` and `GET /api/reports/haircuts` require a session (administrator or employee) and are read-only. Filters: `dateBasis` (`visit_date` default, or `created_date` = Kuwait day the reservation was made, computed from UTC `created_at` + 3 hours), inclusive `from`/`to`, `branchId`, `employeeId`, `clientId`, `status`, `source`, and `q` (literal match on reference or saved client phone). The reservations report adds `limit`/`offset` and returns `{ dateBasis, timeZone, summary, bookings, total, limit, offset }`. The summary counts all matching reservations by visit status and source, plus `editedBookings`/`edits` (administrator revisions) and `correctedBookings`/`corrections` (administrator visit-status corrections), regardless of the page. Each booking is the normal booking/invoice response plus `editCount` and `correctionCount`; visit-date results are ordered by newest visit and window, booking-date results by newest creation. The haircut report returns `totals`, `byDate`, `byBranch`, and `byEmployee`, each with `bookings` and adult/child `reserved`, `completed`, `open` (booked/arrived), `cancelled`, and `noShow` quantities from current reservation counts and visit status, independent of payment. Attribution uses the branch/barber recorded on the reservation, so a transferred barber's earlier work stays with the earlier branch; employee rows are split per recorded branch and show current names. Employees are always limited to reservations currently assigned to them (the same records they can open directly); an `employeeId` for another barber returns 403. Invalid filters return `INVALID_INPUT` (400). No migration, dependency, or environment change.

Backend verification (2026-10-08): baseline forced backend lint/typecheck/build passed (11 tasks) and booking/visit/edit/payment/contract tests passed (5 files, 91 tests). The new report contract tests failed before the schemas existed (13 cases), and all nine report API tests failed with 404 before the routes existed. Real-MySQL fixtures cover six reservations across three visit dates, both sources, all five visit states, a completed unpaid visit, a paid cancelled visit, edits, a status correction, and a barber transferred between branches. Tests now pass for summary counts, ordering, inclusive visit-date and Kuwait booking-date boundaries (a reservation made at 00:00 Kuwait time while it is still the previous day in UTC), every filter, literal search, pagination with an unchanged summary, haircut breakdowns by date/branch/barber, transfer attribution, employee scoping, and cross-barber 403. Forced backend lint/typecheck/build passed (11 tasks); targeted tests passed (11 files, 91 tests). Full `pnpm check` passed: lint, typecheck, 35 test files/239 tests, and build. Frontend and acceptance items remain unchecked.

## Phase 10 — Branch and employee performance reports

Depends on: phases 3 and 5–8; reuse phase 9 report filters/authorization. Decisions confirmed on 2026-10-08: availability is scheduled working time across the selected visit dates; reserved hours count booked/arrived/completed windows; invoice and cash measures follow the selected date basis.

Outcome: administrator compares branches/barbers; employee sees only their own work and linked financial records.

Backend checklist:

- [x] Report employee assigned/completed visits, adult/child counts, reserved hours, availability, and linked invoices/payments.
- [x] Report branch booking/haircut output, employee breakdown, invoices, and related cash receipts.
- [x] Attribute historical work to the recorded employee/branch even after transfers.
- [x] Label reserved hours as including travel and identify report date bases; apply relevant search/filters and role ownership.
- [x] Test transfers, hours, linked-detail authorization, filter boundaries, and cash/invoice separation; pass targeted checks.

Frontend checklist:

- [ ] Build English employee and branch report summaries, breakdowns, detail links, filters, and print layouts.
- [ ] Display own-record scope for employees and label reserved hours/date basis clearly.

Acceptance:

- [ ] Transferring a barber does not move past branch results; employees cannot retrieve another barber's details through reports.

Backend handoff (2026-10-08): `GET /api/reports/employees` and `GET /api/reports/branches` reuse the phase 9 filters, date basis, and scoping. Rows contain `work` (phase 9 haircut measures plus `completedVisits` and `reservedMinutes`), `invoices` (`issued`, `cancelled`, `outstanding` = issued and unpaid, each `{ count, total }`), and `cash` (active receipts at their current reconciled amount, including cash kept on cancelled visits; voided receipts excluded). Money is summed in MySQL as exact `DECIMAL` and returned as three-decimal KWD strings. Each reservation has one invoice and at most one active receipt, so revisions and joins never double count. Reserved minutes are booked/arrived/completed windows and include travel. Barber rows add `enabled`, current branch, and `availableMinutes`: scheduled minutes from weekly hours, with dated exceptions replacing (or closing) a day, across every date from `from` to `to`; `null` unless the visit-date basis has both dates. With a branch filter, barbers currently in the branch and barbers with recorded work there are listed, with measures from that branch only. Branch rows list every branch for the administrator (zeros included) with an `employees` breakdown by recorded branch; employees receive only their own row and branches holding their own work, and filtering by another barber returns 403. Linked detail records come from `GET /api/reports/reservations` with the same filters, and cash detail from `GET /api/bookings/:id/payments`. No migration, dependency, or environment change.

Backend verification (2026-10-08): baseline was the green phase 9 commit `024a353` (full `pnpm check`). New contract tests failed before the schemas existed (2 cases) and all eight API tests failed with 404 before the routes existed. Real-MySQL fixtures cover three barbers (one disabled, one transferred), weekly hours, a closed and a special-hours exception, all five visit states, completed unpaid, cancelled with retained cash, a reconciled receipt (7.000 → 8.000), a voided receipt, and a revised invoice. Tests now pass for barber and branch measures, reserved versus scheduled minutes, exact invoice/cash separation, transfer attribution, branch-filter membership, `null` availability for the booking-date basis or an open range, administrator zero rows, employee scoping, and cross-barber 403. Forced backend lint/typecheck/build passed (11 tasks). Full `pnpm check` passed: lint, typecheck, 36 test files/249 tests, and build. Frontend and acceptance items remain unchecked.

## Phase 11 — Client history and collection reports

> Amended 2026-10-16 by feature batch P8: the invoice report and its `paymentStatus` filter are removed, and the Clients report no longer carries invoiced/cash measures. The client report (contact details, bookings, repeat visits, haircut counts) and the collection-based report measures remain. The notes below are historical.

Depends on: phases 4–8; reuse phase 9 report filters/authorization.

Outcome: permitted users can trace client history, invoiced amounts, actual cash, revisions, and corrections.

Backend checklist:

- [x] Report client contact details, booking history, repeat visits, haircut counts, invoiced totals, and payments within permitted access. (`GET /reports/clients` groups the phase 10 performance measures by client with contact details; `completedVisits` gives repeat visits, and invoice issued/cancelled/outstanding values stay separate from active cash. Verified in `apps/api/tests/client-invoice-reports.test.ts`.)
- [x] Report invoice line items, amounts, unpaid/paid/cancelled states, actual cash received, revisions, and corrections. (`GET /reports/invoices` lists one invoice per reservation with quantities, unit prices, line amounts, total, statuses, the recorded receipt, and edit/correction counts.)
- [x] Keep invoice value, cancelled invoice amounts, and actual cash collected as separate measures; never double-count revisions. (One invoice per reservation and at most one active receipt per invoice; the summary measures issued/cancelled/outstanding/cash independently, and a twice-edited invoice counts once with `edits: 2`.)
- [x] Support applicable search/date/branch/employee/client/status/source filters, labelled date bases, summaries, and permitted details. (Both endpoints reuse the phase 9 filters plus a `paymentStatus` filter on invoices, both date bases, and pagination on the invoice list without changing the summary.)
- [x] Return browser-print-ready report/invoice data; do not add custom PDF generation or CSV/Excel exports.
- [x] Test cancelled-but-paid invoices, correction effects, repeat visits, revision deduplication, and employee ownership; pass targeted checks. (9 tests in `apps/api/tests/client-invoice-reports.test.ts` covering a cancelled-but-paid invoice with a correction, a repeat client's completed visits, revision deduplication, employee scoping/403 on another barber's filter, and the existing 17 phase 9–10 report tests still green.)

Frontend checklist:

- [ ] Build client history and invoice/cash report pages with filters, separate financial measures, and revision/correction details.
- [ ] Build English responsive invoice/report printing through normal browser print/Save as PDF.

Acceptance:

- [ ] A paid cancelled visit and revised invoice appear correctly without inflating invoice totals or hiding recorded cash history.

## Phase 12 — Arabic WhatsApp booking-request intake

Depends on: phase 4 (client phone format). Decided 2026-10-21: OpenWA gateway, intake-only AI with staff handoff, conversations kept indefinitely; the owner accepts OpenWA's number-ban risk. Decided 2026-10-24: OpenAI-compatible Chat Completions AI format, follow-up handling (new request, change/cancellation update, forward), English staff messages, and removal of the reservation `source` field. Decision gate still open: the AI provider and model, and OpenWA onboarding (session and number linking).

Outcome: a client sends a booking request to the business's single WhatsApp number in Arabic; the AI collects the details, tells the client a person will follow up, and sends one request summary to the staff WhatsApp number. Later messages produce a new summary, an update to an earlier request, or a forward. Staff create and change reservations manually in the dashboard. Product rules: [project-contract.md](project-contract.md#whatsapp-journey).

Processing design:

```text
OpenWA ─POST /api/whatsapp/webhook─► verify signature ─► save inbound (unique idempotency key) ─► 200
                                                                │
                              worker (one conversation at a time, resumes after restart)
                                                                ▼
                         AI turn ─► outbound rows (stable Idempotency-Key, status pending → sent / failed)
                                    staff message first, then the client reply
```

Backend checklist:

- [x] Add OpenWA, AI (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`) and staff-number settings to `.env`, `.env.production` and their examples; validate them at startup without exposing secrets. Use the built-in `fetch`; no AI SDK dependency.
- [x] Receive OpenWA `message.received` webhooks: verify `X-OpenWA-Signature` over the raw body, answer individual-chat `text` messages only (ignore `fromMe`, groups and every other type), and deduplicate on `X-OpenWA-Idempotency-Key`.
- [x] Store conversations and messages indefinitely, keyed by the sender's international phone number (`senderPhone` for `@lid` senders, with `RESOLVE_LID_TO_PHONE=true` on OpenWA).
- [x] Have the AI collect adult/child counts, address, and requested date and time window in Arabic, with no database, booking or administrator access.
- [x] Load the owner's prompt from `apps/api/prompts/whatsapp-ai.md` (starter version provided; the owner replaces it) and append the fixed answer-format part in code; ship the file in the API Docker image.
- [x] When a request is complete, send one request summary (client phone, counts, address, date and window) to `STAFF_WHATSAPP_NUMBER` through OpenWA `send-text` with an `Idempotency-Key`, then reply "we will let a human know".
- [x] For a change to or cancellation of a request already sent, send staff an update naming the earlier request; forward anything else to staff and reply "we will let a human know".
- [x] Remove the unused AI-source creation path, the internal client-cancellation service, and the reservation `source` field (contracts, database column, reports filter and summary count). The AI creation path never had an external caller (no webhook existed), so no `ai` rows can exist; the development database had none on 2026-10-24. Migration `0031_drop_booking_source` drops the column.
- [x] Test signature rejection, duplicate/concurrent webhooks, retries/restarts, sender isolation, AI/OpenWA failures (no false "sent" state), and exactly one staff message per completed request or update; pass targeted checks.
- [ ] Verify a real conversation and staff message once OpenWA is linked and the AI provider is chosen.

Frontend checklist:

- [x] Remove the source filter, source labels and the source summary count from the bookings list, booking detail and reports.
- [x] No new screens: staff create the reservation through the existing new-booking screen. Any dashboard view of WhatsApp requests or conversations needs a separate decision.

Implemented 2026-10-24 (branch `feat/whatsapp-intake`): migration `0031_drop_booking_source` drops the reservation source; migration `0032_add_whatsapp_intake` adds `whatsapp_conversations` (one per phone, with a worker lease and retry time), `whatsapp_messages` (inbound and outbound, unique idempotency key, pending/done/failed) and `whatsapp_requests` (the request number staff see). The API module `apps/api/src/modules/whatsapp` serves `POST /whatsapp/webhook` only when every setting is present, answers after acknowledging, retries AI and OpenWA failures with back-off (30 seconds doubling to 10 minutes; gives up after 12 attempts and marks the work failed), resumes stored work at startup and every 30 seconds, and lets one worker at a time answer a conversation. The AI reads the last 40 client messages and replies. Tests: `apps/api/tests/whatsapp-parts.test.ts` and `apps/api/tests/whatsapp.test.ts` (real MySQL, fake AI and OpenWA).

Also built 2026-10-24: the compose service `openwa` (pinned image `ghcr.io/rmyndharis/openwa:0.25.0`, opt-in profile `whatsapp`, loopback-only dashboard, webhook to `http://api:4000/whatsapp/webhook` on the private network), `pnpm docker:up:whatsapp`, `OPENWA_SESSION_ID` validated as the session UUID (OpenWA's webhooks and send routes use the id, not the name), and the onboarding steps in the README. Migration `0033_drop_client_visit_actor` removes the unused `client` visit-history actor and `actor_client_id` (no rows used them), and the shared phone validation message is English.

Open decisions (deliberately not built):

| Decision | Status / what it blocks |
| --- | --- |
| AI provider and model | Chosen 2026-10-24, account not yet created: Xiaomi MiMo-V2.6-Flash, bought directly from Xiaomi on pay-as-you-go (`AI_BASE_URL=https://api.xiaomimimo.com/v1`, `AI_MODEL=mimo-v2.6-flash`, an `sk-` key from the console's API Keys page). Not the Token Plan subscription (`tp-` keys, a different address, aimed at coding tools). Why: $0.14 input / $0.28 output / $0.0028 cached input per 1M tokens with no peak hours, and Xiaomi lists `json_object` support for this model; DeepSeek V4.1 Flash costs 2–4× more for output and doubles in Kuwait's morning peak; OpenRouter and other hosts save only cents at this volume and add a middleman. Set up 2026-10-30: account topped up, key works from this PC and the VPS (region not blocked), `json_object` confirmed. Xiaomi's docs say thinking is on by default; `AI_THINKING=disabled` turns it off. Live samples showed the model often skipped telling staff under the first rules (6/15 correct actions), so the code now sends firmer answer rules and temperature 0.3. These small samples are not proof; the real conversation check still applies. |
| Owner's prompt | `apps/api/prompts/whatsapp-ai.md` holds a starter version until the owner writes theirs. |
| OpenWA onboarding | Which phone number/SIM is linked and who scans the QR; the engine (`OPENWA_ENGINE_TYPE`: empty keeps OpenWA's default whatsapp-web.js, which runs Chromium and is budgeted 2 GB; `baileys` needs no browser). The VPS is shared with other live projects: 7.8 GB memory, 3.9 GB available on 2026-10-30. |
| AI failure alert | Built 2026-10-30. Staff get one alert with the client's number and messages after 12 failed attempts (about 1.5 hours), or at once for answers a retry cannot fix (400, 401, 402, 403, 404, 421). The client gets no reply. |
| Dashboard view of WhatsApp requests | No screen exists; requests reach staff only through WhatsApp. Needs a separate decision. |
| Production rollout | Phase 14: HTTPS/domain, backups (now including the `openwa-data` volume, which holds the linked session) and the real webhook/retry check. |

Remaining steps to go live, in order:

1. Replace the starter prompt in `apps/api/prompts/whatsapp-ai.md` with the owner's prompt.
2. Settle OpenWA onboarding: a dedicated business number/SIM (not a personal one) and the engine.
3. Merge `feat/whatsapp-intake` into `main`.
4. Deploy to the VPS and follow the README onboarding steps (start OpenWA, create the session, scan the QR, create the operator key, register the webhook, fill the settings, including `AI_THINKING=disabled`).
5. Verify one real Arabic request: one client reply and exactly one staff summary (the open checklist item above).

Can wait: a dashboard view of WhatsApp requests. HTTPS/domain is not needed for the WhatsApp link itself (OpenWA reaches the API on the private Docker network), but backups must include the `openwa-data` volume once the number is linked.

Acceptance:

- [ ] One Arabic WhatsApp request produces one client reply and one staff request summary despite retries, and no reservation is created automatically.

## Phase 13 — WhatsApp booking lookup and changes (removed)

Removed 2026-10-21. The WhatsApp AI handles only new booking requests; questions about existing bookings, changes and cancellations are forwarded to staff, who act in the dashboard. The internal `cancelForClient` service, the trusted-sender AI creation path from phases 5–6, and the `ai` reservation source are removed as part of phase 12.

## Phase 14 — Production rollout and complete acceptance

Depends on: all backend slices; whole-product rollout also requires all frontend slices. Decision gate: deployment/backup tooling, HTTPS/domain configuration, integration credentials, and retention/restore procedures.

Backend/operations checklist:

- [ ] Verify migrations on a clean database and the documented upgrade path; validate production secrets and sole-admin setup.
- [ ] Build and verify the API production image and selected deployment configuration with the existing host MySQL.
- [ ] Configure HTTPS, managed processes, database access, safe logs, health/readiness checks, and operational failure handling.
- [ ] Configure backups and successfully restore one into an isolated database; record the restore procedure and evidence.
- [ ] Run OpenWA in the deployment environment (compose service `openwa`, built in phase 12) and verify signed webhook delivery, retries, the staff request summary, and the selected AI configuration. Back up the `openwa-data` volume with the database.
- [ ] Verify all backend lint/typecheck/tests/builds and real-MySQL booking/payment concurrency, authorization, snapshots, revision, and report acceptance.
- [ ] Document setup, migrations, integrations, deployment, backups/restoration, and remaining operational responsibilities without secrets.

Frontend checklist:

- [ ] Verify all frontend checks and the web production image, Compose wiring, and HTTPS same-origin API behavior.
- [ ] Verify English-only LTR flows on computer/tablet/phone, role access, errors, and normal browser invoice/report printing.
- [ ] Verify every vertical slice end to end against the production-like backend.

Acceptance:

- [ ] Complete product acceptance matches the contract and all required frontend work is verified.
- [ ] Production readiness includes functioning selected integrations, deployment configuration, and proven backup restoration.

## Frontend progress

Frontend work is tracked in [frontend-phases.md](frontend-phases.md). The frontend checklists in this document stay unchecked until each slice is verified end to end with real records.

## Execution and handoff rules

For each backend slice:

1. Resolve its decision gates before dependent code; update the product contract only with confirmed decisions.
2. Read complete related files and establish the targeted lint/build/typecheck/test baseline for that area. If broken, report and fix the necessary setup before feature work.
3. Use small red/green TDD steps for behavior: failing test, minimal implementation, then verification.
4. Complete all integration points in that slice, including schema/migrations, contracts, service rules, API authorization, environment setup, and real database behavior where material.
5. Run conflicting/install/build/test commands sequentially. Verify the touched area first; run the entire codebase only for high-complexity changes across multiple areas, without changing frontend code.
6. Record actual commands/results, API payload/error contracts, migrations/environment changes, and unresolved dependencies for the frontend owner. Mark only verified backend items complete.
7. Leave frontend and whole-slice acceptance unchecked until their separate owner verifies them. Do not commit without explicit one-time authorization.

## Scope exclusions

Keep the contract's exclusions: no native app, client dashboard login, second administrator, multiple barbers in one reservation, saved child profiles, extra services, payroll, inventory, commissions, expenses, accounting ledger, route optimization, GPS tracking, service-area enforcement, proactive confirmations/reminders/campaigns, online/partial payments, custom report builder, custom PDF generator, or CSV/Excel exports. WhatsApp conversational replies remain required.

## Pre-fix backend verification review — 2026-10-02

Authority: the complete [project contract](project-contract.md). Reviewed the implemented API routes, services, repositories, shared contracts, database schemas, and relevant tests for the claimed completed backend work. This review did not implement fixes or verify frontend, Docker, or production acceptance.

| Check | Command/evidence | Result |
| --- | --- | --- |
| Backend lint/typecheck/build | `pnpm exec turbo run lint typecheck build --filter='@just4kids/api...' --concurrency=1 --force` | 11/11 tasks passed; cache bypassed; API, contracts, DB, and config in scope; config has no build task |
| Isolated migrations | `pnpm db:migrate:test` | Succeeded against `just4kids_test`; this was not a clean-database migration/restore test |
| Backend tests | `pnpm exec vitest run --project api --project contracts --project db --project config --fileParallelism=false` | 19 test files, 88 tests passed, including real MySQL/API behavior; no config feature coverage claimed |
| Toolchain | `node --version`; `pnpm --version` | Node `v24.14.0`, pnpm `12.4.1` |
| Secret files | `git check-ignore .env .env.test` | Both ignored |
| Employee phone-change race | Compiled authentication service/repositories with a phone update between credential verification and session creation, using isolated MySQL | Confirmed: old-phone login succeeded and created a valid session after the change; temporary employee/branch records removed |
| Availability integration | `schedule.service.ts` calls `isWindowAvailable(..., [])`; schedule repositories do not check booking rows | Working hours/exceptions implemented; booking conflict integration and schedule-edit protection pending in phase 5 |
| Docker | `Get-Command docker -ErrorAction SilentlyContinue` | Command unavailable; image/Compose checks remain pending |

Historical result at review time: branch/pricing behavior and client/address management were verified, but the phone-change race prevented full phase 2 completion, and phase 3 booking integration/snapshots remained pending. The subsequent fix and phase 5 implementation above supersede those pending findings. This table preserves the actual pre-fix evidence. Earlier development-database, installation, compiled health, and production-package evidence below was not rerun during that review.

## Original setup verification evidence — 2026-09-29

Verified on 2026-09-29:

| Check | Evidence/result |
| --- | --- |
| Toolchain | `node --version`: `v24.14.0`; `pnpm --version`: `12.4.1` |
| Dependencies | `pnpm install --frozen-lockfile` succeeded; pinned manifests and lockfile unchanged |
| Backend lint | `pnpm exec turbo run lint --filter='@just4kids/api...'`: API, contracts, DB, config passed |
| Backend build | `pnpm exec turbo run build --filter='@just4kids/api...'`: API, contracts, DB passed; config is static |
| Backend typecheck | `pnpm exec turbo run typecheck --filter='@just4kids/api...'`: API, contracts, DB, config passed |
| API tests | `pnpm --filter @just4kids/api test`: 10 passed |
| Contract tests | `pnpm --filter @just4kids/contracts test`: 4 passed |
| Database tests | `pnpm --filter @just4kids/db test`: 1 passed against real `just4kids_test` |
| Config tests | `pnpm --filter @just4kids/config test`: permitted empty test run; no feature coverage claimed |
| Development database | Read-only query through compiled DB package returned `DATABASE() = just4kids`; environment URLs select separate development/test databases |
| Compiled API | Temporary HTTP server from compiled app passed `/health`, JSON 404, and disabled `x-powered-by` checks, then closed |
| Production package | `pnpm --filter @just4kids/api --prod deploy .turbo/api-deploy-check` succeeded; isolated package loaded contracts/DB and passed live `/health` |
| Secrets/change scope | `git check-ignore` confirmed `.env`/`.env.test` ignored; Git checks confirmed no frontend, manifest, or lockfile changes |

Setup repair: existing generated dependency metadata referred to `D:\Documents\work\just4kids`, whereas this workspace is `D:\Documents\work\capella\just4kids`. The initial installation failed removing broken Windows package links. Generated dependency directories were preserved in ignored `.turbo/setup-backup-20260929/`, then a clean frozen-lockfile installation restored the workspace dependencies. This also restored shared dependencies needed by the frontend without changing its source, configuration, or package versions. The local production package check is under ignored `.turbo/api-deploy-check/`.

At the end of the original setup-only task on 2026-09-29, Docker was unavailable, Docker image builds and Compose execution were unchecked, and frontend validation was outside that task. That task performed no business-feature implementation, schema migration, integration onboarding, production deployment, or Git commit. Backend phases 1–6 and migrations were implemented afterward, as recorded above; this paragraph is historical setup evidence, not the current feature status.
