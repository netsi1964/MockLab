/**
 * MockLab Dashboard Server — Main Entry Point
 *
 * Hono server that:
 * - Serves the React dashboard SPA (static files)
 * - Exposes REST API for project and endpoint management
 * - Integrates with RuntimeManager for mock server lifecycle
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { httpBaseUrls, printUrlList, ProjectManager } from "@mocklab/core";
import { RuntimeManager } from "@mocklab/runtime";
import { projectRoutes } from "./routes/projects.ts";
import { endpointRoutes } from "./routes/endpoints.ts";

import { fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";

const DASHBOARD_PORT = parseInt(Deno.env.get("MOCKLAB_PORT") ?? "8080");
const DASHBOARD_BIND_HOST = Deno.env.get("MOCKLAB_DASHBOARD_BIND_HOST") ??
  Deno.env.get("MOCKLAB_BIND_HOST") ??
  "0.0.0.0";
const PROJECTS_DIR = Deno.env.get("MOCKLAB_PROJECTS_DIR") ??
  fromFileUrl(new URL("./projects", import.meta.url));

// Initialize services
const projectManager = new ProjectManager(PROJECTS_DIR);
const runtimeManager = new RuntimeManager(PROJECTS_DIR);
const dashboardBaseUrls = httpBaseUrls(DASHBOARD_PORT, DASHBOARD_BIND_HOST);
const dashboardEndpoints = [
  "GET /api/health",
  "GET /api/projects",
  "POST /api/projects",
  "GET /api/projects/:name",
  "DELETE /api/projects/:name",
  "POST /api/projects/:name/import",
  "POST /api/projects/:name/start",
  "POST /api/projects/:name/stop",
  "POST /api/projects/:name/reset-stats",
  "GET /api/projects/:name/export",
  "GET /api/projects/:name/state",
  "PUT /api/projects/:name/state",
  "POST /api/projects/:name/state/reset",
  "GET /api/projects/:name/endpoints",
  "GET /api/projects/:name/endpoints/:id",
  "PATCH /api/projects/:name/endpoints/:id",
  "POST /api/projects/:name/endpoints/:id/reset",
  "GET /api/projects/:name/endpoints/stats",
  "GET /llm.md",
  "GET /projects/:name/llm.md",
];

await projectManager.init();

const app = new Hono();

// Global middleware
app.use("*", cors({ origin: "*" }));
app.use("*", logger());

// Health check
app.get("/api/health", (c) =>
  c.json({
    success: true,
    data: {
      status: "ok",
      version: "0.1.0",
      projectsDir: PROJECTS_DIR,
      runningProjects: runtimeManager.runningProjects(),
      urls: {
        dashboard: dashboardBaseUrls,
        api: dashboardBaseUrls.map((url) => `${url}/api`),
        llmGuide: dashboardBaseUrls.map((url) => `${url}/llm.md`),
      },
    },
  }));

// LLM-readable repository guide
app.get("/llm.md", async (c) => {
  const guidePath = new URL("../../llm.md", import.meta.url);
  try {
    const content = await Deno.readTextFile(guidePath);
    return c.text(content, 200, {
      "content-type": "text/markdown; charset=utf-8",
    });
  } catch {
    return c.text("llm.md not found", 404);
  }
});

app.get("/projects/:name/llm.md", async (c) => {
  const name = c.req.param("name");
  const config = await projectManager.get(name);
  if (!config) return c.text(`Project "${name}" not found`, 404);

  const mockBindHost = Deno.env.get("MOCKLAB_MOCK_BIND_HOST") ??
    Deno.env.get("MOCKLAB_BIND_HOST") ??
    "0.0.0.0";
  const baseUrls = httpBaseUrls(config.project.port, mockBindHost);
  const baseUrl = baseUrls[0] ??
    `http://${config.project.host}:${config.project.port}`;
  const endpointLines = config.endpoints
    .map((ep) => {
      const auth = ep.authMode === "none" ? "public" : `${ep.authMode} auth`;
      return `- ${ep.method} ${ep.path}
  - URL: ${baseUrl}${ep.path}
  - Status: ${ep.currentStatus}
  - Auth: ${auth}
  - Summary: ${ep.summary}`;
    })
    .join("\n");

  const guide = `# MockLab Project Guide: ${config.project.name}

Purpose: give an LLM enough project-specific context to call and reason about this mock API.

## Project

- Name: ${config.project.name}
- Base URL: ${baseUrl}
- All Base URLs: ${baseUrls.join(", ")}
- Host: ${config.project.host}
- Port: ${config.project.port}
- Running in MockLab: ${
    runtimeManager.isRunning(config.project.name) ? "yes" : "no"
  }
- Endpoint count: ${config.endpoints.length}
- Updated: ${config.project.updatedAt}

## Runtime Files

These files are local runtime artifacts and are not committed to GitHub:

- endpoints.json: endpoint configuration and aggregate stats
- state.json: mock database/state used to produce stable responses
- traffic.har: request/response traffic history in HAR 1.2 format

## How To Use This Mock API

1. Use the Base URL above.
2. Pick an endpoint from the list below.
3. Replace path parameters such as {entityName}, {CompanyId}, {RowId}, etc.
4. Send JSON request bodies for POST/PUT/PATCH operations when required by the imported OpenAPI schema.
5. Inspect the MockLab dashboard Requests tab for exact request/response examples.

## Endpoints

${endpointLines || "_No endpoints imported._"}
`;

  return c.text(guide, 200, {
    "content-type": "text/markdown; charset=utf-8",
  });
});

// API routes
app.route(
  "/api/projects",
  projectRoutes(projectManager, runtimeManager),
);

// Endpoint routes are nested under projects
app.route(
  "/api/projects/:name/endpoints",
  endpointRoutes(PROJECTS_DIR, runtimeManager),
);

// Serve static asset bundle files under /assets/*
app.get("/assets/*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  const filename = pathname.replace(/^\/assets\//, "");
  const ext = filename.split(".").pop() ?? "";
  const filePath = new URL(
    `../dashboard-ui/dist/assets/${filename}`,
    import.meta.url,
  );
  try {
    const content = await Deno.readFile(filePath);
    let contentType = "application/octet-stream";
    if (ext === "js" || ext === "mjs") contentType = "application/javascript";
    else if (ext === "css") contentType = "text/css";
    else if (ext === "png") contentType = "image/png";
    else if (ext === "svg") contentType = "image/svg+xml";
    else if (ext === "ico") contentType = "image/x-icon";

    return c.body(content, 200, { "content-type": contentType });
  } catch {
    return c.text("Not found", 404);
  }
});

// Serve static dashboard UI files (built by Vite)
// In development the Vite dev server runs separately on :5173
app.get("/*", async (c) => {
  const uiDistPath = new URL(
    "../dashboard-ui/dist/index.html",
    import.meta.url,
  );
  try {
    const html = await Deno.readTextFile(uiDistPath);
    return c.html(html);
  } catch {
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>MockLab</title></head>
        <body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f0f13;color:#e8e8ef;">
          <div style="text-align:center">
            <h1>🧪 MockLab API Server</h1>
            <p>Dashboard UI is not built yet.</p>
            <p>Run <code>deno task build:ui</code> or start the Vite dev server.</p>
            <p><a href="/api/health" style="color:#7c6af7">API Health →</a></p>
          </div>
        </body>
      </html>
    `);
  }
});

// Graceful shutdown
const shutdown = async () => {
  console.log("\n⏹ Stopping all mock servers…");
  await runtimeManager.stopAll();
  Deno.exit(0);
};
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

console.log(`\n🧪 MockLab Dashboard Server`);
console.log(`   Bind host: ${DASHBOARD_BIND_HOST}`);
printUrlList("Dashboard URLs", dashboardBaseUrls);
printUrlList("API URLs", dashboardBaseUrls.map((url) => `${url}/api`));
printUrlList("LLM guide URLs", dashboardBaseUrls.map((url) => `${url}/llm.md`));
console.log(`   Dashboard endpoints:`);
for (const baseUrl of dashboardBaseUrls) {
  for (const endpoint of dashboardEndpoints) {
    const [method, path] = endpoint.split(" ");
    console.log(`      ${method} ${baseUrl}${path}`);
  }
}
console.log(`   Projects dir: ${PROJECTS_DIR}\n`);

Deno.serve(
  { port: DASHBOARD_PORT, hostname: DASHBOARD_BIND_HOST },
  app.fetch,
);
