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

/** Short enough to guess is not a secret, so a weak one fails the boot. */
const MIN_TOKEN_LENGTH = 24;

/**
 * Reads a secret. Never echoes the value - a boot log is the last place a
 * token should end up - so the error talks about its length instead.
 */
const secret = (name: string): string => {
  const raw = process.env[name] ?? "";
  if (raw === "") return "";
  if (raw.length < MIN_TOKEN_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_TOKEN_LENGTH} characters; got ${raw.length}`);
  }
  return raw;
};

const zone = (name: string, fallback: string): string => {
  const value = str(name, fallback);
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
  } catch {
    throw new Error(`${name} must be an IANA time zone such as "Europe/Berlin", got ${JSON.stringify(value)}`);
  }
  return value;
};

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

  /**
   * The private request counters at `/stats`.
   *
   * `STATS_TOKEN` is the whole of the access control: unset, the route does
   * not exist and `/stats` is just another seed. Set, it must be presented as
   * `Authorization: Bearer <token>` or `?token=<token>`, and anything else
   * gets the same 404 an unknown path gets.
   *
   * `timezone` decides what "today" means on the page. UTC unless told
   * otherwise, so an unconfigured container draws an unambiguous day.
   */
  stats: {
    token: secret("STATS_TOKEN"),
    timezone: zone("STATS_TIMEZONE", "UTC"),
    get enabled() {
      return this.token !== "";
    },
  },

  /** Hard ceiling on a seed, before decoding. Keeps a URL from becoming a payload. */
  maxSeedLength: 256,
} as const;

export type Config = typeof config;
