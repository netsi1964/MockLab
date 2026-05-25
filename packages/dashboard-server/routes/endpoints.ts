/**
 * MockLab Dashboard Server — Endpoint Routes
 */

import { Hono } from "hono";
import type { ApiResponse, EndpointConfig, ProjectConfig } from "@mocklab/core";
import { configService } from "@mocklab/core";
import { RuntimeManager } from "@mocklab/runtime";

export function endpointRoutes(
  projectsDir: string,
  runtimeManager: RuntimeManager,
): Hono {
  const app = new Hono();

  // GET /api/projects/:name/endpoints
  app.get("/", async (c) => {
    const name = c.req.param("name");
    const config = await configService.read(projectsDir, name);
    if (!config) {
      return c.json<ApiResponse<never>>(
        { success: false, error: "Project not found" },
        404,
      );
    }
    return c.json<ApiResponse<EndpointConfig[]>>({
      success: true,
      data: config.endpoints,
    });
  });

  // GET /api/projects/:name/endpoints/:id
  app.get("/:id", async (c) => {
    const { name, id } = c.req.param();
    const config = await configService.read(projectsDir, name);
    const ep = config?.endpoints.find((e) => e.id === decodeURIComponent(id));
    if (!ep) {
      return c.json<ApiResponse<never>>(
        { success: false, error: "Endpoint not found" },
        404,
      );
    }
    return c.json<ApiResponse<EndpointConfig>>({ success: true, data: ep });
  });

  // PATCH /api/projects/:name/endpoints/:id
  app.patch("/:id", async (c) => {
    const { name, id } = c.req.param();
    const updates = await c.req.json<Partial<EndpointConfig>>();
    try {
      const config = await configService.updateEndpoint(
        projectsDir,
        name,
        decodeURIComponent(id),
        updates,
      );
      const ep = config.endpoints.find(
        (e) => e.id === decodeURIComponent(id),
      )!;
      // Notify the runtime of the change (config is re-read on every request)
      await runtimeManager.updateEndpoint(name, ep);
      return c.json<ApiResponse<EndpointConfig>>({ success: true, data: ep });
    } catch (err) {
      return c.json<ApiResponse<never>>(
        { success: false, error: String(err) },
        404,
      );
    }
  });

  // POST /api/projects/:name/endpoints/:id/reset
  app.post("/:id/reset", async (c) => {
    const { name, id } = c.req.param();
    const config = await configService.read(projectsDir, name);
    if (!config) {
      return c.json<ApiResponse<never>>(
        { success: false, error: "Project not found" },
        404,
      );
    }
    const ep = config.endpoints.find((e) => e.id === decodeURIComponent(id));
    if (!ep) {
      return c.json<ApiResponse<never>>(
        { success: false, error: "Endpoint not found" },
        404,
      );
    }

    const resetUpdates: Partial<EndpointConfig> = {
      enabled: true,
      currentStatus: ep.defaultStatus,
      delayMs: 0,
      authMode: "none",
      failureMode: "none",
      failureRate: 0.5,
      overrideResponse: null,
      stats: {
        requestCount: 0,
        lastCalled: null,
        avgResponseTimeMs: 0,
        errorCount: 0,
      },
      recentRequests: [],
    };

    const updated = await configService.updateEndpoint(
      projectsDir,
      name,
      decodeURIComponent(id),
      resetUpdates,
    );
    const resetEp = updated.endpoints.find(
      (e) => e.id === decodeURIComponent(id),
    )!;
    return c.json<ApiResponse<EndpointConfig>>({
      success: true,
      data: resetEp,
    });
  });

  // GET /api/projects/:name/stats
  app.get("/stats", async (c) => {
    const name = c.req.param("name");
    const config = await configService.read(projectsDir, name);
    if (!config) {
      return c.json<ApiResponse<never>>(
        { success: false, error: "Project not found" },
        404,
      );
    }
    const stats = config.endpoints.reduce(
      (acc, ep) => ({
        totalRequests: acc.totalRequests + ep.stats.requestCount,
        totalErrors: acc.totalErrors + ep.stats.errorCount,
        activeEndpoints: acc.activeEndpoints + (ep.enabled ? 1 : 0),
        endpoints: [
          ...acc.endpoints,
          { id: ep.id, path: ep.path, method: ep.method, stats: ep.stats },
        ],
      }),
      {
        totalRequests: 0,
        totalErrors: 0,
        activeEndpoints: 0,
        endpoints: [] as {
          id: string;
          path: string;
          method: string;
          stats: EndpointConfig["stats"];
        }[],
      },
    );
    return c.json<ApiResponse<typeof stats>>({ success: true, data: stats });
  });

  return app;
}
