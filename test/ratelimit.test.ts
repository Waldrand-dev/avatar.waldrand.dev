import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RateLimiter } from "../src/http/ratelimit.ts";

describe("RateLimiter", () => {
  it("lets a full bucket be spent in one go, then refuses", () => {
    const limiter = new RateLimiter(60, 60);
    const now = 1_000_000;

    for (let i = 0; i < 60; i += 1) {
      assert.equal(limiter.take("a", now).allowed, true, `request ${i + 1} was refused`);
    }
    assert.equal(limiter.take("a", now).allowed, false);
  });

  it("counts down remaining and reports the limit", () => {
    const limiter = new RateLimiter(60, 60);
    const now = 1_000_000;

    assert.equal(limiter.take("a", now).remaining, 59);
    assert.equal(limiter.take("a", now).remaining, 58);
    assert.equal(limiter.take("a", now).limit, 60);
  });

  it("refills at the sustained rate", () => {
    const limiter = new RateLimiter(60, 60);
    const now = 1_000_000;
    for (let i = 0; i < 60; i += 1) limiter.take("a", now);

    assert.equal(limiter.take("a", now + 500).allowed, false, "half a second is not a token");
    assert.equal(limiter.take("a", now + 1000).allowed, true, "a second is one token");
  });

  it("never refills past the bucket depth", () => {
    const limiter = new RateLimiter(60, 60);
    limiter.take("a", 1_000_000);
    // An hour later the bucket is full, not overflowing.
    assert.equal(limiter.take("a", 1_000_000 + 3_600_000).remaining, 59);
  });

  it("keeps one client's spending away from another's", () => {
    const limiter = new RateLimiter(2, 2);
    const now = 1_000_000;
    limiter.take("a", now);
    limiter.take("a", now);

    assert.equal(limiter.take("a", now).allowed, false);
    assert.equal(limiter.take("b", now).allowed, true);
  });

  it("gives a retry-after of at least a second when it refuses", () => {
    const limiter = new RateLimiter(60, 1);
    const now = 1_000_000;
    limiter.take("a", now);

    const verdict = limiter.take("a", now);
    assert.equal(verdict.allowed, false);
    assert.ok(verdict.retryAfter >= 1, "a client told to retry in 0s will hammer");
  });

  it("puts reset in the future, in whole seconds", () => {
    const now = 1_000_000;
    const verdict = new RateLimiter(60, 60).take("a", now);
    assert.ok(verdict.reset > now / 1000);
    assert.equal(Number.isInteger(verdict.reset), true);
  });

  it("forgets a client once its bucket has refilled", () => {
    const limiter = new RateLimiter(60, 60);
    limiter.take("a", 1_000_000);
    assert.equal(limiter.size, 1);

    limiter.sweep(1_000_000 + 1000);
    assert.equal(limiter.size, 1, "still spending down");

    limiter.sweep(1_000_000 + 120_000);
    assert.equal(limiter.size, 0, "a refilled bucket is the same as no bucket");
  });
});
