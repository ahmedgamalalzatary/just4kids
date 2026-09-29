# Just4Kids implementation phases

Created: 2026-09-29. Product authority: [project-contract.md](project-contract.md). Repository rules: [AGENTS.md](../AGENTS.md). Setup commands: [README.md](../README.md).

## Scope and checklist rules

The initial task covered documentation and setup verification. Phase 1 backend authentication was implemented next; its frontend and whole-slice acceptance remain pending.

Future implementation by this agent is **backend only**: `apps/api`, backend contracts in `packages/contracts`, `packages/db`, and necessary backend configuration/dependencies/documentation. Frontend implementation is assigned separately. Do not change `apps/web` or frontend dependencies as part of backend work.

Each feature slice describes a usable journey across backend and frontend. Finish and verify the backend for that journey together, including contracts, migrations, services, authorization, endpoints, and tests; then the frontend can consume it without waiting for an unrelated backend phase. Avoid separate project-wide schema, API, or UI implementation phases.

- `[x]` means implemented and verified, with evidence. Existing scaffolding does not establish feature completion.
- `[ ]` means pending, including all frontend work in this document.
- A backend-complete slice is ready for frontend integration. The **whole slice remains incomplete** until its frontend and end-to-end acceptance are also complete.
- Phase 0 and the final production phase are shared prerequisites/completion gates; the intervening phases are vertical product slices.
- Add/install/configure pinned backend dependencies when the consuming slice needs them, updating the lockfile and environment examples together. Do not preinstall speculative integrations.
- Each slice introduces its own database migrations. Preserve historical data; do not replace the empty scaffold with every future table at once.
- Pending contract proposals are decision gates, not approved implementation rules. Confirm them before dependent implementation.

## Inspected project state

As inspected on 2026-09-29:

| Area | Existing state |
| --- | --- |
| Workspace | pnpm/Turborepo monorepo; pinned versions, lint/typecheck/build/test commands |
| API | Express, Helmet, JSON parsing/errors, environment validation, `/health`, shutdown; authentication, branches, employees, schedules, and clients/addresses implemented |
| Contracts | Zod health, auth, branch, employee, schedule, eligibility, client, and address contracts |
| Database | Drizzle/mysql2; auth (0000), branch/employee (0001), schedule (0002), and client/address (0003) tables; bookings and later business tables pending |
| Tests | API auth/organization/schedule/client behavior, shared contracts, and real isolated MySQL checks |
| Frontend | Arabic RTL placeholder and API proxy; no feature journeys verified |
| Containers | Separate API/web Dockerfiles, Compose, secret-excluding Docker ignore file; execution unverified |
| Local tools | Node `24.14.0`, pnpm `12.4.1`, MySQL listener on port `3306`; Docker command unavailable |
| Business features | Phases 1–4 backend implemented; reservations, invoices, cash, reports, WhatsApp, and all frontend journeys pending |

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

- [ ] Verify frontend dependency installation, lint, typecheck, tests, and build.
- [ ] Verify Arabic RTL responsive shell and same-origin API proxy in the browser.
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

- [ ] Build the shared Arabic phone/password login page, session handling, logout, and role-aware navigation.
- [ ] Show usable authentication/authorization errors and expired-session behavior on all screen sizes.

Acceptance:

- [ ] Administrator can log in/out through the dashboard; unauthenticated or unauthorized users cannot obtain protected records.

Backend evidence: migration `0000_massive_white_tiger.sql` applied to development and isolated test MySQL; live API login/session against the development administrator passed. API, DB, and contract tests plus lint/typecheck/build passed for the touched workspaces. The local administrator credentials are editable only in ignored `.env`; production requires a separate stronger password and HTTPS `APP_ORIGIN`. No frontend login page or client-side handling was implemented.

## Phase 2 — Branches, prices, and employee accounts

Depends on: phase 1. Decisions confirmed: employee self-edits display name only; administrator changes phone/branch/active status and resets passwords; branches use name, location/address, adult/child KWD prices, and descriptive haircut durations. No other branch settings are required in this phase.

