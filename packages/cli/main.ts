/**
 * MockLab CLI
 *
 * Commands:
 *   mocklab init                      Initialize projects directory
 *   mocklab list                      List all projects
 *   mocklab create <name>             Create a new project
 *   mocklab import <spec> [--project] Import an OpenAPI spec
 *   mocklab run <project>             Start a mock server
 *   mocklab stop <project>            Stop a mock server
 *   mocklab reset <project>           Reset stats for a project
 *   mocklab export <project>          Export project config
 *   mocklab delete <project>          Delete a project
 *
 * Communicates with the dashboard server API.
 */

const API_BASE = Deno.env.get("MOCKLAB_API") ?? "http://localhost:8080";

/**
 * Folder where users place their OpenAPI specs.
 * Resolved relative to the directory the CLI is run from.
 */
const OPENAPI_DIR = Deno.env.get("MOCKLAB_SPECS_DIR") ?? `${Deno.cwd()}/openapi`;

/**
 * Resolve a spec path:
 * - If the argument contains a path separator, use it as-is.
 * - Otherwise look for the filename inside the openapi/ folder.
 */
async function resolveSpecPath(input: string): Promise<{ path: string; resolved: boolean }> {
  const hasPathSep = input.includes("/") || input.includes("\\");
  if (hasPathSep) return { path: input, resolved: false };

  const inFolder = `${OPENAPI_DIR}/${input}`;
  try {
    await Deno.stat(inFolder);
    return { path: inFolder, resolved: true };
  } catch {
    // Not found in openapi/ folder — treat input as a bare path
    return { path: input, resolved: false };
  }
}


// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

function log(msg: string) { console.log(msg); }
function ok(msg: string) { console.log(`${c.green}✓${c.reset} ${msg}`); }
function fail(msg: string) { console.error(`${c.red}✗${c.reset} ${msg}`); }
function info(msg: string) { console.log(`${c.cyan}ℹ${c.reset} ${msg}`); }
function warn(msg: string) { console.log(`${c.yellow}⚠${c.reset} ${msg}`); }

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
class ApiError extends Error {
  code?: string;
  projectUsingPort?: string;
  constructor(message: string, code?: string, projectUsingPort?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.projectUsingPort = projectUsingPort;
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const json = await res.json();
  if (!json.success) throw new ApiError(json.error ?? "Request failed", json.code, json.projectUsingPort);
  return json.data as T;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new ApiError(json.error ?? "Request failed", json.code, json.projectUsingPort);
  return json.data as T;
}

async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  const json = await res.json();
  if (!json.success) throw new ApiError(json.error ?? "Request failed", json.code, json.projectUsingPort);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdInit() {
  info(`Initializing MockLab…`);
  // Just check the server is reachable
  try {
    const health = await apiGet<{ status: string; projectsDir: string }>("/api/health");
    ok(`MockLab server is running`);
    info(`Projects directory: ${c.bold}${health.projectsDir}${c.reset}`);
    info(`Dashboard: ${c.cyan}http://localhost:8080${c.reset}`);
  } catch {
    fail(`Cannot connect to MockLab server at ${API_BASE}`);
    info(`Start the server with: ${c.bold}deno task dev${c.reset} in packages/dashboard-server`);
    Deno.exit(1);
  }
}

async function cmdList() {
  // deno-lint-ignore no-explicit-any
  const projects = await apiGet<any[]>("/api/projects");
  if (projects.length === 0) {
    warn("No projects found. Create one with: mocklab create <name>");
    return;
  }

  const rows = projects.map(p => ({
    name: p.name,
    status: p.isRunning ? `${c.green}running${c.reset}` : `${c.gray}stopped${c.reset}`,
    port: `:${p.port}`,
    endpoints: `${p.endpoints?.length ?? "–"}`,
    updated: new Date(p.updatedAt).toLocaleDateString(),
  }));

  log(`\n${c.bold}Projects${c.reset}\n`);
  for (const r of rows) {
    log(
      `  ${c.bold}${r.name.padEnd(24)}${c.reset}` +
      `${r.status.padEnd(20)}` +
      `${c.gray}${r.port.padEnd(8)}${c.reset}` +
      `${c.gray}${r.updated}${c.reset}`
    );
  }
  log("");
}

async function cmdCreate(name: string, description?: string) {
  // deno-lint-ignore no-explicit-any
  const project = await apiPost<any>("/api/projects", { name, description });
  ok(`Project ${c.bold}${name}${c.reset} created on port :${project.project.port}`);
  info(`Import a spec: ${c.bold}mocklab import your-spec.yaml --project ${name}${c.reset}`);
  info(`  (place .yaml files in the ${c.cyan}openapi/${c.reset} folder first)`);
}

async function cmdImport(specInput: string, projectName?: string) {
  if (!projectName) {
    fail("Specify a project with --project <name>");
    Deno.exit(1);
  }

  const { path: specPath, resolved } = await resolveSpecPath(specInput);
  if (resolved) {
    info(`Found ${c.bold}${specInput}${c.reset} in ${c.cyan}openapi/${c.reset} folder`);
  }

  let content: string;
  try {
    content = await Deno.readTextFile(specPath);
  } catch {
    fail(`Cannot read file: ${specPath}`);
    if (!resolved && !specInput.includes("/")) {
      info(`Tip: place your spec in the ${c.cyan}openapi/${c.reset} folder and run:`);
      info(`  mocklab import ${specInput} --project ${projectName}`);
    }
    Deno.exit(1);
  }

  info(`Importing ${c.bold}${specPath}${c.reset} into project ${c.bold}${projectName}${c.reset}…`);

  const res = await fetch(`${API_BASE}/api/projects/${projectName}/import`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: content,
  });
  const json = await res.json();
  if (!json.success) {
    fail(`Import failed: ${json.error}`);
    Deno.exit(1);
  }

