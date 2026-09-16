/**
 * Every knob the container takes, read once at boot.
 *
 * The defaults are the ones avatar.waldrand.dev runs with, so an unconfigured
 * `docker run -p 8080:8080` behaves exactly like production.
 */

const int = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  return value;
};

const str = (name: string, fallback: string): string => process.env[name] || fallback;

export const config = {
  host: str("HOST", "0.0.0.0"),
  port: int("PORT", 8080),

  /** Canonical origin — used for the examples printed in the docs. */
  origin: str("PUBLIC_ORIGIN", "https://avatar.waldrand.dev"),

  /**
   * The per-IP allowance. `perMinute` is the sustained rate and what
   * `X-RateLimit-Limit` reports; `burst` is the bucket depth - how much may be
   * spent at once - and defaults to four minutes' worth. A page showing 80+
   * distinct avatars is one burst of requests, and a bucket only a minute deep
   * would 429 the tail of it on first load.
   *
   * Only renders are charged. A 304 or an answer from the render cache costs
   * nothing - see `src/server.ts`.
   */
  rateLimit: {
    perMinute: int("RATE_LIMIT_PER_MINUTE", 60),
    burst: int("RATE_LIMIT_BURST", 0),
    /** 0 disables limiting entirely - for a container behind your own gateway. */
    get enabled() {
      return this.perMinute > 0;
    },
    /** The bucket depth actually used: `burst` when set, four minutes' worth otherwise. */
    get depth() {
      return this.burst > 0 ? this.burst : this.perMinute * 4;
    },
  },

  /** Memory for rendered avatars, in MiB. Hits skip the renderer and the rate limit. 0 disables it. */
  renderCacheBytes: int("RENDER_CACHE_MB", 32) * 1024 * 1024,

  /** `max-age` on a rendered avatar. They never change, so this is measured in days. */
  cacheSeconds: int("CACHE_SECONDS", 60 * 60 * 24 * 30),

  /**
   * How many proxy hops to trust when reading the client IP out of
   * `X-Forwarded-For`. 0 means use the socket address and ignore the header —
   * the right answer unless something in front of you rewrites it.
   */
  trustProxyHops: int("TRUST_PROXY_HOPS", 0),

  /** Hard ceiling on a seed, before decoding. Keeps a URL from becoming a payload. */
  maxSeedLength: 256,
} as const;

export type Config = typeof config;