Outcome: administrator creates branches and barbers; each barber signs in and can edit only permitted profile details.

Backend checklist:

- [x] Add branch/employee contracts, tables, migrations, and authorized list/detail/create/update operations.
- [x] Store branch adult/child prices exactly and descriptive haircut durations; prohibit floating-point money totals.
- [x] Link each employee to a branch and provide administrator-managed credentials/reset operations under the agreed policy.
- [x] Enforce exactly the administrator and employee roles; restrict employee reads/edits to permitted own-profile fields.
- [x] Keep stable branch/account IDs on employee transfer and branch price changes. Booking/invoice snapshots preserving historical attribution and prices are explicitly required in phase 5, when bookings exist.
- [x] Test branch pricing validation, account creation/reset, profile restrictions, cross-employee denial, and transfers; pass targeted checks.

Frontend checklist:

- [ ] Build branch/pricing management and employee/account management for the administrator.
- [ ] Build the employee's own permitted profile screen and role-specific navigation.

Acceptance:

- [ ] Administrator manages a branch and barber; that barber signs in and cannot edit another employee or branch prices.

Backend evidence: migration `0001_dazzling_power_pack.sql` applied to development and isolated test MySQL. Live authenticated branch and employee list requests passed against the development database. Admin create/update/reset, employee login/own display-name update, CSRF, ownership, duplicate-phone rollback, transfer, and session-revocation tests pass. Backend targeted lint/typecheck/tests/build and whole-repository lint/typecheck/tests/build passed (62 tests). No branch or employee business records were invented in the development database, no frontend source was changed, and frontend/whole-slice items remain pending.

## Phase 3 — Working schedules and eligible barbers

Depends on: phase 2. Confirmed: `Asia/Kuwait` local date/time, same-day shifts/windows, adjacent windows allowed, booked/arrived/completed block the original window, cancelled/no-show release it, and schedule edits that would exclude an existing booking are refused. Weekly hours have dated exceptions.

Outcome: administrator controls working availability; a requested window returns eligible barbers and their branches.

Backend checklist:

- [x] Add weekly and dated-exception contracts, persistence, migration, and administrator schedule operations; allow employee own-schedule reads only.
- [x] Implement a shared availability decision for manual booking, AI booking, rescheduling, and reassignment; wire reservation reads when phase 5 creates reservations.
- [x] Validate the entire requested window against working shifts/date exceptions and the confirmed blocking/released visit-state policy in the shared decision.
- [x] Enforce inclusive 20-minute to 4-hour bounds independently of counts and descriptive haircut durations.
- [x] Return enabled eligible barbers with their branch; do not calculate travel time or add buffers outside the selected window.
- [x] Test schedule boundaries, overlap/adjacency, Kuwait calendar dates, invalid windows, and ownership; pass targeted checks.

Frontend checklist:

- [ ] Build administrator schedule editing and the employee's own schedule view.
- [ ] Build date/window selection and eligible barber selection showing each branch.

Acceptance:

- [ ] Working-hour changes and requested windows produce the same eligibility results used by later booking actions.

Backend evidence: migration `0002_sour_oracle.sql` applied to development and isolated test MySQL; a subsequent `pnpm db:generate` found no schema drift. Authenticated schedule read/write and eligible-barber API tests, exact-window contract tests, shared visit-state overlap tests, and real database schema tests pass. Targeted backend lint/typecheck/tests/build passed (contracts 23, database 9, API 44 tests); full `pnpm lint`, `pnpm typecheck`, `pnpm test` (76 tests), and `pnpm build` passed. The API production dependency package loaded and served `/health`. The HTTP eligibility result currently has no reservations to check; phase 5 must load blocking reservations inside the booking transaction and reject schedule edits that would exclude existing bookings. Frontend and whole-slice acceptance remain pending.

## Phase 4 — Clients and usable service addresses

Depends on: phase 1. Confirmed: one client per international-format phone; each address requires area, block, street, and house number or building name. Optional location data may be a Google Maps link or paired WhatsApp coordinates.

