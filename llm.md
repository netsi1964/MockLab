# MockLab LLM Guide

Purpose: give an AI coding agent a compact, high-signal map of this repository.

## Product Summary

MockLab is a local API mock platform for OpenAPI-driven workflows.

It can:
- import OpenAPI specs into editable mock projects
- generate endpoint configuration and faker handlers
- run mock HTTP servers per project
- inspect requests/responses in a React dashboard
- persist mock state in local JSON
- store HTTP traffic in HAR format
- expose project control through CLI and MCP

## Repository Shape

```text
.
  deno.json                       Deno workspace and repo tasks
  README.md                       human-facing overview
  llm.md                          this LLM-facing repo guide
  docs/
    PRD.md                        product requirements and scope
    walkthrough.md                architecture walkthrough
  openapi/
    uniconta.yaml                 sample OpenAPI spec
  packages/
    core/                         shared types, OpenAPI import, config, HAR logging
    runtime/                      built-in Hono mock server
    dashboard-server/             Hono dashboard/API server
    dashboard-ui/                 React/Vite dashboard frontend
    cli/                          Deno CLI
    mcp/                          MCP server for AI/tool control
  scripts/
    start-all.ts                  convenience launcher
    generate-postman.ts           Postman export generator
  postman/                        sample generated Postman artifacts
```

## Runtime Data Model

Generated project data lives under a projects directory. In local development the default is:

```text
packages/dashboard-server/projects/<project-name>/
  endpoints.json                  endpoint config and aggregate stats
  faker.ts                        editable generated response handlers
  openapi.yaml|json               imported source spec copy
  state.json                      runtime mock database, local only
  traffic.har                     request/response history, local only
```

Important separation:
- `endpoints.json` is configuration plus aggregate counters.
- `state.json` is runtime mock database state.
- `traffic.har` is detailed request/response traffic using HAR 1.2.
- UI `recentRequests` are hydrated from `traffic.har` by server routes; they should not be serialized into `endpoints.json`.

Do not commit runtime project data. `.gitignore` excludes:
- `/packages/dashboard-server/projects/`
- `/projects/`
- `**/traffic.har`
- `**/state.json`
- build output, dependencies, and local compiled CLI binaries

## Core Packages

### `packages/core`

Key files:
- `types.ts`: shared TypeScript interfaces for projects, endpoints, request logs, HAR structures and OpenAPI parsing.
- `config-service.ts`: atomic `endpoints.json` read/write with in-memory per-project locking. Strips `recentRequests` before writing.
- `traffic-log.ts`: writes and reads `traffic.har`; converts between MockLab request logs and HAR 1.2 entries.
- `stats-tracker.ts`: updates aggregate endpoint stats and records detailed traffic through `traffic-log.ts`.
- `openapi-parser.ts`: parses OpenAPI specs.
- `schema-infer.ts`: creates example-ish data from schemas.
- `faker-generator.ts`: generates editable `faker.ts` handlers.
- `import-service.ts`: import pipeline from OpenAPI to `endpoints.json`, `faker.ts` and spec copy.
- `project-manager.ts`: project create/list/delete/export, reset stats, and state helpers.

When changing persistence behavior, check `config-service.ts`, `traffic-log.ts`, `stats-tracker.ts`, and `project-manager.ts` together.

### `packages/runtime`

Key files:
- `mock-server.ts`: Hono mock server factory. Matches endpoint routes, applies auth/failure/delay, reads/writes state, returns responses and records stats/traffic.
- `runtime-manager.ts`: starts/stops one mock server per project.

Request flow:
1. Match method + OpenAPI-style path.
2. Re-read endpoint config for live updates.
3. Apply endpoint disabled/auth/failure/timeout/malformed behavior.
4. Apply latency.
5. Generate or read persisted state.
6. Return response.
7. Record aggregate stats and HAR traffic.

### `packages/dashboard-server`

