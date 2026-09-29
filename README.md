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
pnpm dev
```

Web: `http://localhost:3000`. API: `http://127.0.0.1:4000/health`. The web app proxies `/api/*` to Express, so `/api/health` works through the same web origin.

Use one root `.env` based on `.env.example`. API, web configuration, and Drizzle load it; shell/container environment variables take precedence. Development can start without MySQL; `/health` reports API liveness, not database readiness. `NODE_ENV`, `HOST`, and `PORT` are validated by the API at startup.

For production, run `pnpm build`, then `pnpm start` with production environment values. VPS deployment is a later step.

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

Vitest always loads the root `.env.test`, overriding inherited development connection settings. Use `.env.test.example` for setup. Tests require `DATABASE_URL` to select `just4kids_test`; the database smoke test needs the running MySQL instance. Both `.env` and `.env.test` are ignored by Git and Docker builds.

## Database

Set `DATABASE_URL` in the root `.env` for the existing MySQL instance on port 3306. Docker uses `DOCKER_DATABASE_URL`, pointing to the host through `host.docker.internal`. URL-encode special characters in credentials.

Development database: `just4kids`. Test database: `just4kids_test`, selected by `.env.test`. These databases are separate from the database belonging to the project the credentials were copied from.

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

The schema starts empty; no business tables or migrations are invented during scaffolding. Generate migrations after adding tables; migration/studio commands require the configured database. Never add `.env` credentials to Git.

## Docker

`docker.web` builds the Next.js standalone server; `docker.api` builds and packages the Express API with production dependencies. Both run as non-root users. `.dockerignore` excludes secrets and local build/dependency artifacts.

```sh
pnpm docker:up
pnpm docker:down
```

Compose runs web and API and uses your existing host MySQL; it does not create another MySQL container. The API stays on the private container network. Web is published on `127.0.0.1:3000` for a host reverse proxy; set `WEB_BIND_ADDRESS`/`WEB_PORT` if needed. The host MySQL listener and account must allow connections from containers.

The internal API address is a web build argument, so rebuild web when changing it. Docker is required for image builds and Compose execution.
