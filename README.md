# MockLab

> Open source developer tool for rapidly spinning up configurable mock API
> environments from OpenAPI specifications.

## Features

- 📄 Import OpenAPI 3.x YAML specifications
- 🤖 Auto-generate realistic mock APIs with faker-js
- ⚡ Customize endpoint behavior at runtime (no restart needed)
- 📁 Manage multiple isolated mock projects
- 🔍 Inspect request traffic and statistics
- 💥 Simulate failures, latency, and auth scenarios
- 🖥️ Admin dashboard UI
- 🔧 CLI (`mocklab`)
- 🤝 MCP server for AI agent control

## Quick Start

### 1. Easy One-Command Startup (Recommended)

Starts the dashboard backend server AND automatically boots up all imported mock
project environments in one go:

```bash
deno task mocklab
```

MockLab binds dashboard and mock servers to `0.0.0.0` by default, so they can be
reached from other devices on the same network if your firewall allows it. On
startup the console prints all detected URLs, including LAN URLs for the
dashboard, API, LLM guides, and each running mock endpoint.

Optional network environment variables:

```bash
# Restrict everything to local machine only
MOCKLAB_BIND_HOST=localhost deno task mocklab

# Force the public URL printed in logs, useful behind tunnels or reverse proxies
MOCKLAB_PUBLIC_HOST=mocklab.example.test deno task mocklab

# Use different bind hosts for dashboard and mock APIs
MOCKLAB_DASHBOARD_BIND_HOST=0.0.0.0 MOCKLAB_MOCK_BIND_HOST=localhost deno task mocklab
```

### Temporary public tunnel

For quick external access, use the Cloudflare quick tunnel task. It requires
`cloudflared` locally, but no Cloudflare account or config.

```bash
# Expose the default Uniconta/mock API on localhost:4010
deno task tunnel

# Expose the dashboard instead
deno task tunnel http://localhost:8080
```

The task runs:

```bash
cloudflared tunnel --url http://localhost:4010
```

and prints a temporary `https://<random>.trycloudflare.com` URL. The tunnel
stays open until you press `Ctrl+C`.

### 2. Manual Step-by-Step Startup

If you prefer to start things manually:

```bash
# 1. Install the CLI (requires Deno)
deno install --allow-all --global -f -n mocklab packages/cli/main.ts

# 2. Start the backend server (terminal 1 — keep running)
deno task dev --cwd packages/dashboard-server

# 3. Drop your OpenAPI spec in the openapi/ folder
cp my-api.yaml openapi/

# 4. Create a project and import the spec (terminal 2)
mocklab create my-api
mocklab import my-api.yaml --project my-api

# 5. Start the mock server
mocklab run my-api
# → Mock API is now live on http://localhost:4010

# 6. Open the dashboard UI (optional)
cd packages/dashboard-ui && npm run dev
# → Dashboard at http://localhost:5173
```

## Importing your OpenAPI spec

MockLab supports OpenAPI **3.x** in both YAML (`.yaml` / `.yml`) and JSON
(`.json`) format.

### Where to place your file

Drop your spec into the **`openapi/`** folder at the root of this project:

```
/mocklab
  /openapi
    my-api.yaml        ← place it here
    another-api.yaml
```

MockLab will find it automatically by filename — no path needed.

### Import via CLI (recommended)

```bash
# 1. Start the MockLab server (keep this running)
deno task dev --cwd packages/dashboard-server

# 2. Create a project
mocklab create my-api

# 3. Import — just the filename, MockLab looks in openapi/ automatically
mocklab import my-api.yaml --project my-api

# 4. Start the mock server
mocklab run my-api
```

You can also point to a file anywhere on disk using a full or relative path:

```bash
mocklab import ./some/other/path.yaml --project my-api
mocklab import /absolute/path/to/spec.json --project my-api
```

### Import via Dashboard UI

1. Start the server: `deno task dev --cwd packages/dashboard-server`
2. Start the UI: `cd packages/dashboard-ui && npm run dev`
3. Open `http://localhost:5173`
4. Click **New project**, then **Import** on the project card
5. Paste your YAML/JSON and click **Import**

### What gets generated

After a successful import, your project folder will contain:

```
/projects/my-api/
  openapi.yaml          # copy of your original spec
  endpoints.json        # endpoint configuration and aggregate stats
  faker.ts              # auto-generated faker handlers (safe to edit)
  state.json            # local mock database, created at runtime
  traffic.har           # local request/response history, created at runtime
  overrides/            # per-endpoint static response overrides
```

You can freely edit `faker.ts` to customize the generated mock data.

`state.json` and `traffic.har` are runtime artifacts and should not be
committed. The root `.gitignore` excludes local project runtime data by default.

