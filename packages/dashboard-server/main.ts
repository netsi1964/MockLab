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
import { ProjectManager } from "@mocklab/core";
import { RuntimeManager } from "@mocklab/runtime";
import { projectRoutes } from "./routes/projects.ts";
import { endpointRoutes } from "./routes/endpoints.ts";

import { fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";

const DASHBOARD_PORT = parseInt(Deno.env.get("MOCKLAB_PORT") ?? "8080");
const PROJECTS_DIR = Deno.env.get("MOCKLAB_PROJECTS_DIR") ??
  fromFileUrl(new URL("./projects", import.meta.url));

// Initialize services
const projectManager = new ProjectManager(PROJECTS_DIR);
const runtimeManager = new RuntimeManager(PROJECTS_DIR);

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
console.log(`   API: http://localhost:${DASHBOARD_PORT}/api`);
console.log(`   UI:  http://localhost:${DASHBOARD_PORT}/`);
console.log(`   Projects dir: ${PROJECTS_DIR}\n`);

Deno.serve({ port: DASHBOARD_PORT }, app.fetch);