Outcome: administrator maintains the primary contact and reusable visit addresses.

Backend checklist:

- [x] Add client/address contracts, tables, migration, and administrator search/list/detail/create/update operations.
- [x] Support area, block, street, house number or building name, optional floor/apartment, and additional instructions.
- [x] Accept paired WhatsApp coordinates or a Google Maps link alongside usable visit details; floor/apartment are optional.
- [x] Support unique primary-contact phone lookup/reuse for the later WhatsApp journey behind administrator authorization and an internal service.
- [x] Expose complete address records for phase 5 to snapshot; do not add child profiles. Actual booking snapshots are required in phase 5 when reservations exist.
- [x] Test contact/address validation, lookup, role boundaries, and snapshot-ready data; pass targeted checks.

Frontend checklist:

- [ ] Build client search/list/details and contact/address editing.
- [ ] Build reusable address selection and location/link inputs appropriate to property type.

Acceptance:

- [ ] Administrator can find and update a client with a usable home-visit address without losing historical visit details.

Backend evidence: migration `0003_easy_lucky_pierre.sql` applied to development and isolated test MySQL; `pnpm db:generate` found no schema drift. Administrator client/address API operations, strict contracts, exact phone lookup, duplicate-phone rollback, literal search terms, address ownership, and real database schema tests pass. Targeted backend lint/typecheck/tests/build passed (contracts 27, database 11, API 48 tests); full `pnpm lint`, `pnpm typecheck`, `pnpm test` (86 tests), and `pnpm build` passed. The API production dependency package loaded and served `/health`. Actual historical visit snapshots remain a phase 5 requirement. Frontend and whole-slice acceptance remain pending.

## Phase 5 — Manual reservation and its initial invoice

Depends on: phases 2–4. Decision gate: required invoice/tax fields and remaining availability/date rules.

Outcome: administrator books one client with one barber/window/address and receives one combined invoice immediately.

Backend checklist:

- [ ] Add booking/invoice contracts, tables, migrations, readable booking references, source attribution, and authorized list/detail operations.
- [ ] Validate integer non-negative adult/child counts with at least one haircut, one barber, one address, and one shared window.
- [ ] Recheck availability inside the booking transaction and serialize conflicting writes for the same barber.
- [ ] Use the phase 3 shared availability decision with blocking reservation rows in eligible-barber reads and booking transactions; reject schedule edits that would exclude a future blocking booking while holding the same employee lock.
- [ ] Atomically save reservation and invoice; roll back both on failure.
- [ ] Snapshot address, employee/branch attribution, counts, and agreed unit prices; compute exact totals from branch prices.
- [ ] Copy the selected client's address into the reservation transaction so later client/address edits do not change past visit details.
- [ ] Expose booking/invoice detail and print-ready data, separate visit/invoice/payment states, and employee-own record reads.
- [ ] Keep the creation service reusable by AI with actor/client authorization enforced outside model control.
- [ ] Test simultaneous conflicting bookings, rollback, endpoint boundaries, snapshots, one invoice, and direct-record ownership.
- [ ] Explicitly test that three 20-minute haircuts can fit an otherwise available 20-minute window under the contract; pass targeted checks.

Frontend checklist:

- [ ] Build administrator booking creation, eligible barber selection, price review, reservation list/detail, and employee-own reservation views.
- [ ] Build the combined Arabic invoice view with normal browser print/Save as PDF.
- [ ] Display backend conflict/validation errors and a booking reference only after creation succeeds.

Acceptance:

- [ ] One manual submission produces one reservation and invoice; simultaneous overlapping submissions cannot both succeed.

## Phase 6 — Employee visit workflow and cancellation history

Depends on: phase 5. Decision gate: exact visit state transitions, client cancellation eligibility, terminal corrections, and released/blocking states.

Outcome: the assigned barber records arrival, completion, cancellation, or no-show; history remains visible.

Backend checklist:

- [ ] Implement confirmed visit transitions with actor/time history and administrator-only terminal corrections where agreed.
- [ ] Permit the assigned employee's allowed actions; deny employee rescheduling/reassignment and access to other barbers' records.
- [ ] Apply confirmed availability release rules; preserve the original reserved window on completion if approved.
- [ ] Cancel the existing invoice when a booking is cancelled while retaining invoice/payment history; do not automatically refund cash.
- [ ] Keep visit status independent of payment status and do not create or reprice invoices when marking completed/paid.
- [ ] Test transitions, forbidden actions, retained history, invoice cancellation, and concurrency; pass targeted checks.

Frontend checklist:

- [ ] Build employee visit action controls and administrator status/history views.
- [ ] Display arrival at the address, no-shows, cancellation, invoice status, and payment status distinctly.

Acceptance:

- [ ] Assigned barber records a permitted transition; other employees are denied and cancelled/no-show history remains available.

## Phase 7 — Reservation edits, rescheduling, and reassignment

Depends on: phases 5–6. Decision gate: same-branch count pricing, same/different-branch reassignment pricing, and paid-invoice reconciliation policy. Paid edits depend on phase 8 and stay blocked until that integration is complete.

Outcome: administrator updates a reservation safely, retaining its identity and invoice revision history.

Backend checklist:

- [ ] Add authorized address/count/window/barber edit contracts and shared transactional services; employees cannot reschedule or reassign.
- [ ] Recheck availability at commit for every window/barber change, including conflicting concurrent edits.
- [ ] Preserve the original booking/window/invoice if a reschedule or reassignment fails.
- [ ] Preserve agreed prices for time/address-only edits; revise the existing invoice on count/barber/branch changes under confirmed pricing rules.
- [ ] Retain revision actor/time, previous values, and historical branch/employee attribution; never create another invoice for the same reservation.
- [ ] Reject unreconciled paid amount changes; integrate permitted paid edits with phase 8 before marking this item complete.
- [ ] Test failed-edit rollback, concurrent conflicts, price preservation/revisions, role boundaries, and payment safeguards; pass targeted checks.

Frontend checklist:

- [ ] Build administrator edit/reschedule/reassign flows with availability feedback and clear invoice changes.
- [ ] Display revision history and preserve the previous booking in the UI after a failed change.

Acceptance:

- [ ] Administrator moves a visit to an available barber/window; a failed change preserves all original records and successful changes revise one existing invoice.

## Phase 8 — Full cash payment, corrections, and reconciliation

Depends on: phases 5–6 and phase 7 edit services. Decision gate: correction/undo reasons, paid amount-change reconciliation, and any cash-refund recording policy.

Outcome: assigned employee records one full cash payment; administrator can correct it with an audit trail.

Backend checklist:

- [ ] Add payment/correction contracts, tables, migrations, and authorized detail/action endpoints.
- [ ] Record one full cash payment on the reservation's invoice; prohibit partial/split/deposit/online payments and duplicate active payments.
- [ ] Protect simultaneous payment submissions and keep payment and visit state independent.
- [ ] Restrict correction/undo to administrator and preserve actor, time, reason, and previous values.
- [ ] Implement confirmed paid-edit reconciliation atomically with invoice revisions and payment history, completing phase 7's paid-edit dependency.
- [ ] Retain cash history on cancellation; never interpret cancellation as an automatic cash refund.
- [ ] Test duplicate/racing payments, exact amounts, employee ownership, correction authorization/history, and paid-change reconciliation; pass targeted checks.

Frontend checklist:

- [ ] Build employee full-cash recording and separate payment/visit indicators.
- [ ] Build administrator correction/undo/reconciliation flows with reasons and visible payment history.

Acceptance:

- [ ] Repeated cash recording cannot create a second active payment; administrator corrections and paid edits preserve an understandable history.

## Phase 9 — Reservation overview and haircut reports

Depends on: phases 5–8. AI-source breakdown becomes end-to-end verifiable after phase 12.

Outcome: administrator and employees inspect permitted reservations and haircut output using labelled date bases.

Backend checklist:

- [ ] Provide authorized overview/reservation report summaries and detail records covering windows, statuses, manual/AI source, cancellations, no-shows, and changes.
- [ ] Provide booked versus completed adult/child haircut quantities by date, branch, and employee.
- [ ] Add search and applicable date/branch/employee/client/status/source filters with a labelled date basis.
- [ ] Derive completed haircut quantities from completed reservations, independently of payment status.
- [ ] Scope employee summaries and detail records to their own permitted records; preserve historical attribution.
- [ ] Test filter/date boundaries, status/source measures, completed-but-unpaid visits, and cross-employee denial; pass targeted checks.

Frontend checklist:

- [ ] Build responsive Arabic overview/reservation and haircut report pages, filters, summaries, and detail navigation.
- [ ] Show date basis and provide normal browser print layouts.

Acceptance:

- [ ] Filtered counts and quantities match permitted records, including completed unpaid visits and retained cancellations/no-shows.

## Phase 10 — Branch and employee performance reports

Depends on: phases 3 and 5–8; reuse phase 9 report filters/authorization.

Outcome: administrator compares branches/barbers; employee sees only their own work and linked financial records.

Backend checklist:

- [ ] Report employee assigned/completed visits, adult/child counts, reserved hours, availability, and linked invoices/payments.
- [ ] Report branch booking/haircut output, employee breakdown, invoices, and related cash receipts.
- [ ] Attribute historical work to the recorded employee/branch even after transfers.
- [ ] Label reserved hours as including travel and identify report date bases; apply relevant search/filters and role ownership.
- [ ] Test transfers, hours, linked-detail authorization, filter boundaries, and cash/invoice separation; pass targeted checks.

Frontend checklist:

- [ ] Build Arabic employee and branch report summaries, breakdowns, detail links, filters, and print layouts.
- [ ] Display own-record scope for employees and label reserved hours/date basis clearly.

Acceptance:

- [ ] Transferring a barber does not move past branch results; employees cannot retrieve another barber's details through reports.

## Phase 11 — Client history and invoice/cash reports

Depends on: phases 4–8; reuse phase 9 report filters/authorization.

Outcome: permitted users can trace client history, invoiced amounts, actual cash, revisions, and corrections.

Backend checklist:

- [ ] Report client contact details, booking history, repeat visits, haircut counts, invoiced totals, and payments within permitted access.
- [ ] Report invoice line items, amounts, unpaid/paid/cancelled states, actual cash received, revisions, and corrections.
- [ ] Keep invoice value, cancelled invoice amounts, and actual cash collected as separate measures; never double-count revisions.
- [ ] Support applicable search/date/branch/employee/client/status/source filters, labelled date bases, summaries, and permitted details.
- [ ] Return browser-print-ready report/invoice data; do not add custom PDF generation or CSV/Excel exports.
- [ ] Test cancelled-but-paid invoices, correction effects, repeat visits, revision deduplication, and employee ownership; pass targeted checks.

Frontend checklist:

- [ ] Build client history and invoice/cash report pages with filters, separate financial measures, and revision/correction details.
- [ ] Build Arabic responsive invoice/report printing through normal browser print/Save as PDF.

Acceptance:

- [ ] A paid cancelled visit and revised invoice appear correctly without inflating invoice totals or hiding recorded cash history.

## Phase 12 — Arabic WhatsApp booking journey

Depends on: phases 2–5 and their shared services. Decision gate: WhatsApp provider/onboarding, AI provider/model, conversation retention, automatic barber-selection tie-breaks, and provider credentials.

Outcome: a client books through the business's single WhatsApp number and receives an Arabic result backed by a committed reservation/invoice.

Backend checklist:

