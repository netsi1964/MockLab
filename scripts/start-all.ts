async function main() {
  const dashboardPort = Deno.env.get("MOCKLAB_PORT") ?? "8080";
  const dashboardApi = `http://localhost:${dashboardPort}/api`;

  console.log("🧪 Starting MockLab Dashboard Server...");

  // Start the dashboard server as a subprocess
  const process = new Deno.Command("deno", {
    args: ["run", "--allow-all", "packages/dashboard-server/main.ts"],
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();

  // Wait for the server to start (poll health endpoint)
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${dashboardApi}/health`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          ready = true;
          break;
        }
      }
    } catch {
      // ignore connection errors during startup
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!ready) {
    console.error(`❌ Dashboard server failed to start on ${dashboardApi}`);
    process.kill("SIGINT");
    Deno.exit(1);
  }

  console.log("✅ Dashboard server is ready!");

  // Query all projects
  try {
    const res = await fetch(`${dashboardApi}/projects`);
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      const projects = json.data;
      if (projects.length === 0) {
        console.log(
          "ℹ No projects found to start. Create one using 'mocklab create <name>'.",
        );
      } else {
        console.log(
          `🚀 Starting mock servers for ${projects.length} project(s)...`,
        );
        for (const p of projects) {
          console.log(`   - Starting project "${p.name}"...`);
          try {
            const startRes = await fetch(
              `${dashboardApi}/projects/${p.name}/start`,
              {
                method: "POST",
              },
            );
            const startJson = await startRes.json();
            if (startJson.success) {
              console.log(
                `   ✅ "${p.name}" is now running on port :${startJson.data.port}`,
              );
              if (
                Array.isArray(startJson.data.baseUrls) &&
                startJson.data.baseUrls.length > 0
              ) {
                console.log(`      URLs:`);
                for (const url of startJson.data.baseUrls) {
                  console.log(`         ${url}`);
                }
              }
            } else {
              console.error(
                `   ❌ Failed to start "${p.name}": ${startJson.error}`,
              );
            }
          } catch (err) {
            console.error(
              `   ❌ Connection error starting "${p.name}":`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("❌ Failed to query projects:", err);
  }

  console.log("\n🧪 MockLab is fully ready! Press Ctrl+C to stop.");

  // Handle graceful shutdown on Ctrl+C
  Deno.addSignalListener("SIGINT", () => {
    console.log("\n⏹ Stopping MockLab...");
    try {
      process.kill("SIGINT");
    } catch {
      // process might already be dead
    }
    Deno.exit(0);
  });

  Deno.addSignalListener("SIGTERM", () => {
    console.log("\n⏹ Stopping MockLab...");
    try {
      process.kill("SIGTERM");
    } catch {
      // process might already be dead
    }
    Deno.exit(0);
  });

  // Block indefinitely waiting for the dashboard process to exit
  const status = await process.status;
  Deno.exit(status.code);
}

if (import.meta.main) {
  await main();
}
