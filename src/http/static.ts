import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join, posix, relative, sep } from "node:path";

/**
 * The docs page and the brand assets, read into memory once at boot.
 *
 * The whole tree is a few hundred kilobytes and never changes while the
 * container is alive, so there is no reason to go back to the disk, and no
 * path from a request into the filesystem to get wrong.
 */

export interface Asset {
  readonly body: Buffer;
  /** gzip of `body`, when it was worth compressing. */
  readonly gzip: Buffer | null;
  readonly type: string;
  readonly etag: string;
  /**
   * The gzip representation's own validator. A different content-coding is a
   * different entity, so it may not share the identity ETag - a shared cache
   * that ignored `Vary` would otherwise hand compressed bytes to a client that
   * never asked for them.
   */
  readonly etagGzip: string;
  readonly immutable: boolean;
  /** For HTML only: the policy header this document may be served under. */
  readonly csp: string | null;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml; charset=utf-8",
};

const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json|xml)|image\/svg)/;

/** Fonts and hashed brand art never change under the same name. */
const IMMUTABLE = /^\/assets\//;

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
};

/**
 * Astro inlines a script small enough not to be worth a round trip, which a
 * policy of `script-src 'self'` would then refuse to run. Rather than open the
 * policy up, every inline block is hashed here and named in the header - so
 * exactly the code in this build may execute, and nothing else.
 */
const INLINE = /<(script|style)(?![^>]*\b(?:src|href)=)[^>]*>([\s\S]*?)<\/\1>/gi;

function policyFor(html: string): string {
  const scripts: string[] = [];
  const styles: string[] = [];

  for (const [, tag, contents] of html.matchAll(INLINE)) {
    if (contents === undefined || contents.length === 0) continue;
    const hash = `'sha256-${createHash("sha256").update(contents, "utf8").digest("base64")}'`;
    (tag!.toLowerCase() === "script" ? scripts : styles).push(hash);
  }

  return [
    "default-src 'none'",
    `script-src 'self'${scripts.map((h) => ` ${h}`).join("")}`,
    `style-src 'self'${styles.map((h) => ` ${h}`).join("")}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

export async function loadAssets(root: string): Promise<Map<string, Asset>> {
  const assets = new Map<string, Asset>();

  for await (const file of walk(root)) {
    const body = await readFile(file);
    const url = "/" + relative(root, file).split(sep).join(posix.sep);
    const type = TYPES[extensionOf(file)] ?? "application/octet-stream";

    // Below about a kilobyte the gzip header costs more than the coding saves.
    const gzip =
      COMPRESSIBLE.test(type) && body.byteLength > 1024 ?
        gzipSync(body, { level: 9 })
      : null;

    const digest = createHash("sha256").update(body).digest("base64url").slice(0, 22);

    const asset: Asset = {
      body,
      gzip: gzip !== null && gzip.byteLength < body.byteLength ? gzip : null,
      type,
      etag: `"${digest}"`,
      etagGzip: `"${digest}-gz"`,
      immutable: IMMUTABLE.test(url),
      csp: type.startsWith("text/html") ? policyFor(body.toString("utf8")) : null,
    };

    assets.set(url, asset);
    // `/docs/index.html` is also `/docs/` and `/docs`.
    if (url.endsWith("/index.html")) {
      const dir = url.slice(0, -"index.html".length);
      assets.set(dir, asset);
      if (dir.length > 1) assets.set(dir.slice(0, -1), asset);
    }
  }

  return assets;
}
