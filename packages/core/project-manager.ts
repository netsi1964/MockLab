/**
 * MockLab Project Manager
 *
 * Handles creation, listing, deletion and management of mock projects
 * and their directory structure on disk.
 */

import type { ProjectConfig, ProjectMeta } from "./types.ts";
import { configService } from "./config-service.ts";

export const DEFAULT_START_PORT = 4010;

export class ProjectManager {
  constructor(private readonly projectsDir: string) {}

  /**
   * Ensure the projects directory exists.
   */
  async init(): Promise<void> {
    await Deno.mkdir(this.projectsDir, { recursive: true });
  }

  /**
   * List all projects in the projects directory.
   */
  async list(): Promise<ProjectMeta[]> {
    const projects: ProjectMeta[] = [];
    try {
      for await (const entry of Deno.readDir(this.projectsDir)) {
        if (!entry.isDirectory) continue;
        const config = await configService.read(
          this.projectsDir,
          entry.name,
        );
        if (config) {
          projects.push({
            name: config.project.name,
            port: config.project.port,
            host: config.project.host,
            description: config.project.description,
            isRunning: false, // runtime manager will overlay this
            createdAt: config.project.createdAt,
            updatedAt: config.project.updatedAt,
          });
        }
      }
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return [];
      throw err;
    }
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get a single project's config.
   */
  async get(name: string): Promise<ProjectConfig | null> {
    return configService.read(this.projectsDir, name);
  }

  /**
   * Create a new project directory and write initial endpoints.json.
   */
  async create(
    name: string,
    options: { port?: number; host?: string; description?: string } = {},
  ): Promise<ProjectConfig> {
    const projectPath = `${this.projectsDir}/${name}`;

    // Check if already exists
    try {
      await Deno.stat(projectPath);
      throw new Error(`Project "${name}" already exists`);
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) throw err;
    }

    await Deno.mkdir(projectPath, { recursive: true });
    await Deno.mkdir(`${projectPath}/overrides`, { recursive: true });

    const port = options.port ?? (await this.nextAvailablePort());
    const now = new Date().toISOString();

    const config: ProjectConfig = {
      project: {
        name,
        port,
        host: options.host ?? "localhost",
        description: options.description ?? "",
        createdAt: now,
        updatedAt: now,
      },
      endpoints: [],
    };

    await configService.write(this.projectsDir, name, config);
    return config;
  }

  /**
   * Delete a project and all its files.
   */
  async delete(name: string): Promise<void> {
    const projectPath = `${this.projectsDir}/${name}`;
    try {
      await Deno.remove(projectPath, { recursive: true });
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        throw new Error(`Project "${name}" not found`);
      }
      throw err;
    }
  }

  /**
   * Reset all endpoint stats for a project.
   */
  async resetStats(name: string): Promise<ProjectConfig> {
    const config = await configService.read(this.projectsDir, name);
    if (!config) throw new Error(`Project "${name}" not found`);

    config.endpoints = config.endpoints.map((ep) => ({
      ...ep,
      stats: {
        requestCount: 0,
        lastCalled: null,
        avgResponseTimeMs: 0,
        errorCount: 0,
      },
      recentRequests: [],
    }));
    config.project.updatedAt = new Date().toISOString();
    await configService.write(this.projectsDir, name, config);
    return config;
  }

  /**
   * Export a project config as a JSON string.
   */
  async export(name: string): Promise<string> {
    const config = await configService.read(this.projectsDir, name);
    if (!config) throw new Error(`Project "${name}" not found`);
    return JSON.stringify(config, null, 2);
  }

  /**
   * Find the next available port by scanning existing projects.
   */
  private async nextAvailablePort(): Promise<number> {
    const projects = await this.list();
    if (projects.length === 0) return DEFAULT_START_PORT;
    const usedPorts = new Set(projects.map((p) => p.port));
    let port = DEFAULT_START_PORT;
    while (usedPorts.has(port)) port++;
    return port;
  }

  /**
   * Get the projects directory path.
   */
  getProjectsDir(): string {
    return this.projectsDir;
  }

  /**
   * Get path to state.json for a project.
   */
  statePath(name: string): string {
    return `${this.projectsDir}/${name}/state.json`;
  }

  /**
   * Read the state.json for a project.
   * Returns empty object if file does not exist.
   */
  async readState(name: string): Promise<any> {
    const path = this.statePath(name);
    try {
      const content = await Deno.readTextFile(path);
      return JSON.parse(content);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return {};
      }
      throw err;
    }
  }

  /**
   * Write to state.json for a project.
   */
  async writeState(name: string, state: any): Promise<void> {
    const path = this.statePath(name);
    await Deno.writeTextFile(path, JSON.stringify(state, null, 2));
  }

  /**
   * Reset state.json for a project (deletes it).
   */
  async resetState(name: string): Promise<void> {
    const path = this.statePath(name);
    try {
      await Deno.remove(path);
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) {
        throw err;
      }
    }
  }
}