## Exporting to Postman

You can convert any imported project's spec to a Postman Collection v2.1.0 JSON
file and a matching Environment JSON file, both configured for MockLab.

```bash
deno task generate-postman --project <project-name>
```

This will read the spec and write two files to the `postman/` folder:

1. **`postman/<project-name>.json`** (The Postman Collection)
2. **`postman/<project-name>-environment.json`** (The Postman Environment)

The collection includes:

- **Folders** grouped logically based on your OpenAPI paths.
- **Bearer auth** configured to reference the `{{accessToken}}` environment
  variable for all endpoints outside of `/auth/*`.
- **Pre-request/test scripts** on `/auth/login` to automatically extract and
  save the `accessToken` and `refreshToken` variables into your Postman
  environment.
- **Request bodies** inferred from your schemas, with Postman placeholders like
  `{{username}}` and `{{password}}` pre-filled.
- **Saved examples** for all documented response statuses.

Alternatively, you can convert a specific YAML/JSON file directly by passing its
path:

```bash
deno task generate-postman openapi/uniconta.json
```

### 1. Download Postman

If you don't have Postman installed, you can download the official desktop
application:

- [Download Postman](https://www.postman.com/downloads/)

### 2. How to Import the Collection & Environment

1. Open the Postman application.
2. Click the **Import** button in the top-left panel (or press `Cmd+O` /
   `Ctrl+O`).
3. Drag and drop both generated JSON files (located in your local `postman/`
   folder) into the import window.
4. Click **Import** to add both the collection and the environment.
5. Select the newly imported environment (e.g. `MockLab Uniconta`) from the
   environment dropdown in the top-right corner of Postman.

### 3. Environment Variables

The generated environment file contains the following default variables:

| Variable          | Example / Initial Value | Description                                                                      |
| :---------------- | :---------------------- | :------------------------------------------------------------------------------- |
| `mocklabsBaseUrl` | `http://localhost:4010` | The URL of the running MockLab project runtime.                                  |
| `username`        | `admin`                 | Test username used in the login payload.                                         |
| `password`        | `secret123`             | Test password used in the login payload.                                         |
| `companyId`       | `1`                     | Default company identifier.                                                      |
| `appId`           | `mock-app`              | Application ID used in mock contexts.                                            |
| `entityName`      | `Debtor`                | Default entity type for CRUD requests (e.g., `Debtor`, `Creditor`, `GLAccount`). |
| `rowId`           | `1`                     | Default ID used for individual entity lookups, updates, and deletes.             |
| `accessToken`     | _(empty)_               | Populated automatically by the login test script.                                |
| `refreshToken`    | _(empty)_               | Populated automatically by the login test script.                                |

**Authenticate**: Open the **Auth** folder in Postman and run the **Log ind og
få access token** request. The built-in test script will automatically retrieve
the `accessToken` and `refreshToken` from the response and save them to your
active environment so all subsequent requests are fully authenticated!

## Project Structure

```
/mocklab
  deno.json                    # workspace root
  /openapi                     # ← drop your .yaml files here
    my-api.yaml
  /postman                     # ← generated Postman collection JSONs
    my-api.json
  /packages
    /core                      # OpenAPI parser, config service, file locking
    /runtime                   # Built-in mock server (Hono-based, no external runtime needed)
    /dashboard-server          # Hono API + static serving
    /dashboard-ui              # React + Vite + shadcn/ui
    /cli                       # mocklab CLI
    /mcp                       # MCP server
  /projects                    # generated mock projects (gitignored)
  /scripts                     # utility and helper scripts
    generate-postman.ts        # converts OpenAPI specs to Postman Collections
    start-all.ts               # starts server + all mock projects automatically
  /docs
    PRD.md
```

---

## Dashboard UI

The dashboard is a React + Vite app that gives you a visual interface to manage
all your mock projects and endpoints.

### Starting the UI

```bash
# Terminal 1 — backend API server
deno task dev --cwd packages/dashboard-server

# Terminal 2 — Vite dev server (hot reload)
cd packages/dashboard-ui && npm run dev
```

Open `http://localhost:5173` in your browser.

### Projects view

The landing page lists all your mock projects as cards. From here you can:

| Action                 | How                                     |
| ---------------------- | --------------------------------------- |
| Create a new project   | **New project** button (top right)      |
| Import an OpenAPI spec | **Import** button on any project card   |
| Start / stop a project | **Start** / **Stop** button on the card |
| Delete a project       | 🗑 button on the card                    |
| Open a project         | Click anywhere on the card              |

### Endpoint management view

Clicking a project opens the endpoint list. Each row shows the HTTP method,
path, current status code, and any active modifiers (delay, failure, auth).

Click an endpoint to open the **configuration panel** on the right side:

**Configuration tab:**

| Setting           | What it does                                                 |
| ----------------- | ------------------------------------------------------------ |
| Response status   | Return a specific HTTP status code (200, 401, 500, …)        |
| Latency           | Add an artificial delay in ms (0–5000)                       |
| Auth mode         | Simulate required auth: Bearer token, Basic, or API key      |
| Failure mode      | Inject failures: random, always, malformed JSON, or timeout  |
| Failure rate      | Probability of failure when mode is "random" (0–100%)        |
| Override response | Return a hardcoded JSON payload instead of the generated one |

**Requests tab:** Shows the last 50 requests made to the endpoint — method,
path, status, response time, request headers/body and response headers/body.
Detailed traffic is stored in each project's `traffic.har` file using the
standard HAR 1.2 structure; endpoint configuration stays in `endpoints.json`.

All changes apply immediately without restarting the mock server.

---

## Stateful Persistence & Mock Database

MockLab supports stateful mock persistence out of the box using a local
`state.json` file inside each project. When you call CRUD or custom endpoints,
the mock server reads and writes to this database state dynamically.

### How it works

1. **CRUD Endpoints**: Calls to `GET /crud/:entityName`,
   `POST /crud/:entityName`, `PUT /crud/:entityName/:rowId`, and
   `DELETE /crud/:entityName/:rowId` automatically read from and update the
   stateful entities database.
2. **Query Endpoints**: Calls to `POST /query/:entityName` allow filtering
   collections based on request payload filters.
3. **Company & Endpoint Caching**: Calls to `/companies` and other endpoints are
   cached in the state file after initial generation so they remain consistent
   across calls.

### State Management via Dashboard UI

You can view, edit, and reset the project database state directly in the
**Database State** tab on the Project Detail page.

- **Database Insights**: Displays metrics like total records, collections, and
  the record count breakdown.
- **State Document Editor**: A full JSON editor featuring real-time syntax
  validation, a "Format Document" option, and a save action.
- **Reset State**: Instantly clear/reset the state file to trigger fresh dynamic
  mock generation from faker schemas.

---

## MCP Server

MockLab exposes an [MCP](https://modelcontextprotocol.io) server so AI
assistants like **Claude Desktop** or **Cursor** can control your mock
environments through natural language.

### Setup with Claude Desktop

Add the following to your Claude Desktop config
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "mocklab": {
      "command": "deno",
      "args": [
        "run",
        "--allow-all",
        "/absolute/path/to/MockLab/packages/mcp/main.ts"
      ],
      "env": {
        "MOCKLAB_API": "http://localhost:8080"
      }
    }
  }
}
```

Make sure the MockLab dashboard server is running before starting Claude
Desktop.

### Available tools

#### Project tools

| Tool             | Description                                           |
| ---------------- | ----------------------------------------------------- |
| `list_projects`  | List all projects and their running status            |
| `get_project`    | Get full details of a project including all endpoints |
| `create_project` | Create a new mock project                             |
| `start_project`  | Start the mock server for a project                   |
| `stop_project`   | Stop the mock server for a project                    |

#### Endpoint tools

| Tool               | Description                                                              |
| ------------------ | ------------------------------------------------------------------------ |
| `list_endpoints`   | List all endpoints for a project                                         |
| `update_endpoint`  | Update any field on an endpoint (status, delay, auth, failure, override) |
| `reset_endpoint`   | Reset an endpoint to its default configuration                           |
| `inject_failure`   | Enable failure simulation on an endpoint                                 |
| `disable_endpoint` | Disable an endpoint so it returns 404                                    |

#### Stats tools

| Tool          | Description                          |
| ------------- | ------------------------------------ |
| `get_stats`   | Get request statistics for a project |
| `reset_stats` | Reset all stats for a project        |

### Example prompts

Once connected to Claude Desktop you can use natural language:

```
"Make the GET /users endpoint return a 429 status with a 2 second delay"

"Disable the POST /orders endpoint"

"Inject a 50% random failure on GET /payments"

"Show me the request stats for my crm-api project"

"Reset all endpoint configuration for crm-api back to defaults"

"Create a new project called erp-api and tell me which port it's on"
```

---

## Stack

- **Runtime:** Deno + TypeScript
- **Backend:** Hono
- **Frontend:** React + Vite + shadcn/ui
- **Mock Runtime:** Built-in Hono server (reads `endpoints.json` live)
- **Fake Data:** faker-js
- **AI Control:** MCP TypeScript SDK

## License

MIT
