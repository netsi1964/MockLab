/**
 * MockLab MCP Server
 *
 * Exposes MockLab's project and endpoint management as MCP tools
 * so AI agents (Claude, Cursor, etc.) can control mock behavior.
 *
 * Run with: deno run --allow-all main.ts
 *
 * Add to Claude Desktop config:
 * {
 *   "mcpServers": {
 *     "mocklab": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "/path/to/packages/mcp/main.ts"]
 *     }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE = Deno.env.get("MOCKLAB_API") ?? "http://localhost:8080";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
const TOOLS = [
  // Project tools
  {
    name: "list_projects",
    description: "List all MockLab mock API projects and their status (running/stopped, port, endpoint count).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_project",
    description: "Get detailed information about a specific MockLab project including all endpoints and their configuration.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The project name" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_project",
    description: "Create a new MockLab mock API project.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name (lowercase, hyphens allowed)" },
        description: { type: "string", description: "Optional description" },
        port: { type: "number", description: "Port to run on (auto-assigned if not specified)" },
      },
      required: ["name"],
    },
  },
  {
    name: "start_project",
    description: "Start the mock API server for a project.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The project name" },
      },
      required: ["name"],
    },
  },
  {
    name: "stop_project",
    description: "Stop the mock API server for a project.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The project name" },
      },
      required: ["name"],
    },
  },

  // Endpoint tools
  {
    name: "list_endpoints",
    description: "List all endpoints for a MockLab project with their current configuration (status, delay, auth mode, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The project name" },
      },
      required: ["project"],
    },
  },
  {
    name: "update_endpoint",
    description: "Update the configuration of a specific endpoint. Can change status code, delay, auth mode, failure mode, or override response.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The project name" },
        endpointId: { type: "string", description: "Endpoint ID (format: METHOD:path, e.g. GET:/users)" },
        enabled: { type: "boolean", description: "Enable or disable the endpoint" },
        currentStatus: { type: "number", description: "HTTP status code to return (e.g. 200, 401, 500)" },
        delayMs: { type: "number", description: "Artificial delay in milliseconds (0-30000)" },
        authMode: {
          type: "string",
          enum: ["none", "bearer", "basic", "api-key"],
          description: "Authentication mode to simulate",
        },
        failureMode: {
          type: "string",
          enum: ["none", "random", "always", "malformed", "timeout"],
          description: "Failure simulation mode",
        },
        failureRate: {
          type: "number",
          description: "Failure probability 0-1 (used when failureMode is 'random')",
        },
        overrideResponse: {
          description: "Static JSON response to return instead of faker-generated payload. Set to null to clear.",
        },
      },
      required: ["project", "endpointId"],
    },
  },
  {
    name: "reset_endpoint",
    description: "Reset an endpoint to its default configuration (status 200, no delay, no failures).",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The project name" },
        endpointId: { type: "string", description: "Endpoint ID (format: METHOD:path)" },
      },
      required: ["project", "endpointId"],
    },
  },
  {
    name: "inject_failure",
    description: "Enable failure simulation on an endpoint (always fail, random, malformed, or timeout).",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The project name" },
        endpointId: { type: "string", description: "Endpoint ID" },
        mode: {
          type: "string",
          enum: ["always", "random", "malformed", "timeout"],
          description: "Failure mode to inject",
        },
        rate: {
          type: "number",
          description: "Failure rate 0-1 (only used for 'random' mode, default 0.5)",
        },
      },
      required: ["project", "endpointId", "mode"],
    },
  },
  {
    name: "disable_endpoint",
    description: "Disable an endpoint so it returns 404 for all requests.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The project name" },
        endpointId: { type: "string", description: "Endpoint ID" },
      },
      required: ["project", "endpointId"],
    },
  },

  // Stats tools
  {
    name: "get_stats",
    description: "Get request statistics for a project (total requests, errors, per-endpoint breakdown).",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The project name" },
      },
      required: ["project"],
    },
  },
  {
    name: "reset_stats",
    description: "Reset all request statistics for a project.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The project name" },
      },
      required: ["project"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function handleTool(name: string, args: Record<string, any>): Promise<string> {
  switch (name) {
    case "list_projects": {
      const projects = await apiGet<unknown[]>("/api/projects");
      return JSON.stringify(projects, null, 2);
    }
    case "get_project": {
      const project = await apiGet<unknown>(`/api/projects/${args.name}`);
      return JSON.stringify(project, null, 2);
    }
    case "create_project": {
      const project = await apiPost<unknown>("/api/projects", {
        name: args.name,
        description: args.description,
        port: args.port,
      });
      return `Project "${args.name}" created successfully.\n${JSON.stringify(project, null, 2)}`;
    }
    case "start_project": {
      const result = await apiPost<{ port: number }>(`/api/projects/${args.name}/start`);
      return `Project "${args.name}" started on port :${result.port}`;
    }
    case "stop_project": {
      await apiPost(`/api/projects/${args.name}/stop`);
      return `Project "${args.name}" stopped.`;
    }
    case "list_endpoints": {
      const endpoints = await apiGet<unknown[]>(`/api/projects/${args.project}/endpoints`);
      return JSON.stringify(endpoints, null, 2);
    }
    case "update_endpoint": {
      const { project, endpointId, ...updates } = args;
      const ep = await apiPatch<unknown>(
        `/api/projects/${project}/endpoints/${encodeURIComponent(endpointId)}`,
        updates,
      );
      return `Endpoint "${endpointId}" updated.\n${JSON.stringify(ep, null, 2)}`;
    }
    case "reset_endpoint": {
      const ep = await apiPost<unknown>(
        `/api/projects/${args.project}/endpoints/${encodeURIComponent(args.endpointId)}/reset`,
      );
      return `Endpoint "${args.endpointId}" reset to defaults.\n${JSON.stringify(ep, null, 2)}`;
    }
    case "inject_failure": {
      const ep = await apiPatch<unknown>(
        `/api/projects/${args.project}/endpoints/${encodeURIComponent(args.endpointId)}`,
        {
          failureMode: args.mode,
          failureRate: args.rate ?? 0.5,
        },
      );
      return `Failure mode "${args.mode}" injected into "${args.endpointId}".\n${JSON.stringify(ep, null, 2)}`;
    }
    case "disable_endpoint": {
      const ep = await apiPatch<unknown>(
        `/api/projects/${args.project}/endpoints/${encodeURIComponent(args.endpointId)}`,
        { enabled: false },
      );
      return `Endpoint "${args.endpointId}" disabled.\n${JSON.stringify(ep, null, 2)}`;
    }
    case "get_stats": {
      const stats = await apiGet<unknown>(`/api/projects/${args.project}/endpoints/stats`);
      return JSON.stringify(stats, null, 2);
    }
    case "reset_stats": {
      await apiPost(`/api/projects/${args.project}/reset-stats`);
      return `Stats reset for project "${args.project}".`;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------
const server = new Server(
  {
    name: "mocklab",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    // deno-lint-ignore no-explicit-any
    const result = await handleTool(name, (args ?? {}) as Record<string, any>);
    return {
      content: [{ type: "text", text: result }],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("MockLab MCP server running (stdio)");