  const epCount = json.data.endpoints.length;
  ok(`Imported ${c.bold}${epCount} endpoints${c.reset} into ${c.bold}${projectName}${c.reset}`);
  info(`Start the server: ${c.bold}mocklab run ${projectName}${c.reset}`);
}

async function cmdRun(projectName: string) {
  info(`Starting ${c.bold}${projectName}${c.reset}…`);
  try {
    const result = await apiPost<any>(`/api/projects/${projectName}/start`);
    ok(`${c.bold}${projectName}${c.reset} is now running on port ${c.cyan}:${result.port}${c.reset}`);
    info(`Dashboard: ${c.cyan}http://localhost:8080/projects/${projectName}${c.reset}`);
  } catch (err) {
    if (err instanceof ApiError && err.code === "PORT_IN_USE") {
      warn(err.message);
      const response = prompt(`Do you want to stop project "${err.projectUsingPort}" and start "${projectName}" instead? (y/N):`);
      if (response && ["y", "yes"].includes(response.trim().toLowerCase())) {
        info(`Stopping project "${err.projectUsingPort}"…`);
        try {
          await apiPost(`/api/projects/${err.projectUsingPort}/stop`);
          ok(`Project "${err.projectUsingPort}" stopped`);
          
          info(`Starting ${c.bold}${projectName}${c.reset}…`);
          const result = await apiPost<any>(`/api/projects/${projectName}/start`);
          ok(`${c.bold}${projectName}${c.reset} is now running on port ${c.cyan}:${result.port}${c.reset}`);
          info(`Dashboard: ${c.cyan}http://localhost:8080/projects/${projectName}${c.reset}`);
          return;
        } catch (stopErr: any) {
          fail(`Could not switch projects: ${stopErr.message}`);
          Deno.exit(1);
        }
      } else {
        info("Start aborted.");
        Deno.exit(0);
      }
    } else {
      throw err;
    }
  }
}

async function cmdStop(projectName: string) {
  await apiPost(`/api/projects/${projectName}/stop`);
  ok(`${c.bold}${projectName}${c.reset} stopped`);
}