- [ ] Install/configure only the selected provider/AI dependencies and validate credentials without exposing secrets.
- [ ] Implement provider verification, authenticated webhook handling, sender identity, delivery/retry handling, and durable duplicate-operation protection.
- [ ] Implement Arabic conversation state under the agreed retention policy: counts, contact, address/location, date/window, barber/branch choice, and price review.
- [ ] Support named-barber choice or AI selection using the confirmed tie-break policy and offer alternatives on unavailability.
- [ ] Expose narrowly authorized AI tools using the same booking/availability/client services; never give the model direct database/admin access.
- [ ] Save reservation and invoice together with AI source and reply with a reference only after backend success; require no administrator approval.
- [ ] Test duplicate/concurrent webhooks, retries/restarts, sender isolation, validation/conflict alternatives, and failures without false success; pass targeted checks.
- [ ] Verify the real provider conversation once credentials/onboarding are available.

Frontend checklist:

- [ ] Show AI-source bookings and their invoice/details in the existing dashboard and source filters.
- [ ] Verify that WhatsApp-created reservations appear in the appropriate administrator/assigned-employee views.

Acceptance:

- [ ] One Arabic WhatsApp booking creates one reservation/invoice despite retries, and the dashboard displays the committed result.

## Phase 13 — WhatsApp booking lookup and changes

Depends on: phases 6–8 and 12. Decision gate: future-booked self-service policy, lead-time cutoff, terminal-state behavior, and any client-edit pricing policy.

Outcome: the sender finds the correct own reservation and can request permitted rescheduling/cancellation through conversation.

Backend checklist:

- [ ] Implement sender-scoped booking lookup and disambiguation before any mutation.
- [ ] Add permitted client reschedule/cancel tools through shared services; deny arbitrary record IDs and administrator-only/employee-only actions.
- [ ] Apply the confirmed future/state policy, availability commit checks, failed-reschedule rollback, invoice preservation/cancellation, and paid-record safeguards.
- [ ] Apply durable idempotency to reads/mutations/retries as appropriate and provide truthful Arabic results/alternatives after backend completion.
- [ ] Test ambiguous references, cross-client access, terminal/past visits, duplicate operations, booking races, and no false success; pass targeted checks.
- [ ] Verify real lookup/reschedule/cancel conversations under the selected provider.

Frontend checklist:

- [ ] Display WhatsApp-driven changes, cancellations, and permitted history in dashboard detail/report views.
- [ ] Verify the dashboard reflects a failed reschedule's unchanged original booking and a successful conversation's committed changes.

Acceptance:

- [ ] A client changes only their own eligible booking; duplicate messages and rejected changes leave a consistent dashboard and history.

## Phase 14 — Production rollout and complete acceptance

Depends on: all backend slices; whole-product rollout also requires all frontend slices. Decision gate: deployment/backup tooling, HTTPS/domain configuration, integration credentials, and retention/restore procedures.

Backend/operations checklist:

- [ ] Verify migrations on a clean database and the documented upgrade path; validate production secrets and sole-admin setup.
- [ ] Build and verify the API production image and selected deployment configuration with the existing host MySQL.
- [ ] Configure HTTPS, managed processes, database access, safe logs, health/readiness checks, and operational failure handling.
- [ ] Configure backups and successfully restore one into an isolated database; record the restore procedure and evidence.
- [ ] Verify authenticated real WhatsApp delivery, provider retries, and selected AI configuration in the deployment environment.
- [ ] Verify all backend lint/typecheck/tests/builds and real-MySQL booking/payment concurrency, authorization, snapshots, revision, and report acceptance.
- [ ] Document setup, migrations, integrations, deployment, backups/restoration, and remaining operational responsibilities without secrets.

Frontend checklist:

- [ ] Verify all frontend checks and the web production image, Compose wiring, and HTTPS same-origin API behavior.
- [ ] Verify Arabic-only RTL flows on computer/tablet/phone, role access, errors, and normal browser invoice/report printing.
- [ ] Verify every vertical slice end to end against the production-like backend.

Acceptance:

- [ ] Complete product acceptance matches the contract and all required frontend work is verified.
- [ ] Production readiness includes functioning selected integrations, deployment configuration, and proven backup restoration.

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

## Setup verification evidence

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

Docker is unavailable on this computer, so Docker image builds and Compose execution remain unchecked. Frontend validation was outside this task and remains unchecked. No business-feature implementation, schema migration, integration onboarding, production deployment, or Git commit was performed.
