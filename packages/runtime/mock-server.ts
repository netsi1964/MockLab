/**
 * MockLab Built-in Mock Server
 *
 * A lightweight Hono-based mock server that reads endpoints.json
 * and serves realistic responses directly — no Prism or Node needed.
 *
 * Per request:
 *  1. Match endpoint by method + path (supports {param} templates)
 *  2. Apply auth check
 *  3. Apply failure injection
 *  4. Apply artificial delay
 *  5. Return: static overrideResponse > faker-generated > inferred static example
 */

import { Hono } from "npm:hono@^4";
import { cors } from "npm:hono@^4/cors";
import type { EndpointConfig, HttpMethod, ProjectConfig } from "@mocklab/core";
import { configService, httpBaseUrls, statsTracker } from "@mocklab/core";
import { join, toFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/** Convert OpenAPI path template to a RegExp */
function pathToRegex(template: string): RegExp {
  const pattern = template
    .replace(/\//g, "\\/")
    .replace(/\{[^}]+\}/g, "([^/]+)");
  return new RegExp(`^${pattern}$`);
}

function normalizePathAndMethod(
  method: string,
  pathname: string,
): { method: string; pathname: string } {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 3 && segments[0].toLowerCase() === "crud") {
    const action = segments[1].toLowerCase();
    const entity = segments[2];
    if (action === "query") {
      return { method: "POST", pathname: `/query/${entity}` };
    }
    if (action === "read") {
      return { method: "GET", pathname: `/crud/${entity}/1` };
    }
    if (action === "update") {
      return { method: "PUT", pathname: `/crud/${entity}/1` };
    }
    if (action === "delete") {
      return { method: "DELETE", pathname: `/crud/${entity}/1` };
    }
  }
  return { method, pathname };
}

