/**
 * MockLab Stats Tracker
 *
 * Manages request statistics and recent request logs for endpoints.
 * Updates are persisted back to endpoints.json via the config service.
 */

import type {
  EndpointStats,
  ProjectConfig,
  RequestLogEntry,
} from "./types.ts";
import { configService } from "./config-service.ts";

const MAX_RECENT_REQUESTS = 50;

export class StatsTracker {
  /**
   * Record a completed request for an endpoint.
   * Updates requestCount, avgResponseTimeMs, lastCalled, and recentRequests.
   */
  async record(
    projectsDir: string,
    projectName: string,
    endpointId: string,
    entry: Omit<RequestLogEntry, "id">,
  ): Promise<void> {
    const config = await configService.read(projectsDir, projectName);
    if (!config) return;

    const idx = config.endpoints.findIndex((e) => e.id === endpointId);
    if (idx === -1) return;

    const ep = config.endpoints[idx];
    const stats: EndpointStats = ep.stats;
    const newCount = stats.requestCount + 1;
    const newAvg = Math.round(
      (stats.avgResponseTimeMs * stats.requestCount + entry.responseTimeMs) /
        newCount,
    );

    const logEntry: RequestLogEntry = {
      id: crypto.randomUUID(),
      ...entry,
    };

    config.endpoints[idx] = {
      ...ep,
      stats: {
        requestCount: newCount,
        lastCalled: entry.timestamp,
        avgResponseTimeMs: newAvg,
        errorCount:
          stats.errorCount +
          (entry.statusCode >= 500 || entry.statusCode === 0 ? 1 : 0),
      },
      recentRequests: [
        logEntry,
        ...(ep.recentRequests ?? []),
      ].slice(0, MAX_RECENT_REQUESTS),
    };

    config.project.updatedAt = new Date().toISOString();
    await configService.write(projectsDir, projectName, config);
  }

  /**
   * Get aggregated stats across all endpoints in a project.
   */
  projectStats(config: ProjectConfig): {
    totalRequests: number;
    totalErrors: number;
    activeEndpoints: number;
  } {
    return config.endpoints.reduce(
      (acc, ep) => ({
        totalRequests: acc.totalRequests + ep.stats.requestCount,
        totalErrors: acc.totalErrors + ep.stats.errorCount,
        activeEndpoints: acc.activeEndpoints + (ep.enabled ? 1 : 0),
      }),
      { totalRequests: 0, totalErrors: 0, activeEndpoints: 0 },
    );
  }
}

export const statsTracker = new StatsTracker();
