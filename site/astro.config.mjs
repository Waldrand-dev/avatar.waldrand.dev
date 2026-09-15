// @ts-check
import tailwind from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

/**
 * The docs are built straight into the service's `public/` directory, which is
 * what `src/http/static.ts` reads into memory at boot. There is no second
 * server and no adapter: `astro build` writes plain HTML, and the Node process
 * that renders avatars hands it out.
 */
export default defineConfig({
  site: "https://avatar.waldrand.dev",
  outDir: "../public",
  // Directory format gives `de/index.html`, which the static loader already
  // resolves for `/de` and `/de/` alike.
  build: { format: "directory" },
  trailingSlash: "ignore",
  vite: { plugins: [tailwind()] },
});
