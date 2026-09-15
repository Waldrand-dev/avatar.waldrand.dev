import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { ParamError, parseRequest } from "./avatar/params.ts";
import { rasterize } from "./avatar/raster.ts";
import { etagFor, renderSvg } from "./avatar/render.ts";
import { config } from "./config.ts";
import { RateLimiter } from "./http/ratelimit.ts";
import { send, sendProblem } from "./http/respond.ts";
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
      send(res, 204, { "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Max-Age": "86400" }, null);
      return;
    }
    if (method !== "GET" && method !== "HEAD") {
      sendProblem(res, 405, { code: "method_not_allowed", message: `${method} is not supported. Use GET.` }, DOCS_URL, { Allow: "GET, HEAD, OPTIONS" });
      return;
    }

    const headOnly = method === "HEAD";
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (pathname === "/healthz") {
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
      serveAsset(res, asset, req, headOnly);
      return;
    }

    if (pathname === "/") {
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
        sendProblem(res, 400, { code: error.code, param: error.param, message: error.message }, DOCS_URL, {}, headOnly);
        return;
      }
      throw error;
    }

    // Counted after parsing, so a caller burning through malformed URLs is
    // still limited, but a 400 they can fix does not cost them the answer.
    if (config.rateLimit.enabled) {
      const verdict = limiter.take(clientAddress(req, config.trustProxyHops));
      const headers = {
        "X-RateLimit-Limit": verdict.limit,
        "X-RateLimit-Remaining": verdict.remaining,
        "X-RateLimit-Reset": verdict.reset,
      };

      if (!verdict.allowed) {
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

    const etag = etagFor(request);
    if (req.headers["if-none-match"] === etag) {
      send(res, 304, { ETag: etag, "Cache-Control": `public, max-age=${config.cacheSeconds}, immutable` }, null, true);
      return;
    }

    const started = process.hrtime.bigint();
    const svg = renderSvg(request);
    const body =
      request.format === "svg" ? Buffer.from(svg, "utf8") : await rasterize(svg, request.format, request.size);
    const micros = Number(process.hrtime.bigint() - started) / 1000;

    send(
      res,
      200,
      {
        "Content-Type": CONTENT_TYPES[request.format],
        ETag: etag,
        // The bytes for a given URL are fixed for as long as the style is, so
        // this is as immutable as a content-addressed asset.
        "Cache-Control": `public, max-age=${config.cacheSeconds}, immutable`,
        "Content-Security-Policy": IMAGE_CSP,
        "Server-Timing": `render;dur=${(micros / 1000).toFixed(1)}`,
      },
      body,
      headOnly,
    );
  }

  server.on("close", () => limiter.stop());
  return server;
}
