import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { configureSharp } from "./avatar/raster.ts";
import { config } from "./config.ts";
import { loadAssets } from "./http/static.ts";
import { createApp } from "./server.ts";

/** `src/index.ts` and `dist/index.js` are both one level under the package root. */
const ROOT = join(import.meta.dirname, "..");

async function version(): Promise<string> {
  try {
    const pkg: unknown = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
    if (typeof pkg === "object" && pkg !== null && "version" in pkg) {
      return String((pkg as { version: unknown }).version);
    }
  } catch {
    // A container built without the manifest still starts; it just cannot say
    // which build it is.
  }
  return "unknown";
}

async function main(): Promise<void> {
  configureSharp();

  const assets = await loadAssets(join(ROOT, "public"));
  const server = createApp({ assets, version: await version() });

  // Defaults tuned for something that sits behind a proxy and answers in
  // milliseconds: no request here has a body, so nothing needs a long window.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 20_000;
  server.requestTimeout = 20_000;

  server.listen(config.port, config.host, () => {
    console.log(
      `avatar.waldrand.dev listening on http://${config.host}:${config.port} ` +
        `(${assets.size} assets, ${config.rateLimit.enabled ? `${config.rateLimit.perMinute}/min per ip` : "no rate limit"})`,
    );
  });

  // Docker sends SIGTERM and waits; finish what is in flight, then go.
  const shutdown = (signal: string) => {
    console.log(`${signal} received, draining`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

await main();