Key files:
- `main.ts`: Hono API server, static UI serving, `/llm.md` serving, route mounting.
- `routes/projects.ts`: project CRUD/import/export/start/stop/reset/state APIs. Attaches HAR traffic to API project payloads.
- `routes/endpoints.ts`: endpoint list/get/update/reset/stats APIs. Hydrates `recentRequests` from HAR.

### `packages/dashboard-ui`

React/Vite frontend.

Key files:
- `src/api.ts`: typed fetch wrapper.
- `src/components/Layout.tsx`: top navigation, theme toggle, GitHub and LLM guide links.
- `src/pages/ProjectsPage.tsx`: project list/import/start/delete flows.
- `src/pages/ProjectDetailPage.tsx`: endpoint list, config editor, request inspector, `.http`/curl helpers, state editor.

Request inspector behavior:
- shows recent request rows from API `recentRequests`
- expands to request `.http` preview, request headers/body, response headers/body
- supports `Get .http`, `Copy .http`, `Get curl`, `Copy curl`, `Copy request`, `Copy response`
- filters replay-unsafe headers such as `accept-encoding`, `host`, `connection`, `content-length`, and `postman-token`

## Public APIs

Dashboard server API:
- `GET /api/health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:name`
- `DELETE /api/projects/:name`
- `POST /api/projects/:name/import`
- `POST /api/projects/:name/start`
- `POST /api/projects/:name/stop`
- `POST /api/projects/:name/reset-stats`
- `GET /api/projects/:name/export`
- `GET /api/projects/:name/state`
- `PUT /api/projects/:name/state`
- `POST /api/projects/:name/state/reset`
- `GET /api/projects/:name/endpoints`
- `GET /api/projects/:name/endpoints/:id`
- `PATCH /api/projects/:name/endpoints/:id`
- `POST /api/projects/:name/endpoints/:id/reset`
- `GET /api/projects/:name/endpoints/stats`
- `GET /llm.md`

## Common Commands

```bash
# Run dashboard server
deno task dev

# Build frontend
deno task build:ui

# Run full Deno tests
deno task test

# Frontend dev server
cd packages/dashboard-ui
npm run dev

# Frontend checks
cd packages/dashboard-ui
npm run lint
npm run build
```

Useful verification before commits:

```bash
npm run lint --prefix packages/dashboard-ui
npm run build --prefix packages/dashboard-ui
deno fmt --check packages/
deno check packages/core/traffic-log.ts packages/runtime/mock-server.ts packages/dashboard-server/routes/projects.ts packages/dashboard-server/routes/endpoints.ts
deno test --allow-all packages/
```

## Design Constraints And Conventions

- Prefer Deno std APIs and Hono patterns already in the repo.
- Keep runtime artifacts out of Git.
- Keep `endpoints.json` as configuration, not traffic history.
- Keep detailed HTTP request/response history in `traffic.har`.
- Keep stateful mock data in `state.json`.
- Do not add new databases unless the task explicitly requires it.
- Frontend is utilitarian dashboard UI; avoid marketing-page patterns inside the app.
- Use lucide-react icons when adding dashboard buttons.
- Use existing API client patterns in `src/api.ts`.
- Use existing inline style/class conventions unless doing a broader UI cleanup.

## High-Risk Areas

- `config-service.ts`: must avoid race conditions and must not write `recentRequests` to config.
- `traffic-log.ts`: HAR conversion must preserve method, URL/path/query, headers, request body, response body, status and timings.
- `mock-server.ts`: request body can only be read once unless using cloned raw request.
- `ProjectDetailPage.tsx`: button density and long paths/headers can overflow if layout changes are careless.
- Runtime project folders contain local data and should remain ignored.

## If You Need To Add A Feature

1. Identify whether it is config, state, traffic, runtime behavior, dashboard API, frontend UI, CLI, or MCP.
2. Keep persistence in the correct file:
   - config or stats: `endpoints.json`
   - mock data: `state.json`
   - request/response history: `traffic.har`
3. Add or update types in `packages/core/types.ts`.
4. Keep dashboard API responses stable for the frontend where possible.
5. Run lint/build/check/test commands before finishing.
