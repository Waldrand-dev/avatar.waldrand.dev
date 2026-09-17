import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { ParamError, parseRequest } from "./avatar/params.ts";
import { rasterize } from "./avatar/raster.ts";
import { etagFor, renderSvg } from "./avatar/render.ts";
import { config } from "./config.ts";
import { RateLimiter, type Verdict } from "./http/ratelimit.ts";
import { RenderCache } from "./http/render-cache.ts";
import { send, sendProblem } from "./http/respond.ts";
import { RecentRenders } from "./http/recent.ts";
import { renderStatsPage } from "./http/stats-page.ts";
import { RequestStats } from "./http/stats.ts";
import type { Asset } from "./http/static.ts";

const DOCS_URL = `${config.origin}/`;

/**
 * An avatar is inert markup, but a browser pointed straight at an `image/svg+xml`
 * response treats it as a document, so it is served under a policy that would
 * stop one that was not.
 */
const IMAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

const CONTENT_TYPES = {
  svg: "image/svg+xml; charset=utf-8",
  png: "image/png",
  webp: "image/webp",
} as const;

export interface AppOptions {
  readonly assets: Map<string, Asset>;
  readonly version: string;
}

/**
 * Reads the caller's address.
 *
 * `X-Forwarded-For` is only consulted as far as `TRUST_PROXY_HOPS` says there
 * are proxies, counting from the right - the entries further left are written
 * by whoever is calling and are not evidence of anything.
 */
export function clientAddress(req: IncomingMessage, hops: number): string {
  const socketAddress = req.socket.remoteAddress ?? "unknown";
  if (hops <= 0) return socketAddress;

  const forwarded = req.headers["x-forwarded-for"];
  const chain = (Array.isArray(forwarded) ? forwarded.join(",") : (forwarded ?? ""))
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (chain.length === 0) return socketAddress;
  // The rightmost entry was added by the nearest proxy; step left one per hop.
  return chain[Math.max(0, chain.length - hops)] ?? socketAddress;
}

/**
 * Whether the caller holds the stats token.
 *
 * Compared as digests of a fixed length so the comparison cannot be timed,
 * and so a wrong token of the wrong length fails the same way as one of the
 * right length. Read from `Authorization` first; the query parameter is there
 * because a chart is something you open in a browser, where a header is not
 * something you can add.
 */
export function holdsToken(req: IncomingMessage, params: URLSearchParams, expected: string): boolean {
  if (expected === "") return false;

  const header = String(req.headers.authorization ?? "");
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const supplied = bearer !== "" ? bearer : (params.get("token") ?? "");

  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}

function serveAsset(res: ServerResponse, asset: Asset, req: IncomingMessage, headOnly: boolean): void {
  const acceptsGzip = /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));
  const useGzip = asset.gzip !== null && acceptsGzip;

  // Which representation is being served decides which validator applies, so
  // the coding is chosen before the conditional request is answered.
  const etag = useGzip ? asset.etagGzip : asset.etag;
  const cache = asset.immutable ? "public, max-age=31536000, immutable" : "public, max-age=300";

  if (req.headers["if-none-match"] === etag) {
    send(res, 304, { ETag: etag, Vary: "Accept-Encoding", "Cache-Control": cache }, null, true);
    return;
  }

  send(
    res,
    200,
    {
      "Content-Type": asset.type,
      ETag: etag,
      Vary: "Accept-Encoding",
      "Cache-Control": cache,
      ...(useGzip ? { "Content-Encoding": "gzip" } : {}),
      ...(asset.csp === null ? {} : { "Content-Security-Policy": asset.csp }),
    },
    useGzip ? asset.gzip : asset.body,
    headOnly,
  );
}

