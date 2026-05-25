const DEFAULT_URL = "http://localhost:4010";

function usage(): void {
  console.log(`Usage:
  deno task tunnel
  deno task tunnel http://localhost:8080
  deno task tunnel http://localhost:4010

Environment:
  MOCKLAB_TUNNEL_URL=http://localhost:8080 deno task tunnel
`);
}

async function commandExists(command: string): Promise<boolean> {
  const check = new Deno.Command(command, {
    args: ["--version"],
    stdout: "null",
    stderr: "null",
  });

  try {
    const status = await check.output();
    return status.success;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const arg = Deno.args[0];
  if (arg === "--help" || arg === "-h") {
    usage();
    return;
  }

  const url = arg ?? Deno.env.get("MOCKLAB_TUNNEL_URL") ?? DEFAULT_URL;

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    console.error(`Invalid tunnel URL: ${url}`);
    usage();
    Deno.exit(1);
  }

  if (!(await commandExists("cloudflared"))) {
    console.error(`cloudflared was not found.

Install it first:
  brew install cloudflare/cloudflare/cloudflared

Then run:
  deno task tunnel ${url}
`);
    Deno.exit(1);
  }

  console.log("Opening temporary Cloudflare tunnel...");
  console.log(`Local target: ${url}`);
  console.log(
    "Public URL: watch for the https://*.trycloudflare.com line below.",
  );
  console.log("Press Ctrl+C to close the tunnel.\n");

  const tunnel = new Deno.Command("cloudflared", {
    args: ["tunnel", "--url", url],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();

  const stop = () => {
    try {
      tunnel.kill("SIGINT");
    } catch {
      // Already stopped.
    }
  };

  Deno.addSignalListener("SIGINT", stop);
  Deno.addSignalListener("SIGTERM", stop);

  const status = await tunnel.status;
  Deno.exit(status.code);
}

if (import.meta.main) {
  await main();
}
