/**
 * MockLab Core — Import Service
 *
 * Orchestrates the OpenAPI import pipeline:
 *   parse → infer → generate endpoints.json + faker.ts → write to disk
 */

import type {
  EndpointConfig,
  HttpMethod,
  ParsedEndpoint,
  ProjectConfig,
} from "./types.ts";
import { openApiParser } from "./openapi-parser.ts";
import { schemaInferrer } from "./schema-infer.ts";
import { fakerGenerator } from "./faker-generator.ts";
import { configService } from "./config-service.ts";

export class ImportService {
  /**
   * Import an OpenAPI spec into an existing project.
   * Generates endpoints.json entries and a faker.ts file.
   */
  async import(
    projectsDir: string,
    projectName: string,
    specContent: string,
    filename?: string,
  ): Promise<ProjectConfig> {
    const parsed = openApiParser.parse(specContent, filename);

    // Load existing config
    const existing = await configService.read(projectsDir, projectName);
    if (!existing) {
      throw new Error(`Project "${projectName}" not found`);
    }

    // Generate endpoint configs, preserving any existing overrides
    const existingById = new Map(existing.endpoints.map((e) => [e.id, e]));

    const endpoints: EndpointConfig[] = parsed.endpoints.map((ep) => {
      const id = endpointId(ep.method, ep.path);
      const existingEp = existingById.get(id);
      const staticExample = schemaInferrer.infer(ep.responseSchema);

      return {
        id,
        path: ep.path,
        method: ep.method,
        enabled: existingEp?.enabled ?? true,
        currentStatus: existingEp?.currentStatus ?? ep.defaultStatus,
        defaultStatus: ep.defaultStatus,
        delayMs: existingEp?.delayMs ?? 0,
        authMode: existingEp?.authMode ?? "none",
        failureMode: existingEp?.failureMode ?? "none",
        failureRate: existingEp?.failureRate ?? 0.5,
        fakerHandler: fakerGenerator.handlerName(ep),
        overrideResponse: existingEp?.overrideResponse ?? null,
        summary: ep.summary ?? ep.operationId ?? `${ep.method} ${ep.path}`,
        stats: existingEp?.stats ?? {
          requestCount: 0,
          lastCalled: null,
          avgResponseTimeMs: 0,
          errorCount: 0,
        },
        recentRequests: existingEp?.recentRequests ?? [],
      };
    });

    // Write updated endpoints.json
    const updated: ProjectConfig = {
      ...existing,
      endpoints,
      project: {
        ...existing.project,
        updatedAt: new Date().toISOString(),
      },
    };
    await configService.write(projectsDir, projectName, updated);

    // Generate and write faker.ts
    const fakerContent = fakerGenerator.generate(
      parsed.endpoints,
      projectName,
    );
    const fakerPath = `${projectsDir}/${projectName}/faker.ts`;
    await Deno.writeTextFile(fakerPath, fakerContent);

    // Save a copy of the original spec
    const specExt = filename?.endsWith(".json") ? "json" : "yaml";
    await Deno.writeTextFile(
      `${projectsDir}/${projectName}/openapi.${specExt}`,
      specContent,
    );

    return updated;
  }
}

/**
 * Generate a stable endpoint ID from method + path.
 */
export function endpointId(method: HttpMethod, path: string): string {
  return `${method.toUpperCase()}:${path}`;
}

export const importService = new ImportService();