function findEndpoint(
  endpoints: EndpointConfig[],
  method: string,
  pathname: string,
): EndpointConfig | null {
  const norm = normalizePathAndMethod(method, pathname);
  return (
    endpoints.find(
      (ep) =>
        ep.method === (norm.method.toUpperCase() as HttpMethod) &&
        pathToRegex(ep.path).test(norm.pathname),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Response generation
// ---------------------------------------------------------------------------

function shouldFail(ep: EndpointConfig): boolean {
  if (ep.failureMode === "always") return true;
  if (ep.failureMode === "random") return Math.random() < ep.failureRate;
  return false;
}

/**
 * Generate a mock response body.
 * Priority: overrideResponse > faker handler > inferred static value
 */
// deno-lint-ignore no-explicit-any
async function generateBody(
  ep: EndpointConfig,
  projectsDir: string,
  projectName: string,
): Promise<any> {
  if (ep.overrideResponse !== null) return ep.overrideResponse;

  if (ep.fakerHandler) {
    try {
      const fakerFile = join(projectsDir, projectName, "faker.ts");
      const fakerUrl = toFileUrl(fakerFile).href + "?t=" + Date.now();
      const mod = await import(fakerUrl);
      if (
        mod?.handlers && typeof mod.handlers[ep.fakerHandler] === "function"
      ) {
        return mod.handlers[ep.fakerHandler]();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[${projectName}] Kunne ikke køre faker handler "${ep.fakerHandler}":`,
        message,
      );
    }
  }

  return {
    _mock: true,
    endpoint: `${ep.method} ${ep.path}`,
    handler: ep.fakerHandler ?? "unknown",
    note: "Edit faker.ts to customize this response",
  };
}

// ---------------------------------------------------------------------------
// Stateful Mock Persistence
// ---------------------------------------------------------------------------

class StateManager {
  private statePath: string;

  constructor(projectsDir: string, projectName: string) {
    this.statePath = join(projectsDir, projectName, "state.json");
  }

  async read(): Promise<any> {
    try {
      const content = await Deno.readTextFile(this.statePath);
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  async write(data: any): Promise<void> {
    try {
      await Deno.writeTextFile(this.statePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("Error writing state.json:", err);
    }
  }
}

function parseCrudPath(
  pathname: string,
): { entityName: string | null; rowId: number | null } {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments[0].toLowerCase() === "crud") {
    const entityName = segments[1];
    const rowId = segments[2] ? parseInt(segments[2]) : null;
    return { entityName, rowId };
  }
  if (segments.length >= 2 && segments[0].toLowerCase() === "query") {
    const entityName = segments[1];
    return { entityName, rowId: null };
  }
  return { entityName: null, rowId: null };
}

// ---------------------------------------------------------------------------
// Mock server factory
// ---------------------------------------------------------------------------

export interface MockServerInstance {
  port: number;
  bindHost: string;
  baseUrls: string[];
  stop: () => Promise<void>;
}

export async function startMockServer(
  config: ProjectConfig,
  projectsDir: string,
): Promise<MockServerInstance> {
  const { port } = config.project;
  const bindHost = Deno.env.get("MOCKLAB_MOCK_BIND_HOST") ??
    Deno.env.get("MOCKLAB_BIND_HOST") ??
    "0.0.0.0";
  const projectName = config.project.name;

  const app = new Hono();
  app.use("*", cors({ origin: "*" }));

  // Catch-all handler
  app.all("*", async (c) => {
    const start = Date.now();
    const method = c.req.method;
    const url = new URL(c.req.url);
    const pathname = url.pathname;
    const requestTarget = `${url.pathname}${url.search}`;

    let requestBody: string | null = null;
    if (["POST", "PUT", "PATCH"].includes(method)) {
      try {
        requestBody = await c.req.raw.clone().text();
      } catch {}
    }

    // Re-read config on every request for live updates
    const latest = await configService.read(projectsDir, projectName);
    const endpoints = latest?.endpoints ?? config.endpoints;

    const ep = findEndpoint(endpoints, method, pathname);

    if (!ep) {
      return c.json(
        { error: "Not found", path: requestTarget, method },
        404,
      );
    }

    const recordResponse = (
      statusCode: number,
      responseBody: unknown,
      responseHeaders: Record<string, string> = {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
    ) => {
      const elapsed = Date.now() - start;
      statsTracker.record(projectsDir, projectName, ep.id, {
        timestamp: new Date().toISOString(),
        method: method as HttpMethod,
        path: requestTarget,
        statusCode,
        responseTimeMs: elapsed,
        requestHeaders: c.req.header(),
        requestBody,
        responseHeaders,
        responseBody: responseBody == null
          ? null
          : typeof responseBody === "string"
          ? responseBody
          : JSON.stringify(responseBody, null, 2),
      }).catch((err) => {
        console.error(
          `[runtime] Error recording stats for ${projectName}:`,
          err,
        );
      });
      return elapsed;
    };

    const jsonResponse = (responseBody: unknown, statusCode: number) => {
      const elapsed = recordResponse(statusCode, responseBody);
      console.log(
        `[${projectName}] ${method} ${pathname} → ${statusCode} (${elapsed}ms)`,
      );
      return c.json(responseBody, statusCode as never);
    };

    if (!ep.enabled) {
      return jsonResponse({ error: "Endpoint disabled" }, 404);
    }

    // Auth check
    if (ep.authMode === "bearer") {
      const auth = c.req.header("authorization") ?? "";
      if (!auth.startsWith("Bearer ")) {
        return jsonResponse(
          { error: "Unauthorized — Bearer token required" },
          401,
        );
      }
    } else if (ep.authMode === "basic") {
      const auth = c.req.header("authorization") ?? "";
      if (!auth.startsWith("Basic ")) {
        return jsonResponse(
          { error: "Unauthorized — Basic auth required" },
          401,
        );
      }
    } else if (ep.authMode === "api-key") {
      const key = c.req.header("x-api-key") ?? c.req.query("api_key") ?? "";
      if (!key) {
        return jsonResponse({ error: "Unauthorized — API key required" }, 401);
      }
    }

    // Failure injection
    if (ep.failureMode === "timeout") {
      await new Promise((r) => setTimeout(r, 30_000));
      return jsonResponse({ error: "Gateway Timeout" }, 504);
    }
    if (ep.failureMode === "malformed") {
      const responseBody = "{{broken_json:";
      const responseHeaders = {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      };
      const elapsed = recordResponse(
        ep.currentStatus,
        responseBody,
        responseHeaders,
      );
      console.log(
        `[${projectName}] ${method} ${pathname} → ${ep.currentStatus} (${elapsed}ms)`,
      );
      return new Response("{{broken_json:", {
        status: ep.currentStatus,
        headers: responseHeaders,
      });
    }
    if (shouldFail(ep)) {
      return jsonResponse(
        { error: "Simulated failure", endpoint: `${method} ${pathname}` },
        500,
      );
    }

    // Artificial delay
    if (ep.delayMs > 0) {
      await new Promise((r) => setTimeout(r, ep.delayMs));
    }

    // Read/write state.json persistence
    const stateMgr = new StateManager(projectsDir, projectName);
    const state = await stateMgr.read();

    let body: any = null;

    if (ep.overrideResponse !== null) {
      body = ep.overrideResponse;
    } else {
      const { entityName, rowId } = parseCrudPath(pathname);
      const isCrud = entityName !== null;

      if (isCrud) {
        if (!state.entities) state.entities = {};
        if (!state.entities[entityName]) {
          let initialData = [];
          if (ep.fakerHandler) {
            const val = await generateBody(ep, projectsDir, projectName);
            initialData = Array.isArray(val) ? val : [val];
          }
          state.entities[entityName] = initialData;
          await stateMgr.write(state);
        }

        const entities = state.entities[entityName];

        if (pathname.startsWith("/query")) {
          body = entities;
          try {
            const reqBody = await c.req.json();
            if (reqBody && Array.isArray(reqBody.filters)) {
              body = entities.filter((item: any) => {
                return reqBody.filters.every((f: any) => {
                  if (!f.field || f.value === undefined) return true;
                  const itemVal = item[f.field];
                  if (itemVal === undefined) return true;
                  if (f.operator === "equals") {
                    return String(itemVal) === String(f.value);
                  }
                  return true;
                });
              });
            }
          } catch {}
        } else if (rowId !== null) {
          if (method === "GET") {
            const found = entities.find((item: any) => item.rowId === rowId);
            if (found) {
              body = found;
            } else {
              body = await generateBody(ep, projectsDir, projectName);
              if (typeof body === "object" && body !== null) {
                body.rowId = rowId;
                body.entityName = entityName;
              }
              entities.push(body);
              await stateMgr.write(state);
            }
          } else if (method === "PUT") {
            let reqData: any = {};
            try {
              reqData = await c.req.json();
            } catch {}
            const index = entities.findIndex((item: any) =>
              item.rowId === rowId
            );
            if (index !== -1) {
              entities[index] = {
                ...entities[index],
                ...reqData,
                rowId,
                updated: new Date().toISOString(),
              };
              body = entities[index];
            } else {
              return jsonResponse({
                error: "Not found",
                message: `Entity ${entityName} with rowId ${rowId} not found`,
              }, 404);
            }
            await stateMgr.write(state);
          } else if (method === "DELETE") {
            const index = entities.findIndex((item: any) =>
              item.rowId === rowId
            );
            if (index !== -1) {
              entities.splice(index, 1);
              await stateMgr.write(state);
            }
            body = await generateBody(ep, projectsDir, projectName);
          }
        } else {
          if (method === "GET") {
            body = entities;
          } else if (method === "POST") {
            let reqData: any = {};
            try {
              reqData = await c.req.json();
            } catch {}
            const maxRowId = entities.reduce(
              (max: number, item: any) => Math.max(max, item.rowId || 0),
              0,
            );
            const newRowId = maxRowId + 1;
            const newEntity = {
              ...reqData,
              entityName,
              rowId: newRowId,
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
            };
            entities.push(newEntity);
            await stateMgr.write(state);
            body = newEntity;
          }
        }
      } else if (pathname === "/companies") {
        if (!state.companies) {
          state.companies = await generateBody(ep, projectsDir, projectName);
          await stateMgr.write(state);
        }
        body = state.companies;
      } else {
        if (!state.endpoints) state.endpoints = {};
        const cacheKey = `${method} ${pathname}`;
        if (!state.endpoints[cacheKey]) {
          state.endpoints[cacheKey] = await generateBody(
            ep,
            projectsDir,
            projectName,
          );
          await stateMgr.write(state);
        }
        body = state.endpoints[cacheKey];
      }
    }

    return jsonResponse(body, ep.currentStatus);
  });

  const controller = new AbortController();

  const server = Deno.serve(
    {
      port,
      hostname: bindHost,
      signal: controller.signal,
      onListen: () => {},
    },
    app.fetch,
  );

  return {
    port,
    bindHost,
    baseUrls: httpBaseUrls(port, bindHost),
    stop: async () => {
      controller.abort();
      await server.finished;
    },
  };
}
