/**
 * Tests for @mocklab/core
 */

import { assertEquals, assertExists, assertThrows } from "jsr:@std/assert";
import { OpenApiParser } from "../openapi-parser.ts";
import { SchemaInferrer } from "../schema-infer.ts";
import { FakerGenerator } from "../faker-generator.ts";

const petstore = await Deno.readTextFile(
  new URL("./fixtures/petstore.yaml", import.meta.url),
);

// ---------------------------------------------------------------------------
// OpenApiParser tests
// ---------------------------------------------------------------------------

Deno.test("OpenApiParser — parses Petstore YAML", () => {
  const parser = new OpenApiParser();
  const result = parser.parse(petstore, "petstore.yaml");

  assertEquals(result.title, "Petstore");
  assertEquals(result.version, "1.0.0");
  assertEquals(result.endpoints.length, 3);
});

Deno.test("OpenApiParser — extracts correct methods", () => {
  const parser = new OpenApiParser();
  const { endpoints } = parser.parse(petstore, "petstore.yaml");

  const methods = endpoints.map((e) => e.method).sort();
  assertEquals(methods, ["GET", "GET", "POST"]);
});

Deno.test("OpenApiParser — resolves $ref schemas", () => {
  const parser = new OpenApiParser();
  const { endpoints } = parser.parse(petstore, "petstore.yaml");

  const listPets = endpoints.find((e) => e.operationId === "listPets");
  assertExists(listPets);
  assertExists(listPets.responseSchema);
  // Array of Pet
  assertEquals(listPets.responseSchema!.type, "array");
  assertExists(listPets.responseSchema!.items);
});

Deno.test("OpenApiParser — rejects OpenAPI 2.x", () => {
  const parser = new OpenApiParser();
  const swagger2 = `swagger: "2.0"\ninfo:\n  title: test\n  version: "1.0"\npaths: {}`;
  assertThrows(() => parser.parse(swagger2), Error, "MockLab requires OpenAPI 3.x");
});

Deno.test("OpenApiParser — infers default status 200", () => {
  const parser = new OpenApiParser();
  const { endpoints } = parser.parse(petstore);
  const listPets = endpoints.find((e) => e.operationId === "listPets");
  assertEquals(listPets?.defaultStatus, 200);
});

Deno.test("OpenApiParser — infers default status 201 for POST", () => {
  const parser = new OpenApiParser();
  const { endpoints } = parser.parse(petstore);
  const createPet = endpoints.find((e) => e.operationId === "createPet");
  assertEquals(createPet?.defaultStatus, 201);
});

// ---------------------------------------------------------------------------
// SchemaInferrer tests
// ---------------------------------------------------------------------------

Deno.test("SchemaInferrer — infers string", () => {
  const infer = new SchemaInferrer();
  assertEquals(infer.infer({ type: "string" }), "string");
});

Deno.test("SchemaInferrer — infers email format", () => {
  const infer = new SchemaInferrer();
  assertEquals(infer.infer({ type: "string", format: "email" }), "user@example.com");
});

Deno.test("SchemaInferrer — infers uuid format", () => {
  const infer = new SchemaInferrer();
  assertEquals(
    infer.infer({ type: "string", format: "uuid" }),
    "00000000-0000-0000-0000-000000000001",
  );
});

Deno.test("SchemaInferrer — uses example value", () => {
  const infer = new SchemaInferrer();
  assertEquals(infer.infer({ type: "string", example: "hello" }), "hello");
});

Deno.test("SchemaInferrer — infers object", () => {
  const infer = new SchemaInferrer();
  const result = infer.infer({
    type: "object",
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
    },
  });
  assertEquals(typeof result, "object");
  assertEquals(result.id, 1);
  assertEquals(result.name, "string");
});

Deno.test("SchemaInferrer — infers array", () => {
  const infer = new SchemaInferrer();
  const result = infer.infer({ type: "array", items: { type: "number" } });
  assertEquals(Array.isArray(result), true);
  assertEquals(result.length, 1);
});

Deno.test("SchemaInferrer — picks first enum value", () => {
  const infer = new SchemaInferrer();
  assertEquals(
    infer.infer({ type: "string", enum: ["available", "pending", "sold"] }),
    "available",
  );
});

Deno.test("SchemaInferrer — handles null schema gracefully", () => {
  const infer = new SchemaInferrer();
  assertEquals(infer.infer(null), null);
  assertEquals(infer.infer(undefined), null);
});

// ---------------------------------------------------------------------------
// FakerGenerator tests
// ---------------------------------------------------------------------------

Deno.test("FakerGenerator — generates valid TypeScript", () => {
  const parser = new OpenApiParser();
  const gen = new FakerGenerator();
  const { endpoints } = parser.parse(petstore);

  const code = gen.generate(endpoints, "petstore");
  // Must contain import and handler registry
  assertEquals(code.includes("import { faker }"), true);
  assertEquals(code.includes("export const handlers"), true);
  assertEquals(code.includes("listPets"), true);
});

Deno.test("FakerGenerator — generates unique handlers per operationId", () => {
  const parser = new OpenApiParser();
  const gen = new FakerGenerator();
  const { endpoints } = parser.parse(petstore);

  const code = gen.generate(endpoints, "petstore");
  // Should have handler for listPets once
  const matches = (code.match(/function listPets/g) ?? []).length;
  assertEquals(matches, 1);
});

Deno.test("FakerGenerator — handlerName from path when no operationId", () => {
  const gen = new FakerGenerator();
  const name = gen.handlerName({
    path: "/users/{id}/posts",
    method: "GET",
    operationId: null,
    summary: null,
    description: null,
    defaultStatus: 200,
    responseSchema: null,
    parameters: [],
  });
  assertEquals(name, "get_users_ById_posts");
});
