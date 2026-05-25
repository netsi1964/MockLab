/**
 * MockLab OpenAPI Parser
 *
 * Parses OpenAPI 3.x YAML/JSON specifications and extracts
 * endpoints, schemas and response definitions.
 */

import { parse as parseYaml } from "yaml";
import type {
  HttpMethod,
  OpenApiParameter,
  OpenApiSchema,
  ParsedEndpoint,
  ParsedOpenApi,
} from "./types.ts";

const SUPPORTED_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

// deno-lint-ignore no-explicit-any
type AnyObject = Record<string, any>;

export class OpenApiParser {
  /**
   * Parse an OpenAPI YAML or JSON string.
   */
  parse(content: string, filename?: string): ParsedOpenApi {
    const isJson = filename?.endsWith(".json") ||
      content.trimStart().startsWith("{");
    // deno-lint-ignore no-explicit-any
    const doc: AnyObject = isJson ? JSON.parse(content) : parseYaml(content) as any;

    this.assertOpenApi3(doc);

    const info = doc.info ?? {};
    const schemas: Record<string, OpenApiSchema> = {};

    // Collect component schemas for $ref resolution
    const components = doc.components ?? {};
    const componentSchemas = components.schemas ?? {};
    for (const [name, schema] of Object.entries(componentSchemas)) {
      schemas[name] = schema as OpenApiSchema;
    }

    const endpoints: ParsedEndpoint[] = [];
    const paths: AnyObject = doc.paths ?? {};

    for (const [path, pathItem] of Object.entries(paths)) {
      for (const method of SUPPORTED_METHODS) {
        const operation = (pathItem as AnyObject)[method.toLowerCase()];
        if (!operation) continue;

        const endpoint = this.parseOperation(
          path,
          method,
          operation,
          schemas,
        );
        endpoints.push(endpoint);
      }
    }

    return {
      title: info.title ?? "Untitled API",
      version: info.version ?? "1.0.0",
      endpoints,
      schemas,
    };
  }

  /**
   * Parse a single OpenAPI operation into a ParsedEndpoint.
   */
  private parseOperation(
    path: string,
    method: HttpMethod,
    operation: AnyObject,
    schemas: Record<string, OpenApiSchema>,
  ): ParsedEndpoint {
    const defaultStatus = this.inferDefaultStatus(operation);
    const responseSchema = this.extractResponseSchema(
      operation,
      defaultStatus,
      schemas,
    );

    const parameters: OpenApiParameter[] = (operation.parameters ?? []).map(
      // deno-lint-ignore no-explicit-any
      (p: any) => ({
        name: p.name,
        in: p.in,
        required: p.required ?? false,
        schema: p.schema,
      }),
    );

    return {
      path,
      method,
      operationId: operation.operationId ?? null,
      summary: operation.summary ?? null,
      description: operation.description ?? null,
      defaultStatus,
      responseSchema,
      parameters,
    };
  }

  /**
   * Determine the "happy path" HTTP status for an operation.
   * Prefers 200, then first 2xx, then first defined status.
   */
  private inferDefaultStatus(operation: AnyObject): number {
    const responses: AnyObject = operation.responses ?? {};
    const statusCodes = Object.keys(responses).map(Number).filter((n) =>
      !isNaN(n)
    );
    if (statusCodes.includes(200)) return 200;
    const twoxx = statusCodes.find((s) => s >= 200 && s < 300);
    if (twoxx) return twoxx;
    return statusCodes[0] ?? 200;
  }

  /**
   * Extract the response JSON schema for a given status code.
   * Resolves $ref references to component schemas.
   */
  private extractResponseSchema(
    operation: AnyObject,
    status: number,
    schemas: Record<string, OpenApiSchema>,
  ): OpenApiSchema | null {
    const responses: AnyObject = operation.responses ?? {};
    const response: AnyObject = responses[status] ?? responses["default"];
    if (!response) return null;

    const content: AnyObject = response.content ?? {};
    const jsonContent = content["application/json"] ??
      Object.values(content)[0];
    if (!jsonContent) return null;

    const schema = jsonContent.schema;
    if (!schema) return null;

    return this.resolveRef(schema, schemas);
  }

  /**
   * Resolve a $ref to its schema definition.
   */
  private resolveRef(
    schema: AnyObject,
    schemas: Record<string, OpenApiSchema>,
  ): OpenApiSchema {
    if (schema.$ref) {
      // Format: #/components/schemas/ModelName
      const refName = schema.$ref.split("/").pop();
      if (refName && schemas[refName]) {
        return this.resolveRef(schemas[refName] as AnyObject, schemas);
      }
    }
    // Recursively resolve properties
    if (schema.properties) {
      const resolvedProps: Record<string, OpenApiSchema> = {};
      for (const [key, val] of Object.entries(schema.properties)) {
        resolvedProps[key] = this.resolveRef(val as AnyObject, schemas);
      }
      return { ...schema, properties: resolvedProps };
    }
    if (schema.items) {
      return { ...schema, items: this.resolveRef(schema.items as AnyObject, schemas) };
    }
    return schema as OpenApiSchema;
  }

  private assertOpenApi3(doc: AnyObject): void {
    const version: string = doc.openapi ?? doc.swagger ?? "";
    if (!version.startsWith("3.")) {
      throw new Error(
        `Unsupported OpenAPI version: "${version}". MockLab requires OpenAPI 3.x.`,
      );
    }
  }
}

export const openApiParser = new OpenApiParser();
