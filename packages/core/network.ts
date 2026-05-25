export function localNetworkHosts(): string[] {
  const hosts = new Set<string>();

  try {
    for (const info of Deno.networkInterfaces()) {
      if (info.family !== "IPv4") continue;
      if (info.address === "127.0.0.1") continue;
      if (info.address.startsWith("169.254.")) continue;
      hosts.add(info.address);
    }
  } catch {
    // Network interface discovery can fail in restricted runtimes.
  }

  return [...hosts];
}

export function publicHostsFor(bindHost: string): string[] {
  const configured = Deno.env.get("MOCKLAB_PUBLIC_HOSTS") ??
    Deno.env.get("MOCKLAB_PUBLIC_HOST");
  if (configured) {
    return configured
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean);
  }

  if (bindHost === "0.0.0.0" || bindHost === "::") {
    return ["localhost", ...localNetworkHosts()];
  }

  return [bindHost];
}

export function httpBaseUrls(
  port: number,
  bindHost: string,
  path = "",
): string[] {
  return publicHostsFor(bindHost).map((host) => {
    const formattedHost = host.includes(":") && !host.startsWith("[")
      ? `[${host}]`
      : host;
    return `http://${formattedHost}:${port}${path}`;
  });
}

export function printUrlList(label: string, urls: string[]): void {
  console.log(`   ${label}:`);
  for (const url of urls) console.log(`      ${url}`);
}
