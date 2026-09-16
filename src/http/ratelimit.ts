/**
 * A token bucket per client, held in this process's memory.
 *
 * `perMinute` is the sustained allowance and `burst` is how deep the bucket
 * goes. The default bucket holds four minutes' worth, so a page with a couple
 * of hundred distinct avatars loads in one go and the caller then refills at
 * one a second - the shape a page of avatars actually wants.
 *
 * In-process means one container's view only. Behind more than one replica
 * each gets its own bucket, so either put the limiter in front of them or
 * raise the numbers to match - see README.
 */

export interface Verdict {
  readonly allowed: boolean;
  /** The sustained per-minute allowance, for `X-RateLimit-Limit`. */
  readonly limit: number;
  /** Whole requests still available right now. */
  readonly remaining: number;
  /** Unix seconds at which the bucket is full again. */
  readonly reset: number;
  /** Whole seconds until the next request would be allowed. 0 when it is. */
  readonly retryAfter: number;
}

interface Bucket {
  tokens: number;
  updated: number;
}

/** Past this many tracked clients the oldest are dropped rather than grow without bound. */
const MAX_CLIENTS = 50_000;

export class RateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  readonly #capacity: number;
  readonly #perSecond: number;
  readonly #limit: number;
  #sweeper: NodeJS.Timeout | null = null;

  constructor(perMinute: number, burst: number) {
    this.#limit = perMinute;
    this.#capacity = Math.max(1, burst);
    this.#perSecond = perMinute / 60;
  }

  /**
   * Reads a client's bucket without spending from it - for answers that cost
   * nothing to give, like a 304 or a render already in cache, which should
   * still report where the caller stands.
   */
  peek(key: string, now: number = Date.now()): Verdict {
    const bucket = this.#buckets.get(key);
    const tokens =
      bucket === undefined ?
        this.#capacity
      : Math.min(this.#capacity, bucket.tokens + ((now - bucket.updated) / 1000) * this.#perSecond);

    return {
      allowed: true,
      limit: this.#limit,
      remaining: Math.floor(tokens),
      reset: Math.ceil(now / 1000 + (this.#capacity - tokens) / this.#perSecond),
      retryAfter: 0,
    };
  }

  /** Spends one token if there is one. Call once per limited request. */
  take(key: string, now: number = Date.now()): Verdict {
    let bucket = this.#buckets.get(key);

    if (bucket === undefined) {
      bucket = { tokens: this.#capacity, updated: now };
      // Map iteration is insertion-ordered, so the first key is the one that
      // has been around longest without being re-inserted.
      if (this.#buckets.size >= MAX_CLIENTS) {
        const oldest = this.#buckets.keys().next();
        if (!oldest.done) this.#buckets.delete(oldest.value);
      }
    } else {
      const elapsed = (now - bucket.updated) / 1000;
      bucket.tokens = Math.min(this.#capacity, bucket.tokens + elapsed * this.#perSecond);
      bucket.updated = now;
      // Re-insert so the eviction order above stays least-recently-used.
      this.#buckets.delete(key);
    }

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.#buckets.set(key, bucket);

    const toFull = (this.#capacity - bucket.tokens) / this.#perSecond;
    const toOne = allowed ? 0 : (1 - bucket.tokens) / this.#perSecond;

    return {
      allowed,
      limit: this.#limit,
      remaining: Math.floor(bucket.tokens),
      reset: Math.ceil(now / 1000 + toFull),
      retryAfter: Math.max(allowed ? 0 : 1, Math.ceil(toOne)),
    };
  }

  /**
   * Drops buckets that have refilled completely: a client at full allowance is
   * indistinguishable from one we have never seen, so remembering it is pure
   * cost.
   */
  sweep(now: number = Date.now()): void {
    const idleFor = (this.#capacity / this.#perSecond) * 1000;
    for (const [key, bucket] of this.#buckets) {
      if (now - bucket.updated > idleFor) this.#buckets.delete(key);
    }
  }

  /** Starts the sweeper. Unref'd, so it never holds the process open. */
  start(everyMs = 60_000): void {
    if (this.#sweeper !== null) return;
    this.#sweeper = setInterval(() => this.sweep(), everyMs);
    this.#sweeper.unref();
  }

  stop(): void {
    if (this.#sweeper !== null) clearInterval(this.#sweeper);
    this.#sweeper = null;
  }

  get size(): number {
    return this.#buckets.size;
  }
}
