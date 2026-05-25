/**
 * MockLab Faker Generator
 *
 * Generates faker.ts files and converts OpenAPI schemas into
 * realistic TypeScript faker handler functions.
 * The generated file is placed in the project directory and can
 * be customized by the developer.
 */

import type { OpenApiSchema, ParsedEndpoint } from "./types.ts";

export class FakerGenerator {
  /**
   * Generate the full faker.ts file content for a project.
   */
  generate(endpoints: ParsedEndpoint[], projectName: string): string {
    const functions: string[] = [];
    const handlerNames = new Set<string>();

    for (const ep of endpoints) {
      if (!ep.responseSchema) continue;
      const name = this.handlerName(ep);
      if (handlerNames.has(name)) continue;
      handlerNames.add(name);
      functions.push(this.generateFunction(name, ep.responseSchema));
    }

    return `/**
 * MockLab Faker Handlers — ${projectName}
 *
 * Auto-generated from OpenAPI spec. You can freely edit these functions
 * to customize the mock data returned by each endpoint.
 *
 * Each function should return a value matching the endpoint's response schema.
 * Import additional faker modules as needed:
 *   import { faker } from "npm:@faker-js/faker";
 */

import { faker } from "npm:@faker-js/faker";

${functions.join("\n\n")}

/**
 * Registry mapping handler names to functions.
 * MockLab uses this to dispatch faker calls at runtime.
 */
export const handlers: Record<string, () => unknown> = {
${[...handlerNames].map((n) => `  ${n},`).join("\n")}
};
`;
  }

  /**
   * Derive a camelCase handler name from an endpoint.
   */
  handlerName(ep: ParsedEndpoint): string {
    if (ep.operationId) {
      return ep.operationId.replace(/[^a-zA-Z0-9]/g, "_");
    }
    const method = ep.method.toLowerCase();
    const path = ep.path
      .replace(/^\//, "")
      .replace(/\{[^}]+\}/g, "ById")
      .replace(/[/\-_.]/g, "_")
      .replace(/_+/g, "_")
      .replace(/_$/, "");
    return `${method}_${path}`;
  }

  /**
   * Generate a single faker handler function from a schema.
   */
  private generateFunction(name: string, schema: OpenApiSchema): string {
    const body = this.schemaToFaker(schema, 1);
    return `export function ${name}(): unknown {\n  return ${body};\n}`;
  }

  /**
   * Recursively convert an OpenAPI schema to faker.js code.
   */
  private schemaToFaker(
    schema: OpenApiSchema | null | undefined,
    depth: number,
  ): string {
    if (!schema || depth > 4) return "null";

    if (schema.enum && schema.enum.length > 0) {
      const items = schema.enum.map((v) => JSON.stringify(v)).join(", ");
      return `faker.helpers.arrayElement([${items}])`;
    }

    if (schema.allOf) {
      const parts = schema.allOf
        .map((s) => `...${this.schemaToFaker(s, depth + 1)}`)
        .join(", ");
      return `({ ${parts} })`;
    }
    if (schema.oneOf) return this.schemaToFaker(schema.oneOf[0], depth + 1);
    if (schema.anyOf) return this.schemaToFaker(schema.anyOf[0], depth + 1);

    switch (schema.type) {
      case "object":
        return this.objectToFaker(schema, depth);
      case "array":
        return this.arrayToFaker(schema, depth);
      case "string":
        return this.stringToFaker(schema);
      case "number":
        return "faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })";
      case "integer":
        return "faker.number.int({ min: 1, max: 9999 })";
      case "boolean":
        return "faker.datatype.boolean()";
      case "null":
        return "null";
      default:
        if (schema.properties) return this.objectToFaker(schema, depth);
        return "faker.lorem.word()";
    }
  }

  private objectToFaker(schema: OpenApiSchema, depth: number): string {
    if (!schema.properties) return "{}";
    const indent = "  ".repeat(depth);
    const lines = Object.entries(schema.properties).map(([key, propSchema]) => {
      const val = this.schemaToFaker(propSchema, depth + 1);
      return `${indent}  ${key}: ${val},`;
    });
    return `({\n${lines.join("\n")}\n${indent}})`;
  }

  private arrayToFaker(schema: OpenApiSchema, depth: number): string {
    const itemFaker = this.schemaToFaker(schema.items, depth + 1);
    return `Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ${itemFaker})`;
  }

  private stringToFaker(schema: OpenApiSchema): string {
    switch (schema.format) {
      case "date-time":
        return "faker.date.recent().toISOString()";
      case "date":
        return "faker.date.recent().toISOString().split('T')[0]";
      case "email":
        return "faker.internet.email()";
      case "uri":
      case "url":
        return "faker.internet.url()";
      case "uuid":
        return "faker.string.uuid()";
      case "hostname":
        return "faker.internet.domainName()";
      case "ipv4":
        return "faker.internet.ipv4()";
      case "ipv6":
        return "faker.internet.ipv6()";
      case "password":
        return "faker.internet.password()";
      case "phone":
        return "faker.phone.number()";
      default:
        return "faker.lorem.word()";
    }
  }
}

export const fakerGenerator = new FakerGenerator();
