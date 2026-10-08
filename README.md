# Just4Kids

Arabic home-visit haircut CRM. Product scope: [docs/project-contract.md](docs/project-contract.md). Working instructions: [AGENTS.md](AGENTS.md).

## Workspace

```text
apps/web             Next.js + React + Tailwind, Arabic RTL
apps/api             Express API
packages/contracts   Shared Zod schemas and TypeScript types
packages/db          Drizzle + mysql2, schema and migrations
packages/config      Shared ESLint and TypeScript configuration
```

Requirements: Node 24 and pnpm 12.4.1. Versions are pinned in `pnpm-workspace.yaml` and `pnpm-lock.yaml`.

## Run

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Web: `http://localhost:3000`. API: `http://127.0.0.1:4000/health`. The web app proxies `/api/*` to Express, so `/api/health` works through the same web origin.

Use one root `.env` based on `.env.example`. API, web configuration, and Drizzle load it; shell/container environment variables take precedence. The API now requires MySQL and the authentication migration before startup so it can create or update the sole administrator. `/health` reports API liveness after startup, not database readiness. The API validates all required authentication and server settings before serving requests.

Set `ADMIN_PHONE` in international format (`+965` followed by eight digits for a Kuwaiti mobile number), `ADMIN_PASSWORD` as plaintext **in the ignored environment file only**, and `AUTH_SECRET` as 32 random bytes encoded as 64 hex characters. The API hashes the password before saving it in MySQL. The local `.env` has the requested editable example phone and `admin1234`; choose a longer unique password before production. Restarting the API after changing the administrator phone/password updates the one administrator and revokes their sessions. Employee credentials and resets are managed only by the administrator. `APP_ORIGIN` must match the browser's web origin exactly, such as `http://localhost:3000` locally.

The browser login flow uses same-origin `/api/auth/csrf` (receive a CSRF token and an HttpOnly pre-login cookie), then `POST /api/auth/login` with `{ "phone": "+96555551234", "password": "..." }` and the token in `X-CSRF-Token`. On success the server sets an HttpOnly, SameSite=Strict session cookie lasting seven days. `GET /api/auth/session` returns the permitted account and a fresh CSRF token; `POST /api/auth/logout` requires that token and revokes the session. The backend returns no bearer token, and the frontend should keep the CSRF token in memory rather than localStorage. The web app implements this flow and keeps the CSRF token in its in-memory query cache.

For production, set `NODE_ENV=production`, use a root `.env.production` based on `.env.production.example`, and run `pnpm build` then `pnpm start`. The API reads `.env.production` in production unless `ENV_FILE` selects another root environment filename. The example binds a directly run API to `127.0.0.1`; Docker Compose overrides `HOST` to `0.0.0.0` inside the private container network. Configure HTTPS `APP_ORIGIN`, a unique administrator password of at least 12 characters, and a random `AUTH_SECRET`. VPS deployment is a later step.

## Checks

| All workspaces, from the root | One workspace, from the root |
| --- | --- |
| `pnpm lint` | `pnpm --filter @just4kids/api lint` |
| `pnpm typecheck` | `pnpm --filter @just4kids/api typecheck` |
| `pnpm test` | `pnpm --filter @just4kids/api test` |
| `pnpm test:watch` | `pnpm --filter @just4kids/api test:watch` |
| `pnpm build` | `pnpm exec turbo run build --filter=@just4kids/api` |
| `pnpm check` | Run the workspace's individual checks |

Replace `api` with `web`, `contracts`, `db`, or `config` for lint/typecheck/test commands. Inside a workspace, use `pnpm lint`, `pnpm typecheck`, or `pnpm test` directly. Config is static and does not require a build task.

Individual app type checks/builds need compiled shared dependencies on a fresh checkout: run `pnpm build` first, or use `pnpm exec turbo run typecheck --filter=@just4kids/api` to build its prerequisites automatically.

Tests live in each workspace's `tests/` directory. Root Vitest projects are named `api`, `web`, `contracts`, `db`, and `config`; `pnpm test --project api` also selects just the API. API, contract, and real database connection smoke tests are present. Web tests run in jsdom (setup `apps/web/tests/setup.ts`) and cover money/time/visit rules, form validation, the API client, and the login form. The empty config test folder permits a no-tests run and claims no feature coverage.

