/**
 * MockLab Schema Inferrer
 *
 * Infers sensible mock values from OpenAPI schemas.
 * Used to generate static example payloads during import.
 * At runtime, faker-generator.ts generates dynamic values.
 */

import type { OpenApiSchema } from "./types.ts";

// deno-lint-ignore no-explicit-any
type JsonValue = any;

export class SchemaInferrer {
  /**
   * Generate a representative mock value from an OpenAPI schema.
   */
  infer(schema: OpenApiSchema | null | undefined, depth = 0): JsonValue {
    if (!schema || depth > 5) return null;

    // Use explicit example if provided
    if (schema.example !== undefined) return schema.example;

    // Enum — pick first value
    if (schema.enum && schema.enum.length > 0) return schema.enum[0];

    // allOf — merge all schemas
    if (schema.allOf) {
      return schema.allOf.reduce(
        (acc, s) => ({ ...acc, ...this.infer(s, depth + 1) }),
        {},
      );
    }

    // oneOf / anyOf — pick first
    if (schema.oneOf) return this.infer(schema.oneOf[0], depth + 1);
    if (schema.anyOf) return this.infer(schema.anyOf[0], depth + 1);

    switch (schema.type) {
      case "object":
        return this.inferObject(schema, depth);
      case "array":
        return this.inferArray(schema, depth);
      case "string":
        return this.inferString(schema);
      case "number":
      case "integer":
        return this.inferNumber(schema);
      case "boolean":
        return true;
      case "null":
        return null;
      default:
        // Untyped object with properties
        if (schema.properties) return this.inferObject(schema, depth);
        return null;
    }
  }

  private inferObject(
    schema: OpenApiSchema,
    depth: number,
  ): Record<string, JsonValue> {
    const result: Record<string, JsonValue> = {};
    if (!schema.properties) return result;
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      result[key] = this.infer(propSchema, depth + 1);
    }
    return result;
  }

  private inferArray(schema: OpenApiSchema, depth: number): JsonValue[] {
    if (!schema.items) return [];
    return [this.infer(schema.items, depth + 1)];
  }

  private inferString(schema: OpenApiSchema): string {
    switch (schema.format) {
      case "date-time":
        return new Date().toISOString();
      case "date":
        return new Date().toISOString().split("T")[0];
      case "time":
        return "12:00:00";
      case "email":
        return "user@example.com";
      case "uri":
      case "url":
        return "https://example.com";
      case "uuid":
        return "00000000-0000-0000-0000-000000000001";
      case "hostname":
        return "example.com";
      case "ipv4":
        return "127.0.0.1";
      case "ipv6":
        return "::1";
      case "password":
        return "••••••••";
      case "byte":
        return "dGVzdA==";
      case "binary":
        return "<binary>";
      default:
        return "string";
    }
  }

  private inferNumber(schema: OpenApiSchema): number {
    switch (schema.format) {
      case "float":
        return 3.14;
      case "double":
        return 3.141592653589793;
      case "int32":
        return 1;
      case "int64":
        return 1;
      default:
        return 1;
    }
  }
}

export const schemaInferrer = new SchemaInferrer();
