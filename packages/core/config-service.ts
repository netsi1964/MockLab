/**
 * MockLab Config Service
 *
 * Centralized read/write to endpoints.json with file-level locking
 * to prevent race conditions between UI, CLI, and MCP.
 */

import type { ProjectConfig } from "./types.ts";

const LOCK_TIMEOUT_MS = 5000;

export class ConfigService {
  private locks = new Map<string, Promise<void>>();

  /**
   * Build the path to a project's endpoints.json
   */
  static configPath(projectsDir: string, projectName: string): string {
    return `${projectsDir}/${projectName}/endpoints.json`;
  }

  /**
   * Build the path to a project's faker.ts
   */
  static fakerPath(projectsDir: string, projectName: string): string {
    return `${projectsDir}/${projectName}/faker.ts`;
  }

  /**
   * Read a project's configuration from disk.
   * Returns null if the project does not exist.
   */
  async read(
    projectsDir: string,
    projectName: string,
  ): Promise<ProjectConfig | null> {
    const path = ConfigService.configPath(projectsDir, projectName);
    try {
      const raw = await Deno.readTextFile(path);
      return JSON.parse(raw) as ProjectConfig;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return null;
      throw err;
    }
  }

  /**
   * Write a project's configuration to disk atomically.
   * Uses an in-memory per-project mutex to serialize concurrent writes.
   */
  async write(
    projectsDir: string,
    projectName: string,
    config: ProjectConfig,
  ): Promise<void> {
    return this.withLock(projectName, async () => {
      const path = ConfigService.configPath(projectsDir, projectName);
      const tmpPath = `${path}.tmp`;
      const json = JSON.stringify(this.serializableConfig(config), null, 2);
      // Write to temp file then rename atomically
      await Deno.writeTextFile(tmpPath, json);
      await Deno.rename(tmpPath, path);
    });
  }

  /**
   * Update specific fields on an endpoint within a project config.
   */
  async updateEndpoint(
    projectsDir: string,
    projectName: string,
    endpointId: string,
    updates: Partial<ProjectConfig["endpoints"][number]>,
  ): Promise<ProjectConfig> {
    return this.withLock(projectName, async () => {
      const config = await this.read(projectsDir, projectName);
      if (!config) {
        throw new Error(`Project "${projectName}" not found`);
      }
      const idx = config.endpoints.findIndex((e) => e.id === endpointId);
      if (idx === -1) {
        throw new Error(
          `Endpoint "${endpointId}" not found in project "${projectName}"`,
        );
      }
      config.endpoints[idx] = {
        ...config.endpoints[idx],
        ...updates,
      };
      config.project.updatedAt = new Date().toISOString();
      const path = ConfigService.configPath(projectsDir, projectName);
      const tmpPath = `${path}.tmp`;
      await Deno.writeTextFile(
        tmpPath,
        JSON.stringify(this.serializableConfig(config), null, 2),
      );
      await Deno.rename(tmpPath, path);
      return config;
    }) as Promise<ProjectConfig>;
  }

  private serializableConfig(config: ProjectConfig): ProjectConfig {
    return {
      ...config,
      endpoints: config.endpoints.map((endpoint) => {
        const { recentRequests: _recentRequests, ...serializableEndpoint } =
          endpoint;
        return serializableEndpoint;
      }),
    };
  }

  /**
   * Simple in-memory per-resource mutex.
   */
  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.locks.get(key) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>((res) => (resolve = res));
    this.locks.set(key, next);

    return existing.then(async () => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Lock timeout for "${key}"`)),
          LOCK_TIMEOUT_MS,
        )
      );
      try {
        return await Promise.race([fn(), timeout]);
      } finally {
        resolve();
        if (this.locks.get(key) === next) {
          this.locks.delete(key);
        }
      }
    });
  }
}

/** Singleton instance */
export const configService = new ConfigService();
