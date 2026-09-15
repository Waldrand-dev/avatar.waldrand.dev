import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SeedStream } from "../src/avatar/rng.ts";

const drain = (seed: string, count: number): number[] => {
  const stream = new SeedStream(seed);
  return Array.from({ length: count }, () => stream.byte());
};

describe("SeedStream", () => {
  it("gives the same bytes for the same seed", () => {
    assert.deepEqual(drain("ada", 64), drain("ada", 64));
  });

  it("gives different bytes for different seeds", () => {
    assert.notDeepEqual(drain("ada", 32), drain("Ada", 32));
  });

  it("keeps producing past the first digest", () => {
    // 32 bytes is one SHA-256 block; anything beyond it exercises the refill.
    const long = drain("ada", 200);
    assert.equal(long.length, 200);
    assert.deepEqual(long.slice(0, 32), drain("ada", 32));
    assert.ok(new Set(long.slice(32)).size > 20, "the refilled block is not constant");
  });

  it("holds int() inside its range", () => {
    const stream = new SeedStream("range");
    for (let i = 0; i < 5000; i += 1) {
      const value = stream.int(3, 9);
      assert.ok(value >= 3 && value <= 9, `${value} out of range`);
    }
  });

  it("spreads int() evenly enough to be worth calling random", () => {
    const stream = new SeedStream("spread");
    const counts = new Array<number>(10).fill(0);
    for (let i = 0; i < 20_000; i += 1) counts[stream.int(0, 9)]! += 1;

    // Rejection sampling should land every bucket within a few percent of
    // 2000; modulo bias would show up as a tilt towards the low buckets.
    for (const [bucket, count] of counts.entries()) {
      assert.ok(count > 1700 && count < 2300, `bucket ${bucket} had ${count}`);
    }
  });

  it("rejects an empty range", () => {
    assert.throws(() => new SeedStream("x").int(5, 4), RangeError);
  });

  it("refuses to pick from nothing", () => {
    assert.throws(() => new SeedStream("x").pick([]), RangeError);
  });
});
