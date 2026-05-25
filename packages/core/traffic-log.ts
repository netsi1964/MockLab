/**
 * MockLab Traffic Log
 *
 * Stores observed request/response traffic in HAR 1.2 format.
 * endpoints.json remains endpoint configuration and aggregate stats only.
 */

import type { HarEntry, HarFile, RequestLogEntry } from "./types.ts";

const MAX_RECENT_REQUESTS_PER_ENDPOINT = 50;
const TRAFFIC_FILENAME = "traffic.har";

function trafficPath(projectsDir: string, projectName: string): string {
  return `${projectsDir}/${projectName}/${TRAFFIC_FILENAME}`;
}

function emptyHar(): HarFile {
  return {
    log: {
      version: "1.2",
      creator: {
        name: "MockLab",
        version: "0.1.0",
      },
      entries: [],
    },
  };
}

function headersToHar(headers: Record<string, string> | undefined) {
  return Object.entries(headers ?? {}).map(([name, value]) => ({
    name,
    value,
  }));
}

function headersFromHar(headers: { name: string; value: string }[]) {
  return Object.fromEntries(
    headers.map((header) => [header.name, header.value]),
  );
}

function queryStringFromUrl(url: string) {
  return [...new URL(url, "http://mocklab.local").searchParams.entries()].map(
    ([name, value]) => ({ name, value }),
  );
}

function statusText(status: number): string {
  try {
    const response = new Response(null, { status });
    return response.statusText;
  } catch {
    return "";
  }
}

function entryToHar(
  endpointId: string,
  requestId: string,
  entry: Omit<RequestLogEntry, "id">,
): HarEntry {
  const url = `http://mocklab.local${entry.path}`;
  const requestBodySize = entry.requestBody ? entry.requestBody.length : 0;
  const responseBody = entry.responseBody ?? "";

  return {
    startedDateTime: entry.timestamp,
    time: entry.responseTimeMs,
    request: {
      method: entry.method,
      url,
      httpVersion: "HTTP/1.1",
      headers: headersToHar(entry.requestHeaders),
      queryString: queryStringFromUrl(url),
      ...(entry.requestBody
        ? {
          postData: {
            mimeType: entry.requestHeaders["content-type"] ?? "text/plain",
            text: entry.requestBody,
          },
        }
        : {}),
      headersSize: -1,
      bodySize: requestBodySize,
    },
    response: {
      status: entry.statusCode,
      statusText: statusText(entry.statusCode),
      httpVersion: "HTTP/1.1",
      headers: headersToHar(entry.responseHeaders),
      content: {
        size: responseBody.length,
        mimeType: entry.responseHeaders?.["content-type"] ?? "application/json",
        ...(entry.responseBody === undefined || entry.responseBody === null
          ? {}
          : { text: entry.responseBody }),
      },
      redirectURL: "",
      headersSize: -1,
      bodySize: responseBody.length,
    },
    cache: {},
    timings: {
      send: 0,
      wait: entry.responseTimeMs,
      receive: 0,
    },
    _mocklab: {
      id: requestId,
      endpointId,
      path: entry.path,
    },
  };
}

function harToRequestLog(entry: HarEntry): RequestLogEntry {
  const url = new URL(entry.request.url, "http://mocklab.local");
  return {
    id: entry._mocklab?.id ?? crypto.randomUUID(),
    timestamp: entry.startedDateTime,
    method: entry.request.method,
    path: entry._mocklab?.path ?? `${url.pathname}${url.search}`,
    statusCode: entry.response.status,
    responseTimeMs: Math.round(entry.time),
    requestHeaders: headersFromHar(entry.request.headers),
    requestBody: entry.request.postData?.text ?? null,
    responseHeaders: headersFromHar(entry.response.headers),
    responseBody: entry.response.content.text ?? null,
  };
}

export class TrafficLogService {
  async read(projectsDir: string, projectName: string): Promise<HarFile> {
    try {
      const raw = await Deno.readTextFile(
        trafficPath(projectsDir, projectName),
      );
      return JSON.parse(raw) as HarFile;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return emptyHar();
      throw err;
    }
  }

  async write(
    projectsDir: string,
    projectName: string,
    har: HarFile,
  ): Promise<void> {
    await Deno.writeTextFile(
      trafficPath(projectsDir, projectName),
      JSON.stringify(har, null, 2),
    );
  }

  async record(
    projectsDir: string,
    projectName: string,
    endpointId: string,
    entry: Omit<RequestLogEntry, "id">,
  ): Promise<RequestLogEntry> {
    const requestId = crypto.randomUUID();
    const har = await this.read(projectsDir, projectName);
    har.log.entries = [
      entryToHar(endpointId, requestId, entry),
      ...har.log.entries,
    ];
    await this.write(projectsDir, projectName, har);
    return { id: requestId, ...entry };
  }

  async recentForEndpoint(
    projectsDir: string,
    projectName: string,
    endpointId: string,
  ): Promise<RequestLogEntry[]> {
    const har = await this.read(projectsDir, projectName);
    return har.log.entries
      .filter((entry) => entry._mocklab?.endpointId === endpointId)
      .slice(0, MAX_RECENT_REQUESTS_PER_ENDPOINT)
      .map(harToRequestLog);
  }

  async resetProject(projectsDir: string, projectName: string): Promise<void> {
    await this.write(projectsDir, projectName, emptyHar());
  }

  async resetEndpoint(
    projectsDir: string,
    projectName: string,
    endpointId: string,
  ): Promise<void> {
    const har = await this.read(projectsDir, projectName);
    har.log.entries = har.log.entries.filter((entry) =>
      entry._mocklab?.endpointId !== endpointId
    );
    await this.write(projectsDir, projectName, har);
  }
}

export const trafficLogService = new TrafficLogService();
