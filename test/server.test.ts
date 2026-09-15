import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { after, before, describe, it } from "node:test";

import { clientAddress } from "../src/server.ts";
import { createApp } from "../src/server.ts";
import type { Asset } from "../src/http/static.ts";

/**
 * The server is exercised over a real socket on an ephemeral port rather than
 * with a mocked request: the headers, the status codes and the conditional
 * handling are the contract, and they only exist once something has been sent.
 */

const assets = new Map<string, Asset>();
const server = createApp({ assets, version: "test" });

let origin = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
});

after(() => server.close());

const get = (path: string, init?: RequestInit) => fetch(`${origin}${path}`, init);

/** `res.json()` is `unknown`; every body this server sends is an object. */
const json = async (res: Response): Promise<Record<string, any>> =>
  (await res.json()) as Record<string, any>;

describe("routing", () => {
  it("renders an svg", async () => {
    const res = await get("/ada.svg");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/svg+xml; charset=utf-8");
    assert.match(await res.text(), /^<svg /);
  });

  it("rasterises png and webp", async () => {
    const png = await get("/ada.png?size=64");
    assert.equal(png.headers.get("content-type"), "image/png");
    const pngBytes = new Uint8Array(await png.arrayBuffer());
    assert.deepEqual([...pngBytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], "not a PNG signature");

    const webp = await get("/ada.webp?size=64");
    assert.equal(webp.headers.get("content-type"), "image/webp");
    const webpBytes = Buffer.from(await webp.arrayBuffer());
    assert.equal(webpBytes.subarray(8, 12).toString("ascii"), "WEBP");
  });

  it("answers a health check", async () => {
    const res = await get("/healthz");
    assert.equal(res.status, 200);
    assert.equal((await json(res)).status, "ok");
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  it("says so when the docs are not in the build", async () => {
    const res = await get("/");
    assert.equal(res.status, 404);
    assert.equal((await json(res)).error.code, "not_found");
  });

  it("allows GET and HEAD and nothing else", async () => {
    const body = await (await get("/ada.svg")).text();

    const head = await get("/ada.svg", { method: "HEAD" });
    assert.equal(head.status, 200);
    // A HEAD advertises the length it would have sent, and sends none of it.
    assert.equal(head.headers.get("content-length"), String(Buffer.byteLength(body)));
    assert.equal(await head.text(), "", "a HEAD must not carry a body");

    const post = await get("/ada.svg", { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD, OPTIONS");
  });

  it("answers a preflight", async () => {
    const res = await get("/ada.svg", { method: "OPTIONS" });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  });
});

describe("headers", () => {
  it("marks an avatar as cacheable forever and cross-origin usable", async () => {
    const res = await get("/ada.svg");
    assert.match(res.headers.get("cache-control") ?? "", /immutable/);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(res.headers.get("etag") ?? "", /^"/);
  });

  it("answers a matching conditional request with a 304 and no body", async () => {
    const first = await get("/ada.svg");
    const etag = first.headers.get("etag")!;

    const second = await get("/ada.svg", { headers: { "If-None-Match": etag } });
    assert.equal(second.status, 304);
    assert.equal(await second.text(), "");
  });

  it("reports the rate limit on every rendered avatar", async () => {
    const res = await get("/ada.svg");
    assert.equal(res.headers.get("x-ratelimit-limit"), "60");
    assert.ok(Number(res.headers.get("x-ratelimit-remaining")) >= 0);
    assert.ok(Number(res.headers.get("x-ratelimit-reset")) > Date.now() / 1000);
  });
});

describe("errors", () => {
  it("returns JSON naming the parameter at fault", async () => {
    const res = await get("/ada.svg?size=4096");
    assert.equal(res.status, 400);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");

    const body = await json(res);
    assert.equal(body.error.code, "bad_param");
    assert.equal(body.error.param, "size");
    assert.match(body.docs, /^https:\/\//);
  });

  it("refuses a format it does not produce", async () => {
    const res = await get("/ada.gif");
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error.code, "unknown_format");
  });

  it("refuses an oversized seed", async () => {
    const res = await get(`/${"a".repeat(300)}.svg`);
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error.code, "bad_seed");
  });
});

describe("clientAddress", () => {
  const request = (remote: string, forwarded?: string) =>
    ({
      socket: { remoteAddress: remote },
      headers: forwarded === undefined ? {} : { "x-forwarded-for": forwarded },
    }) as never;

  it("ignores the header when no proxy is trusted", () => {
    assert.equal(clientAddress(request("10.0.0.1", "1.2.3.4"), 0), "10.0.0.1");
  });

  it("takes the entry the nearest trusted proxy wrote", () => {
    assert.equal(clientAddress(request("10.0.0.1", "1.2.3.4, 9.9.9.9"), 1), "9.9.9.9");
    assert.equal(clientAddress(request("10.0.0.1", "1.2.3.4, 9.9.9.9"), 2), "1.2.3.4");
  });

  it("cannot be walked past the start of the chain by a spoofed header", () => {
    assert.equal(clientAddress(request("10.0.0.1", "1.2.3.4"), 5), "1.2.3.4");
  });

  it("falls back to the socket when the header is absent", () => {
    assert.equal(clientAddress(request("10.0.0.1"), 2), "10.0.0.1");
  });
});

describe("static assets", () => {
  // The docs are loaded from disk in `src/index.ts`; this suite installs a
  // couple by hand so the serving rules can be tested without a build.
  const html = Buffer.from("<!doctype html><script>void 0</script>" + "x".repeat(2000));
  const gzip = gzipSync(html, { level: 9 });

  before(() => {
    assets.set("/index.html", {
      body: html,
      gzip,
      type: "text/html; charset=utf-8",
      etag: '"page"',
      etagGzip: '"page-gz"',
      immutable: false,
      csp: "default-src 'none'",
    });
    assets.set("/", assets.get("/index.html")!);
  });

  it("serves the docs page with its policy", async () => {
    const res = await get("/", { headers: { "Accept-Encoding": "identity" } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-security-policy"), "default-src 'none'");
    assert.equal(res.headers.get("vary"), "Accept-Encoding");
  });

  it("gives the gzip representation a validator of its own", async () => {
    const plain = await get("/", { headers: { "Accept-Encoding": "identity" } });
    assert.equal(plain.headers.get("etag"), '"page"');

    // `fetch` always asks for gzip and decodes it, so the header is the tell.
    const compressed = await get("/");
    assert.equal(compressed.headers.get("etag"), '"page-gz"');
  });

  it("answers a conditional request against the matching representation", async () => {
    const res = await get("/", { headers: { "If-None-Match": '"page-gz"' } });
    assert.equal(res.status, 304);
    assert.equal(res.headers.get("cache-control"), "public, max-age=300");
  });

  it("does not let an asset path fall through to the renderer", async () => {
    const res = await get("/index.html", { headers: { "Accept-Encoding": "identity" } });
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  });
});
