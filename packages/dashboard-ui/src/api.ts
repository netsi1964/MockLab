/**
 * MockLab API Client
 * Typed fetch wrapper for all dashboard server endpoints.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface EndpointStats {
  requestCount: number;
  lastCalled: string | null;
  avgResponseTimeMs: number;
  errorCount: number;
}

export interface RequestLogEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseHeaders?: Record<string, string>;
  responseBody?: string | null;
}

export interface EndpointConfig {
  id: string;
  path: string;
  method: string;
  enabled: boolean;
  currentStatus: number;
  defaultStatus: number;
  delayMs: number;
  authMode: 'none' | 'bearer' | 'basic' | 'api-key';
  failureMode: 'none' | 'random' | 'always' | 'malformed' | 'timeout';
  failureRate: number;
  fakerHandler: string | null;
  overrideResponse: unknown | null;
  summary: string;
  stats: EndpointStats;
  recentRequests: RequestLogEntry[];
}

export interface ProjectMeta {
  name: string;
  port: number;
  host: string;
  description: string;
  isRunning: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConfig {
  project: {
    name: string;
    port: number;
    host: string;
    description: string;
    createdAt: string;
    updatedAt: string;
  };
  endpoints: EndpointConfig[];
  isRunning?: boolean;
}

export type ProjectState = Record<string, unknown>;

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  return res.json() as Promise<ApiResponse<T>>;
}

export const api = {
  // Projects
  listProjects: () => request<ProjectMeta[]>('/api/projects'),
  getProject: (name: string) => request<ProjectConfig>(`/api/projects/${name}`),
  createProject: (data: { name: string; port?: number; description?: string }) =>
    request<ProjectConfig>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  deleteProject: (name: string) =>
    request<null>(`/api/projects/${name}`, { method: 'DELETE' }),
  startProject: (name: string) =>
    request<{ port: number }>(`/api/projects/${name}/start`, { method: 'POST' }),
  stopProject: (name: string) =>
    request<null>(`/api/projects/${name}/stop`, { method: 'POST' }),
  resetStats: (name: string) =>
    request<ProjectConfig>(`/api/projects/${name}/reset-stats`, { method: 'POST' }),
  importSpec: (name: string, specContent: string) =>
    request<ProjectConfig>(`/api/projects/${name}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: specContent,
    }),
  exportProject: (name: string) =>
    `${BASE_URL}/api/projects/${name}/export`,

  // Endpoints
  listEndpoints: (name: string) =>
    request<EndpointConfig[]>(`/api/projects/${name}/endpoints`),
  updateEndpoint: (name: string, id: string, updates: Partial<EndpointConfig>) =>
    request<EndpointConfig>(`/api/projects/${name}/endpoints/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  resetEndpoint: (name: string, id: string) =>
    request<EndpointConfig>(
      `/api/projects/${name}/endpoints/${encodeURIComponent(id)}/reset`,
      { method: 'POST' },
    ),
  getStats: (name: string) =>
    request<{ totalRequests: number; totalErrors: number; activeEndpoints: number }>
      (`/api/projects/${name}/endpoints/stats`),

  // Health
  health: () => request<{ status: string; version: string; runningProjects: string[] }>('/api/health'),

  // State management
  getState: (name: string) => request<ProjectState>(`/api/projects/${name}/state`),
  updateState: (name: string, state: ProjectState) =>
    request<ProjectState>(`/api/projects/${name}/state`, {
      method: 'PUT',
      body: JSON.stringify(state),
    }),
  resetState: (name: string) =>
    request<null>(`/api/projects/${name}/state/reset`, { method: 'POST' }),
};
