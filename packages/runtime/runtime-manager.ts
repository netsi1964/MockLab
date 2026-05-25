/**
 * MockLab Runtime Manager
 *
 * Manages the lifecycle of multiple mock server instances (one per project).
 * Uses the built-in Hono mock server — no Prism or Node.js required.
 */

import type {
  EndpointConfig,
  ProjectConfig,
  RuntimeStatus,
} from "@mocklab/core";
import { printUrlList } from "@mocklab/core";
import { type MockServerInstance, startMockServer } from "./mock-server.ts";

interface RunningProject {
  instance: MockServerInstance;
  startedAt: string;
  projectName: string;
}

export class RuntimeManager {
  private running = new Map<string, RunningProject>();
  private projectsDir: string;

  constructor(projectsDir: string) {
    this.projectsDir = projectsDir;
  }

  /**
   * Start a project's mock server.
   */
  async start(config: ProjectConfig): Promise<void> {
    const { name } = config.project;
    const port = config.project.port;

    if (this.running.has(name)) {
      await this.stop(name);
    }

    // Check if the port is already in use by another MockLab project
    const conflict = [...this.running.values()].find(
      (p) => p.instance.port === port && p.projectName !== name,
    );
    if (conflict) {
      const err = new Error(
        `Port ${port} is already in use by project "${conflict.projectName}"`,
      );
      (err as any).code = "PORT_IN_USE";
      (err as any).projectUsingPort = conflict.projectName;
      throw err;
    }

    console.log(`[runtime] Starting mock server for "${name}" on :${port}…`);
    try {
      const instance = await startMockServer(config, this.projectsDir);

      this.running.set(name, {
        instance,
        startedAt: new Date().toISOString(),
        projectName: name,
      });

      console.log(
        `[runtime] "${name}" running on :${instance.port} (bind: ${instance.bindHost})`,
      );
      printUrlList("[runtime] Base URLs", instance.baseUrls);
      if (config.endpoints.length > 0) {
        console.log(`   [runtime] Endpoints exposed by "${name}":`);
        for (const ep of config.endpoints) {
          for (const baseUrl of instance.baseUrls) {
            console.log(`      ${ep.method} ${baseUrl}${ep.path}`);
          }
        }
      }
    } catch (err) {
      if (err instanceof Deno.errors.AddrInUse) {
        const extErr = new Error(
          `Port ${port} is already in use by an external process`,
        );
        (extErr as any).code = "PORT_IN_USE_EXTERNAL";
        throw extErr;
      }
      throw err;
    }
  }

  /**
   * Stop a project's mock server.
   */
  async stop(projectName: string): Promise<void> {
    const entry = this.running.get(projectName);
    if (!entry) return;
    await entry.instance.stop();
    this.running.delete(projectName);
    console.log(`[runtime] "${projectName}" stopped`);
  }

  /**
   * Stop all running instances.
   */
  async stopAll(): Promise<void> {
    await Promise.all([...this.running.keys()].map((n) => this.stop(n)));
  }

  /**
   * Check if a project is running.
   */
  isRunning(projectName: string): boolean {
    return this.running.has(projectName);
  }

  /**
   * Get runtime status for a project.
   */
  getStatus(projectName: string): RuntimeStatus {
    const entry = this.running.get(projectName);
    if (!entry) {
      return {
        isRunning: false,
        port: null,
        host: null,
        baseUrls: [],
        startedAt: null,
        pid: null,
      };
    }
    return {
      isRunning: true,
      port: entry.instance.port,
      host: entry.instance.bindHost,
      baseUrls: entry.instance.baseUrls,
      startedAt: entry.startedAt,
      pid: null,
    };
  }

  /**
   * Get all running project names.
   */
  runningProjects(): string[] {
    return [...this.running.keys()];
  }

  /**
   * No-op for built-in server — config is re-read on every request.
   */
  async updateEndpoint(
    _projectName: string,
    _endpoint: EndpointConfig,
  ): Promise<void> {
    await Promise.resolve();
  }
}