export function createApp({ assets, version }: AppOptions): Server {
  const limiter = new RateLimiter(config.rateLimit.perMinute, config.rateLimit.depth);
  if (config.rateLimit.enabled) limiter.start();
  const cache = new RenderCache(config.renderCacheBytes);
  const stats = new RequestStats(config.stats.timezone);
  const recent = new RecentRenders(config.stats.recentMs, config.stats.recentMax);

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      // Nothing below is expected to throw; if it does the caller still gets a
      // shaped answer rather than a socket that closes on them.
      console.error("unhandled request error", error);
      if (!res.headersSent) {
        sendProblem(res, 500, { code: "internal", message: "The renderer failed." }, DOCS_URL);
      } else {
        res.destroy();
      }
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";

    if (method === "OPTIONS") {
      stats.record("page");
      send(res, 204, { "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Max-Age": "86400" }, null);
      return;
    }
    if (method !== "GET" && method !== "HEAD") {
      stats.record("rejected");
      sendProblem(res, 405, { code: "method_not_allowed", message: `${method} is not supported. Use GET.` }, DOCS_URL, { Allow: "GET, HEAD, OPTIONS" });
      return;
    }

    const headOnly = method === "HEAD";
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    // Before the asset table and the seed namespace, and only a route at all
    // when a token is configured. Reading the counters is not a request worth
    // counting, so nothing here records.
    if (config.stats.enabled && (pathname === "/stats" || pathname === "/stats.json")) {
      if (!holdsToken(req, url.searchParams, config.stats.token)) {
        // The same answer an unknown path gets: whoever is guessing learns
        // nothing about whether this one exists.
        sendProblem(res, 404, { code: "not_found", message: "No such path." }, DOCS_URL, {}, headOnly);
        return;
      }

      const snapshot = stats.snapshot();
      const seen = recent.list();
      const headers = { "Cache-Control": "no-store, private" };

      if (pathname === "/stats.json") {
        send(
          res,
          200,
          { "Content-Type": "application/json; charset=utf-8", ...headers },
          JSON.stringify({ ...snapshot, recent: seen, recentWindowMinutes: config.stats.recentMinutes }, null, 2) + "\n",
          headOnly,
          { shared: false },
        );
        return;
      }

      send(
        res,
        200,
        { "Content-Type": "text/html; charset=utf-8", ...headers },
        renderStatsPage({ snapshot, recent: seen, recentWindowMs: recent.windowMs, origin: config.origin }),
        headOnly,
        { shared: false },
      );
      return;
    }

    if (pathname === "/healthz") {
      stats.record("page");
      send(
        res,
        200,
        { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        JSON.stringify({ status: "ok", version, uptime: Math.round(process.uptime()) }) + "\n",
        headOnly,
      );
      return;
    }

    // The docs page and the brand assets win over the seed namespace, so no
    // seed can shadow `/styles.css`. Seeds that collide are still reachable
    // with an extension, which is the documented shape anyway.
    const asset = assets.get(pathname);
    if (asset !== undefined) {
      stats.record("page");
      serveAsset(res, asset, req, headOnly);
      return;
    }

    if (pathname === "/") {
      stats.record("page");
      sendProblem(res, 404, { code: "not_found", message: "The docs page is missing from this build." }, DOCS_URL, {}, headOnly);
      return;
    }

    await serveAvatar(req, res, pathname, url.searchParams, headOnly);
  }

  async function serveAvatar(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    params: URLSearchParams,
    headOnly: boolean,
  ): Promise<void> {
    let request;
    try {
      request = parseRequest(pathname, params);
    } catch (error) {
      if (error instanceof ParamError) {
        stats.record("rejected");
        sendProblem(res, 400, { code: error.code, param: error.param, message: error.message }, DOCS_URL, {}, headOnly);
        return;
      }
      throw error;
    }

    const etag = etagFor(request);
    const cacheControl = `public, max-age=${config.cacheSeconds}, immutable`;
    const imageHeaders = {
      "Content-Type": CONTENT_TYPES[request.format],
      ETag: etag,
      // The bytes for a given URL are fixed for as long as the style is, so
      // this is as immutable as a content-addressed asset.
      "Cache-Control": cacheControl,
      "Content-Security-Policy": IMAGE_CSP,
    };
    const rateHeaders = (verdict: Verdict) => ({
      "X-RateLimit-Limit": verdict.limit,
      "X-RateLimit-Remaining": verdict.remaining,
      "X-RateLimit-Reset": verdict.reset,
    });
    const client = clientAddress(req, config.trustProxyHops);

    // Answers that never reach the renderer are not charged: a revalidation
    // the caller already holds the bytes for, and a render already in cache.
    // The limit protects the renderer, and a page that shows the same avatars
    // on every view should not run into it. They still report the bucket.
    if (req.headers["if-none-match"] === etag) {
      stats.record("revalidated");
      const limit = config.rateLimit.enabled ? rateHeaders(limiter.peek(client)) : {};
      send(res, 304, { ETag: etag, "Cache-Control": cacheControl, ...limit }, null, true);
      return;
    }

    const cached = cache.get(etag);
    if (cached !== undefined) {
      stats.record("cached");
      recent.record(request, etag, false);
      const limit = config.rateLimit.enabled ? rateHeaders(limiter.peek(client)) : {};
      send(res, 200, { ...imageHeaders, ...limit }, cached, headOnly);
      return;
    }

    // Counted after parsing, so a caller burning through malformed URLs is
    // still limited, but a 400 they can fix does not cost them the answer.
    if (config.rateLimit.enabled) {
      const verdict = limiter.take(client);
      const headers = rateHeaders(verdict);

      if (!verdict.allowed) {
        stats.record("limited");
        sendProblem(
          res,
          429,
          { code: "rate_limited", message: `Over ${verdict.limit} requests a minute. Retry in ${verdict.retryAfter}s.` },
          DOCS_URL,
          { ...headers, "Retry-After": verdict.retryAfter },
          headOnly,
        );
        return;
      }
      res.setHeader("X-RateLimit-Limit", headers["X-RateLimit-Limit"]);
      res.setHeader("X-RateLimit-Remaining", headers["X-RateLimit-Remaining"]);
      res.setHeader("X-RateLimit-Reset", headers["X-RateLimit-Reset"]);
    }

    stats.record("rendered");
    recent.record(request, etag, true);
    const started = process.hrtime.bigint();
    const svg = renderSvg(request);
    const body =
      request.format === "svg" ? Buffer.from(svg, "utf8") : await rasterize(svg, request.format, request.size);
    const micros = Number(process.hrtime.bigint() - started) / 1000;
    cache.set(etag, body);

    send(
      res,
      200,
      { ...imageHeaders, "Server-Timing": `render;dur=${(micros / 1000).toFixed(1)}` },
      body,
      headOnly,
    );
  }

  server.on("close", () => limiter.stop());
  return server;
}
