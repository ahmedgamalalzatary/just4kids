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

The browser login flow uses same-origin `/api/auth/csrf` (receive a CSRF token and an HttpOnly pre-login cookie), then `POST /api/auth/login` with `{ "phone": "+96555551234", "password": "..." }` and the token in `X-CSRF-Token`. On success the server sets an HttpOnly, SameSite=Strict session cookie lasting seven days. `GET /api/auth/session` returns the permitted account and a fresh CSRF token; `POST /api/auth/logout` requires that token and revokes the session. The backend returns no bearer token, and the frontend should keep the CSRF token in memory rather than localStorage. The frontend login page is still pending.

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

Tests live in each workspace's `tests/` directory. Root Vitest projects are named `api`, `web`, `contracts`, `db`, and `config`; `pnpm test --project api` also selects just the API. API, contract, and real database connection smoke tests are present. The empty web/config test folders permit no-tests runs until behavior is implemented; they do not claim feature coverage.

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

The first migration creates accounts, sessions, and login-attempt limits. The second creates branches and employee profiles. The third creates weekly work intervals and dated exceptions. The fourth creates clients and reusable service addresses. The account table enforces one administrator and unique phone numbers, and sessions store only hashes of random cookie tokens. Branch adult/child prices are exact `DECIMAL(12,3)` KWD strings; haircut durations are descriptive minutes. Generate new migrations after adding later feature tables; migration/studio commands require the configured database. Never add `.env` credentials to Git.

The branch API supports administrator `GET/POST /api/branches` and `GET/PATCH /api/branches/:id`. Branch writes accept `name`, `location`, `adultPrice`, `childPrice`, `adultDurationMinutes`, and `childDurationMinutes`; prices such as `"5.5"` return as `"5.500"`. The employee API supports administrator `GET/POST /api/employees`, `GET/PATCH /api/employees/:id`, and `POST /api/employees/:id/reset-password`. Employees may `GET /api/employees/me`, `GET` their own ID, and `PATCH /api/employees/me` with only `displayName`. Employee responses include their assigned branch name/location. Administrator phone or branch changes, disabling, and password resets are protected by role checks; phone/disable/reset actions revoke affected employee sessions. All browser writes require the current session's `X-CSRF-Token` and matching `APP_ORIGIN`. The frontend for these flows is still pending.

The schedule API supports administrator `PUT /api/schedules/:employeeId/weekly` with `{ "days": [{ "dayOfWeek": 1, "intervals": [{ "startTime": "09:00", "endTime": "13:00" }] }] }`, replacing the full weekly plan. Weekdays run Sunday `0` through Saturday `6`; an omitted day is closed. `PUT /api/schedules/:employeeId/exceptions/:date` with `{ "intervals": [] }` closes that Kuwait date, or supplies special hours; `DELETE` on the same path restores weekly hours. Administrators can read any `GET /api/schedules/:employeeId`; employees can read only their own ID or `GET /api/schedules/me`. `GET /api/availability/eligible?date=YYYY-MM-DD&startTime=HH:mm&endTime=HH:mm` is administrator-only and returns eligible enabled barbers with branch details and `timeZone: "Asia/Kuwait"`. Windows must stay within one local day and last 20–240 minutes inclusive; touching windows are allowed. Schedule writes require origin and session CSRF protection. These APIs have no frontend yet. The shared availability decision handles booked, arrived, completed, cancelled, and no-show conflicts; the reservation queries and schedule-edit booking guard will be connected when Phase 5 introduces bookings. Until then, the eligibility endpoint evaluates working hours and exceptions only.

The client API is administrator-only: `GET/POST /api/clients`, `GET/PATCH /api/clients/:id`, `GET /api/clients/lookup?phone=%2B96555550101`, `POST /api/clients/:id/addresses`, and `PATCH /api/clients/:id/addresses/:addressId`. URL-encode the leading `+` in phone lookup queries. Search uses `GET /api/clients?q=...&limit=20&offset=0` and returns `{ clients, total, limit, offset }`. Creating a client requires `{ "name": "مريم", "phone": "+96555550101", "address": { "area": "حولي", "block": "3", "street": "شارع 5", "houseNumber": "12" } }`; `buildingName` may replace `houseNumber`. Addresses may also include `floor`, `apartment`, `instructions`, a Google Maps `mapsUrl`, or paired string coordinates `latitude`/`longitude` from a WhatsApp location. One client owns each exact international phone; duplicate phones return `PHONE_ALREADY_USED` (409). Client creation saves the initial address atomically. Nested address edits require the matching client ID; writes require the session CSRF token and matching origin. Phase 5 will snapshot the selected address into each reservation. The frontend for this flow is pending.

## Docker

`docker.web` builds the Next.js standalone server; `docker.api` builds and packages the Express API with production dependencies. Both run as non-root users. `.dockerignore` excludes secrets and local build/dependency artifacts.

```sh
pnpm docker:up
pnpm docker:down
```

Compose runs web and API and uses your existing host MySQL; it does not create another MySQL container. The API stays on the private container network. Web is published on `127.0.0.1:3000` for a host reverse proxy; set `WEB_BIND_ADDRESS`/`WEB_PORT` if needed. The host MySQL listener and account must allow connections from containers. Compose requires `API_ENV_FILE` to name the API's production environment file. Set `API_ENV_FILE=.env.production` and `DOCKER_DATABASE_URL` in that file, then run `docker compose --env-file .env.production up --detach --build` after migrating the database. Docker packaging has not been verified on this computer.

The internal API address is a web build argument, so rebuild web when changing it. Docker is required for image builds and Compose execution.