Vitest always loads the root `.env.test`, overriding inherited development connection settings. Use `.env.test.example` for setup. Test commands apply migrations to `just4kids_test` first and require its running MySQL instance. The dedicated test migration config refuses any other database. Both `.env` and `.env.test` are ignored by Git and Docker builds.

## Database

Set `DATABASE_URL` in the root `.env` for the existing MySQL instance on port 3306. Docker uses `DOCKER_DATABASE_URL`, pointing to the host through `host.docker.internal`. URL-encode special characters in credentials.

Development database: `just4kids`. Test database: `just4kids_test`, selected by `.env.test`. These databases are separate from the database belonging to the project the credentials were copied from.

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:migrate:test
pnpm db:studio
```

The first migration creates accounts, sessions, and login-attempt limits. The second creates branches and employee profiles. The third creates weekly work intervals and dated exceptions. The fourth creates clients and reusable service addresses. The fifth (`0004_brown_the_fallen.sql`) creates reservations and their single invoices with historical snapshots. The sixth (`0005_old_dragon_man.sql`) adds visit versions/history and records a system baseline for existing reservations without inventing their earlier transition details. The seventh (`0006_nice_romulus.sql`) adds immutable reservation/invoice edit revisions. The eighth (`0007_married_stark_industries.sql`) adds cash receipts/events with one active receipt per invoice. The account table enforces one administrator and unique phone numbers, and sessions store only hashes of random cookie tokens. Branch adult/child prices are exact `DECIMAL(12,3)` KWD strings; invoice line amounts/totals use `DECIMAL(24,3)` and BigInt fils arithmetic. Haircut durations are descriptive minutes. Generate new migrations after adding later feature tables; migration/studio commands require the configured database. Never add `.env` credentials to Git.

The branch API supports administrator `GET/POST /api/branches` and `GET/PATCH /api/branches/:id`. Branch writes accept `name`, `location`, `adultPrice`, `childPrice`, `adultDurationMinutes`, and `childDurationMinutes`; prices such as `"5.5"` return as `"5.500"`. The employee API supports administrator `GET/POST /api/employees`, `GET/PATCH /api/employees/:id`, and `POST /api/employees/:id/reset-password`. Employees may `GET /api/employees/me`, `GET` their own ID, and `PATCH /api/employees/me` with only `displayName`. Employee responses include their assigned branch name/location. Administrator phone or branch changes, disabling, and password resets are protected by role checks; phone/disable/reset actions revoke affected employee sessions. All browser writes require the current session's `X-CSRF-Token` and matching `APP_ORIGIN`. The dashboard provides branch, barber, password-reset, and own-profile screens.

The schedule API supports administrator `PUT /api/schedules/:employeeId/weekly` with `{ "days": [{ "dayOfWeek": 1, "intervals": [{ "startTime": "09:00", "endTime": "13:00" }] }] }`, replacing the full weekly plan. Weekdays run Sunday `0` through Saturday `6`; an omitted day is closed. `PUT /api/schedules/:employeeId/exceptions/:date` with `{ "intervals": [] }` closes that Kuwait date, or supplies special hours; `DELETE` on the same path restores weekly hours. Administrators can read any `GET /api/schedules/:employeeId`; employees can read only their own ID or `GET /api/schedules/me`. `GET /api/availability/eligible?date=YYYY-MM-DD&startTime=HH:mm&endTime=HH:mm` is administrator-only and returns eligible enabled barbers with branch details and `timeZone: "Asia/Kuwait"`. Windows must stay within one local day and last 20–240 minutes inclusive; touching windows are allowed. Schedule writes require origin and session CSRF protection. The dashboard provides weekly-hours/exception editors, the barber’s own schedule view, and eligible-barber selection during booking. Eligibility now checks saved reservations: booked/arrived/completed block the original window, while cancelled/no-show release it. Weekly edits, exception replacement, and exception deletion return `SCHEDULE_BOOKING_CONFLICT` (409) and roll back if a blocking booking whose reserved end is still in the future in Kuwait would no longer fit; ended bookings retain their historical records and do not prevent schedule edits. Schedule changes and reservation creation hold the same account/employee locks.

The client API is administrator-only: `GET/POST /api/clients`, `GET/PATCH /api/clients/:id`, `GET /api/clients/lookup?phone=%2B96555550101`, `POST /api/clients/:id/addresses`, and `PATCH /api/clients/:id/addresses/:addressId`. URL-encode the leading `+` in phone lookup queries. Search uses `GET /api/clients?q=...&limit=20&offset=0` and returns `{ clients, total, limit, offset }`. Creating a client requires `{ "name": "مريم", "phone": "+96555550101", "address": { "area": "حولي", "block": "3", "street": "شارع 5", "houseNumber": "12" } }`; `buildingName` may replace `houseNumber`. Addresses may also include `floor`, `apartment`, `instructions`, a Google Maps `mapsUrl`, or paired string coordinates `latitude`/`longitude` from a WhatsApp location. One client owns each exact international phone; duplicate phones return `PHONE_ALREADY_USED` (409). Client creation saves the initial address atomically. Nested address edits require the matching client ID; writes require the session CSRF token and matching origin. Reservation creation snapshots the selected address and client contact so later edits preserve historical details. The dashboard provides client search, creation, editing, and address management.

The booking API supports administrator `POST /api/bookings` with `{ "clientId": "<uuid>", "addressId": "<uuid>", "employeeId": "<uuid>", "date": "YYYY-MM-DD", "startTime": "09:00", "endTime": "09:20", "adultCount": 3, "childCount": 0 }`. Counts are integers from 0 through 2,147,483,647 with at least one haircut; the selected address must belong to the client. The start must be strictly in the future in Kuwait, with no extra cutoff. The 20–240 minute window is independent of counts and descriptive haircut durations. Creation rechecks enabled status, working hours, exceptions, and blocking visits under employee locks, then saves one reservation and one invoice atomically. It returns 201 with a `J4K-` reference, historical client/address/barber/branch snapshots, and a nested invoice only after commit. Prices and source cannot be supplied by browser callers. Missing records return 404, invalid input or a non-future start returns 400 (`INVALID_INPUT` or `BOOKING_START_NOT_FUTURE`), and conflicts/disabled barbers return `BARBER_UNAVAILABLE` (409). Writes require origin and session CSRF protection.

`GET /api/bookings?limit=20&offset=0` returns `{ bookings, total, limit, offset }` in descending visit-date/window order. `GET /api/bookings/:id` returns the booking with its invoice and `visitVersion`; `GET /api/bookings/:id/invoice` returns print-ready invoice data, including reference, issue time, quantities, unit prices, line amounts, total, and saved client/address/barber/branch details. Administrator reads cover all records; employee lists are scoped to their own bookings, and another employee's direct booking/invoice ID returns 403. New records use visit `booked`, version `0`, invoice `issued`, payment `unpaid`, currency `KWD`, and no tax. Cash payment recording and paid-edit reconciliation are available below; the dashboard provides booking lists/details and a browser-printable invoice page. The shared internal creation service also accepts trusted WhatsApp sender context and assigns AI source itself; provider wiring/idempotency remain phase 12 work.

The visit API supports `POST /api/bookings/:id/visit` with `{ "status": "arrived", "expectedVersion": 0, "reason": "optional nonempty reason" }` for the administrator or assigned employee. From `booked`, normal actions are `arrived`, `cancelled`, or `no_show`; from `arrived`, they are `completed`, `cancelled`, or `no_show`. Arrival/completion require the reserved start to have been reached; no-show requires the end to have been reached, using Kuwait local time. Cancellation is allowed from booked/arrived without an extra cutoff. Employees cannot change terminal states, reschedule, or reassign. `POST /api/bookings/:id/visit/correction` is administrator-only, accepts any target visit state with `{ "status": "booked", "expectedVersion": 1, "reason": "required correction reason" }`, and rechecks enabled status, working hours/exceptions, and conflicts before restoring a blocking state. Both routes require origin/CSRF protection and return the updated booking with the next version only after visit/invoice/history commit together.

`GET /api/bookings/:id/history` returns `{ events }` in version order, covering creation and every action/correction with previous/new visit and invoice statuses, actor identity/type, UTC timestamp, reason, and correction flag. Administrator/assigned-employee ownership applies. New manual bookings record an administrator creation event; trusted AI bookings record the sender client. Old records receive a migration-time system baseline with a note that earlier details are unavailable. `VISIT_CONFLICT` (409) means the caller's version is stale and they must reload; `INVALID_VISIT_TRANSITION` and `VISIT_TOO_EARLY` also return 409. Invalid payloads/blank correction reasons return 400; unauthorized actors return 403. A restore conflict returns `BARBER_UNAVAILABLE` (409). Cancellation cancels the same invoice, no-show keeps it issued, and corrections away from cancelled restore it to issued. Invoice ID/amounts, payment status, and original window are preserved; no automatic cash refund occurs. The internal client-cancellation service permits only the authenticated sender's own strictly future booked visit (`CLIENT_CANCELLATION_NOT_ALLOWED`, 409 otherwise); WhatsApp wiring remains phase 13, with no public client action endpoint.

Administrator-only `PATCH /api/bookings/:id` accepts a partial edit such as `{ "expectedVersion": 0, "startTime": "10:00", "endTime": "10:20", "adultCount": 2, "reason": "optional nonempty reason" }`. Editable fields are `addressId`, `employeeId`, `date`, `startTime`, `endTime`, `adultCount`, and `childCount`; at least one is required. Only booked visits whose original start is strictly in the future may be edited, and the resulting start must also remain strictly in the future. Prices/source/client identity/status cannot be supplied. Window/barber changes recheck working hours, exceptions, enabled status, and conflicts under shared employee locks. A supplied address must belong to the client and snapshots its current saved details; omitted address/barber fields preserve historical snapshots. Counts and same-recorded-branch reassignment use agreed unit prices; different-branch reassignment uses current destination prices. The transaction retains the booking/reference/invoice IDs and issue time, updates exact amounts, and saves complete before/after snapshots with actor/time/reason.

`GET /api/bookings/:id/revisions` returns `{ revisions }` ordered by version, for the administrator or current assigned employee. Reassignment removes the former employee's access to all booking details and histories. `visitVersion` now advances for edits, visit actions, and payment actions; send its latest value as `expectedVersion` for either. Versions in individual visit-event/revision lists can have gaps. Invalid merged counts/windows return `INVALID_INPUT` (400); a non-future proposed start returns `BOOKING_START_NOT_FUTURE` (400); unavailable windows/barbers return `BARBER_UNAVAILABLE` (409). Stale edits return `BOOKING_CONFLICT` (409); past/arrived/terminal visits return `BOOKING_EDIT_NOT_ALLOWED` (409); paid amount changes require the exact cash reconciliation described below; unchanged edits return `BOOKING_UNCHANGED` (409). Missing records return 404 and employee edits return 403. Browser writes require origin/CSRF protection. Any failure rolls back the reservation, invoice, and revision together. The dashboard provides the administrator edit dialog and revision history; WhatsApp rescheduling remains later work.

`POST /api/bookings/:id/payment` accepts `{ "expectedVersion": 1 }` for the administrator or assigned employee, only after arrival/completion. The server records the full current issued invoice amount as cash; callers cannot supply an amount or another method. It returns `{ booking, payment }`, advances `visitVersion`, and marks the same invoice paid without changing visit status or prices. One active receipt per invoice is enforced transactionally and by a generated unique database key. `POST /api/bookings/:id/payment/undo` is administrator-only and requires `{ "expectedVersion": 2, "paymentId": "<current receipt uuid>", "reason": "required nonempty reason" }`. It voids the mistaken entry, makes the invoice unpaid, and retains history; it does not record a cash refund. A replacement full receipt follows the same state rules.

`GET /api/bookings/:id/payments` returns `{ payment, payments, events }` for the administrator/current assigned employee. `payment` is the active receipt or null; `payments` includes voided receipts. Receipts retain `originalAmount`, `recordedBy`, `recordedAt`, and immutable `bookingAtReceipt` with original invoice/barber/branch details; `amount` is the reconciled current amount. Events retain actor/time/reason, previous/new receipt values, shared version, amount, kind (`recorded`, `voided`, `extra_cash`, `refund`), and the linked invoice-revision ID for adjustments. Undo amounts identify corrected records; they do not represent refunds. Reassignment removes the former employee's access while retaining receipt attribution. Cancellation preserves paid cash/history and creates no refund.

For a paid future-booked edit changing total, `PATCH /api/bookings/:id` must include `reconciliation`, for example `{ "expectedVersion": 3, "adultCount": 2, "reconciliation": { "action": "extra_cash", "amount": "5.125", "reason": "additional cash received" } }`. Use `refund` when the total decreases. The amount is the exact absolute difference as a canonical three-decimal KWD string; a reason is required. The booking, same invoice, same active receipt, revision, and cash adjustment commit atomically; the original full receipt and its attribution remain intact. Paid edits preserving total require no adjustment; reconciliation on unpaid/unchanged totals is refused. The normal future-booked restrictions still apply. These are explicit amendments to a full payment, rather than partial/split payments.

Payment and paid-edit errors return 409: `PAYMENT_NOT_ALLOWED`, `PAYMENT_ALREADY_RECORDED`, `PAYMENT_CONFLICT`, `PAYMENT_RECORD_MISSING`, `RECONCILIATION_REQUIRED`, `RECONCILIATION_MISMATCH`, or `RECONCILIATION_NOT_ALLOWED`. Invalid input returns 400, missing bookings return 404, and role/ownership/CSRF denial returns 403. All writes require the usual origin/session CSRF protection and latest shared version. No provider, online/partial payment, or public client payment action was added. The dashboard provides cash recording, administrator undo, paid-edit reconciliation, and cash history.

Employee login now rechecks the verified phone as well as enabled status and password hash while locking the account before session creation. An in-progress login with the old phone is rejected if an administrator changes the phone before that step.

## Web dashboard

`apps/web` is an Arabic-only, right-to-left Next.js dashboard for the implemented backend (phases 1–8). Screens: login; bookings list/detail/new booking, visit actions, administrator corrections and edits, cash recording/undo/reconciliation, history tabs, and a printable invoice; clients and addresses; barbers with weekly hours and dated exceptions; branches and prices; the barber’s own schedule and profile. Employees see only their own bookings and pages; administrator pages show a clear message if opened directly by an employee. The API remains authoritative for every rule.

Design system:

- Tokens live in `apps/web/src/app/globals.css` as CSS variables for light (`:root`) and dark (`.dark`) themes, mapped to Tailwind with `@theme inline`. Components use token classes only (`bg-card`, `text-muted-foreground`, `bg-status-booked-soft`, …), never raw colors. Brand colors: teal primary, sun-yellow accent, cool mist background.
- Typeface: Readex Pro (Arabic + Latin), bundled through `@fontsource-variable/readex-pro` with no external font request. Digits are Western (0–9); phones, amounts, and references render left-to-right inside Arabic text through the `Ltr` component.
- UI primitives are shadcn/ui (Radix) components in `apps/web/src/components/ui`, configured by `apps/web/components.json` with `rtl: true`. Add more with `pnpm dlx shadcn@4.21.0 add <name>` from `apps/web`, then check the import path (`@/lib/utils`) and RTL behaviour.
- Theme: light, dark, or system, via `next-themes`. Print styles always use the light palette.
- Data: TanStack Query hooks in `apps/web/src/lib/api/hooks.ts` call the same-origin `/api` proxy, attach the session CSRF token to writes, sign out on 401, and reload a booking after stale-version conflicts. Forms use react-hook-form with Arabic Zod schemas in `apps/web/src/lib/forms.ts`, built on the shared contracts.
- Money is computed in integer fils (`lib/money.ts`); dates and times are Kuwait-local (`lib/kuwait-time.ts`).

## Docker

`docker.web` builds the Next.js standalone server; `docker.api` builds and packages the Express API with production dependencies. Both run as non-root users. `.dockerignore` excludes secrets and local build/dependency artifacts.

```sh
pnpm docker:up
pnpm docker:down
```

Compose runs web and API and uses your existing host MySQL; it does not create another MySQL container. The API stays on the private container network. Web is published on `127.0.0.1:3000` for a host reverse proxy; set `WEB_BIND_ADDRESS`/`WEB_PORT` if needed. The host MySQL listener and account must allow connections from containers. Compose requires `API_ENV_FILE` to name the API's production environment file. Set `API_ENV_FILE=.env.production` and `DOCKER_DATABASE_URL` in that file, then run `pnpm docker:up` after migrating the database. The `docker:*` scripts pass `.env.production` to Compose so it can interpolate `DOCKER_DATABASE_URL`; the API container also receives the selected file through `env_file`. Docker packaging has not been verified on this computer.

The internal API address is a web build argument, so rebuild web when changing it. Docker is required for image builds and Compose execution.
