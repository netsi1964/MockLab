/**
 * MockLab Dashboard Server — Project Routes
 */

import { Hono } from "hono";
import type {
  ApiResponse,
  ProjectConfig,
  ProjectMeta,
  RequestLogEntry,
} from "@mocklab/core";
import {
  importService,
  ProjectManager,
  trafficLogService,
} from "@mocklab/core";
import { RuntimeManager } from "@mocklab/runtime";

async function readProjectState(
  projectsDir: string,
  projectName: string,
): Promise<Record<string, unknown>> {
  try {
    const content = await Deno.readTextFile(
      `${projectsDir}/${projectName}/state.json`,
    );
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function requestPathname(path: string): string {
  try {
    return new URL(path, "http://mocklab.local").pathname;
  } catch {
    return path.split("?")[0] || path;
  }
}

function parseCrudPath(
  pathname: string,
): { entityName: string | null; rowId: number | null } {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments[0].toLowerCase() === "crud") {
    return {
      entityName: segments[1],
      rowId: segments[2] ? parseInt(segments[2]) : null,
    };
  }
  if (segments.length >= 2 && segments[0].toLowerCase() === "query") {
    return { entityName: segments[1], rowId: null };
  }
  return { entityName: null, rowId: null };
}

function responseFromState(
  state: Record<string, unknown>,
  req: RequestLogEntry,
  overrideResponse: unknown | null,
): unknown | undefined {
  if (overrideResponse !== null) return overrideResponse;

  const pathname = requestPathname(req.path);
  if (pathname === "/companies" && "companies" in state) {
    return state.companies;
  }

  const { entityName, rowId } = parseCrudPath(pathname);
  const entities = state.entities as Record<string, unknown[]> | undefined;
  if (entityName && entities?.[entityName]) {
    if (pathname.startsWith("/query")) return entities[entityName];
    if (rowId !== null && req.method === "GET") {
      return entities[entityName].find((item) => {
        return typeof item === "object" &&
          item !== null &&
          "rowId" in item &&
          item.rowId === rowId;
      });
    }
  }

  const endpointState = state.endpoints as Record<string, unknown> | undefined;
  return endpointState?.[`${req.method} ${pathname}`];
}

async function attachTrafficAndBackfillResponses(
  projectsDir: string,
  config: ProjectConfig,
): Promise<ProjectConfig> {
  const endpointsWithTraffic = await Promise.all(
    config.endpoints.map(async (ep) => {
      const harRequests = await trafficLogService.recentForEndpoint(
        projectsDir,
        config.project.name,
        ep.id,
      );
      return {
        ...ep,
        recentRequests: harRequests.length > 0
          ? harRequests
          : ep.recentRequests ?? [],
      };
    }),
  );

  const hasMissingResponses = endpointsWithTraffic.some((ep) =>
    ep.recentRequests.some((req) => req.responseBody === undefined)
  );
  const state = hasMissingResponses
    ? await readProjectState(projectsDir, config.project.name)
    : {};

  return {
    ...config,
    endpoints: endpointsWithTraffic.map((ep) => ({
      ...ep,
      recentRequests: ep.recentRequests.map((req) => {
        if (req.responseBody !== undefined) return req;

        const response = responseFromState(state, req, ep.overrideResponse);
        return {
          ...req,
          responseHeaders: req.responseHeaders ?? {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          },
          responseBody: response === undefined
            ? null
            : JSON.stringify(response, null, 2),
        };
      }),
    })),
  };
}

export function projectRoutes(
  manager: ProjectManager,
  runtimeManager: RuntimeManager,
): Hono {
  const app = new Hono();

  // GET /api/projects — list all projects
  app.get("/", async (c) => {
    const projects = await manager.list();
    const enriched = projects.map((p) => ({
      ...p,
      isRunning: runtimeManager.isRunning(p.name),
    }));
    return c.json<ApiResponse<ProjectMeta[]>>({
      success: true,
      data: enriched,
    });
  });

  // POST /api/projects — create a project
  app.post("/", async (c) => {
    const body = await c.req.json<{
      name: string;
      port?: number;
      host?: string;
      description?: string;
    }>();
    if (!body.name) {
      return c.json<ApiResponse<never>>(
        { success: false, error: "name is required" },
        400,
      );
    }
    try {
      const config = await manager.create(body.name, {
        port: body.port,
        host: body.host,
        description: body.description,
      });
      return c.json<ApiResponse<ProjectConfig>>(
        { success: true, data: config },
        201,
      );
    } catch (err) {
      return c.json<ApiResponse<never>>(
        { success: false, error: String(err) },
        409,
      );
    }
  });

  // GET /api/projects/:name
  app.get("/:name", async (c) => {
    const config = await manager.get(c.req.param("name"));
    if (!config) {
      return c.json<ApiResponse<never>>(
        { success: false, error: "Project not found" },
        404,
      );
    }
    const projectsDir =
      (manager as unknown as { projectsDir: string }).projectsDir;
    const enrichedConfig = await attachTrafficAndBackfillResponses(
      projectsDir,
      config,
    );
    return c.json<ApiResponse<ProjectConfig & { isRunning: boolean }>>({
      success: true,
      data: {
        ...enrichedConfig,
        isRunning: runtimeManager.isRunning(config.project.name),
      },
    });
  });

  // DELETE /api/projects/:name
  app.delete("/:name", async (c) => {
    const name = c.req.param("name");
    if (runtimeManager.isRunning(name)) {
      await runtimeManager.stop(name);
    }
    try {
      await manager.delete(name);
      return c.json<ApiResponse<null>>({ success: true, data: null });
    } catch (err) {
      return c.json<ApiResponse<never>>(
        { success: false, error: String(err) },
        404,
      );
    }
  });

  // POST /api/projects/:name/import — import OpenAPI spec
  app.post("/:name/import", async (c) => {
    const name = c.req.param("name");
    const contentType = c.req.header("content-type") ?? "";

    let specContent: string;
    let filename: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("spec") as File | null;
      if (!file) {
        return c.json<ApiResponse<never>>(
          { success: false, error: "spec file is required" },
          400,
        );
      }
      specContent = await file.text();
      filename = file.name;
    } else {
      specContent = await c.req.text();
    }

    try {
      const config = await importService.import(
        (manager as unknown as { projectsDir: string }).projectsDir,
        name,
        specContent,
        filename,
      );
      return c.json<ApiResponse<ProjectConfig>>({
        success: true,
        data: config,
      });
    } catch (err) {
      return c.json<ApiResponse<never>>(
        { success: false, error: String(err) },
        400,
      );
    }
  });

  // POST /api/projects/:name/start
  app.post("/:name/start", async (c) => {
    const name = c.req.param("name");
    const config = await manager.get(name);
    if (!config) {
      return c.json<ApiResponse<never>>(
        { success: false, error: "Project not found" },
        404,
      );
    }
    try {
      await runtimeManager.start(config);
      const status = runtimeManager.getStatus(name);
      return c.json<
        ApiResponse<{ port: number; host: string | null; baseUrls: string[] }>
      >({
        success: true,
        data: {
          port: config.project.port,
          host: status.host,
          baseUrls: status.baseUrls ?? [],
        },
      });
    } catch (err: any) {
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: err.message || String(err),
          code: err.code,
          projectUsingPort: err.projectUsingPort,
        } as any,
        500,
      );
    }
  });

  // POST /api/projects/:name/stop
  app.post("/:name/stop", async (c) => {
    const name = c.req.param("name");
    await runtimeManager.stop(name);
    return c.json<ApiResponse<null>>({ success: true, data: null });
  });

  // POST /api/projects/:name/reset-stats
  app.post("/:name/reset-stats", async (c) => {
    const name = c.req.param("name");
    try {
      const config = await manager.resetStats(name);
      return c.json<ApiResponse<ProjectConfig>>({
        success: true,
        data: config,
      });
    } catch (err) {
      return c.json<ApiResponse<never>>(
        { success: false, error: String(err) },
        404,
      );
    }
  });

  // GET /api/projects/:name/export
  app.get("/:name/export", async (c) => {
    const name = c.req.param("name");
    try {
      const json = await manager.export(name);
      return new Response(json, {
        headers: {
          "content-type": "application/json",
          "content-disposition": `attachment; filename="${name}-config.json"`,
        },
      });
    } catch (err) {
      return c.json<ApiResponse<never>>(
        { success: false, error: String(err) },
        404,
      );
    }
  });

  // GET /api/projects/:name/state
  app.get("/:name/state", async (c) => {
    const name = c.req.param("name");
    try {
      const state = await manager.readState(name);
      return c.json<ApiResponse<any>>({ success: true, data: state });
    } catch (err) {
      return c.json<ApiResponse<never>>(
        { success: false, error: String(err) },
        500,
      );
    }
  });

  // PUT /api/projects/:name/state
  app.put("/:name/state", async (c) => {
    const name = c.req.param("name");
    try {
      const state = await c.req.json();
      await manager.writeState(name, state);
      return c.json<ApiResponse<any>>({ success: true, data: state });
    } catch (err) {
      return c.json<ApiResponse<never>>(
        { success: false, error: String(err) },
        500,
      );
    }
  });

  // POST /api/projects/:name/state/reset
  app.post("/:name/state/reset", async (c) => {
    const name = c.req.param("name");
    try {
      await manager.resetState(name);
      return c.json<ApiResponse<null>>({ success: true, data: null });
    } catch (err) {
      return c.json<ApiResponse<never>>(
        { success: false, error: String(err) },
        500,
      );
    }
  });

  return app;
}