async function cmdReset(projectName: string) {
  await apiPost(`/api/projects/${projectName}/reset-stats`);
  ok(`Stats reset for ${c.bold}${projectName}${c.reset}`);
}

async function cmdExport(projectName: string) {
  const res = await fetch(`${API_BASE}/api/projects/${projectName}/export`);
  if (!res.ok) {
    fail(`Export failed: ${res.statusText}`);
    Deno.exit(1);
  }
  const json = await res.text();
  const filename = `${projectName}-config.json`;
  await Deno.writeTextFile(filename, json);
  ok(`Exported to ${c.bold}${filename}${c.reset}`);
}

async function cmdDelete(projectName: string) {
  await apiDelete(`/api/projects/${projectName}`);
  ok(`Project ${c.bold}${projectName}${c.reset} deleted`);
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------
function printHelp() {
  log(`
${c.bold}${c.magenta}MockLab${c.reset} ${c.gray}v0.1.0${c.reset}

${c.bold}Usage:${c.reset}
  mocklab <command> [arguments] [options]

${c.bold}Commands:${c.reset}
  ${c.cyan}init${c.reset}                        Check server and print status
  ${c.cyan}list${c.reset}                        List all projects
  ${c.cyan}create${c.reset} <name>               Create a new project
  ${c.cyan}import${c.reset} <spec> --project <n>  Import an OpenAPI spec
  ${c.cyan}run${c.reset} <project>               Start a mock server
  ${c.cyan}stop${c.reset} <project>              Stop a mock server
  ${c.cyan}reset${c.reset} <project>             Reset request stats
  ${c.cyan}export${c.reset} <project>            Export config to JSON
  ${c.cyan}delete${c.reset} <project>            Delete a project

${c.bold}OpenAPI specs folder:${c.reset}
  Place your .yaml / .json files in the ${c.cyan}openapi/${c.reset} folder at the root
  of this project. You can then import by filename only — no path needed:
    mocklab import petstore.yaml --project my-api

  You can also provide a full path if the file is elsewhere:
    mocklab import /some/path/api.yaml --project my-api

${c.bold}Environment:${c.reset}
  MOCKLAB_API        Dashboard server URL  (default: http://localhost:8080)
  MOCKLAB_SPECS_DIR  OpenAPI specs folder  (default: ./openapi)

${c.bold}Examples:${c.reset}
  mocklab create crm-api
  mocklab import crm-api.yaml --project crm-api   ${c.gray}# from openapi/ folder${c.reset}
  mocklab run crm-api
  mocklab list
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const args = Deno.args;
const [command, ...rest] = args;

try {
  switch (command) {
    case "init":
      await cmdInit();
      break;
    case "list":
    case "ls":
      await cmdList();
      break;
    case "create":
      if (!rest[0]) { fail("Usage: mocklab create <name>"); Deno.exit(1); }
      await cmdCreate(rest[0], rest[1]);
      break;
    case "import": {
      const projectFlag = rest.indexOf("--project");
      const projectName = projectFlag !== -1 ? rest[projectFlag + 1] : undefined;
      await cmdImport(rest[0], projectName);
      break;
    }
    case "run":
    case "start":
      if (!rest[0]) { fail("Usage: mocklab run <project>"); Deno.exit(1); }
      await cmdRun(rest[0]);
      break;
    case "stop":
      if (!rest[0]) { fail("Usage: mocklab stop <project>"); Deno.exit(1); }
      await cmdStop(rest[0]);
      break;
    case "reset":
      if (!rest[0]) { fail("Usage: mocklab reset <project>"); Deno.exit(1); }
      await cmdReset(rest[0]);
      break;
    case "export":
      if (!rest[0]) { fail("Usage: mocklab export <project>"); Deno.exit(1); }
      await cmdExport(rest[0]);
      break;
    case "delete":
    case "rm":
      if (!rest[0]) { fail("Usage: mocklab delete <project>"); Deno.exit(1); }
      await cmdDelete(rest[0]);
      break;
    default:
      printHelp();
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
  Deno.exit(1);
}
