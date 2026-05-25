/**
 * MockLab Core Types
 * Shared TypeScript type definitions used across all packages.
 */

// ---------------------------------------------------------------------------
// Endpoint Configuration
// ---------------------------------------------------------------------------

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type AuthMode = "none" | "bearer" | "basic" | "api-key";

export type FailureMode =
  | "none"
  | "random"
  | "always"
  | "malformed"
  | "timeout";

export interface EndpointStats {
  requestCount: number;
  lastCalled: string | null; // ISO 8601
  avgResponseTimeMs: number;
  errorCount: number;
}

export interface RequestLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  method: HttpMethod;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseHeaders?: Record<string, string>;
  responseBody?: string | null;
}

export interface EndpointConfig {
  /** Unique ID, generated from method + path */
  id: string;
  path: string;
  method: HttpMethod;
  enabled: boolean;
  /** HTTP status code to return */
  currentStatus: number;
  /** Original status from OpenAPI spec */
  defaultStatus: number;
  /** Artificial delay in milliseconds */
  delayMs: number;
  authMode: AuthMode;
  failureMode: FailureMode;
  /** Failure probability 0–1 (used when failureMode is "random") */
  failureRate: number;
  /** Name of the faker handler function in faker.ts */
  fakerHandler: string | null;
  /** If set, return this exact payload instead of faker output */
  overrideResponse: unknown | null;
  /** Summary from OpenAPI operationId or description */
  summary: string;
  stats: EndpointStats;
  recentRequests: RequestLogEntry[];
}

// ---------------------------------------------------------------------------
// Project Configuration
// ---------------------------------------------------------------------------

export interface ProjectConfig {
  project: {
    name: string;
    port: number;
    host: string;
    description: string;
    createdAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
  };
  endpoints: EndpointConfig[];
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

// ---------------------------------------------------------------------------
// OpenAPI Parsing
// ---------------------------------------------------------------------------

export interface ParsedEndpoint {
  path: string;
  method: HttpMethod;
  operationId: string | null;
  summary: string | null;
  description: string | null;
  defaultStatus: number;
  responseSchema: OpenApiSchema | null;
  parameters: OpenApiParameter[];
}

export interface OpenApiSchema {
  type?: string;
  format?: string;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  required?: string[];
  example?: unknown;
  enum?: unknown[];
  $ref?: string;
  allOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
}

export interface OpenApiParameter {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  required: boolean;
  schema?: OpenApiSchema;
}

export interface ParsedOpenApi {
  title: string;
  version: string;
  endpoints: ParsedEndpoint[];
  schemas: Record<string, OpenApiSchema>;
}

// ---------------------------------------------------------------------------
// Runtime Adapter
// ---------------------------------------------------------------------------

export interface RuntimeStatus {
  isRunning: boolean;
  port: number | null;
  host: string | null;
  startedAt: string | null;
  pid: number | null;
}

// ---------------------------------------------------------------------------
// Dashboard API responses
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
