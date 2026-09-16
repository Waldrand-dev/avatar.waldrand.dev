import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RenderCache } from "../src/http/render-cache.ts";

const bytes = (n: number) => Buffer.alloc(n);

describe("RenderCache", () => {
  it("returns what was stored", () => {
    const cache = new RenderCache(100);
    cache.set("a", Buffer.from("svg"));
    assert.equal(cache.get("a")?.toString(), "svg");
    assert.equal(cache.get("b"), undefined);
  });

  it("stays under its byte budget, dropping the least recently used", () => {
    const cache = new RenderCache(30);
    cache.set("a", bytes(10));
    cache.set("b", bytes(10));
    cache.set("c", bytes(10));
    cache.get("a");
    cache.set("d", bytes(10));

    assert.equal(cache.bytes, 30);
    assert.equal(cache.get("b"), undefined, "b was the coldest");
    assert.ok(cache.get("a") && cache.get("c") && cache.get("d"));
  });

  it("does not double-count a key stored twice", () => {
    const cache = new RenderCache(30);
    cache.set("a", bytes(10));
    cache.set("a", bytes(20));
    assert.equal(cache.bytes, 20);
    assert.equal(cache.size, 1);
  });

  it("stores nothing when disabled or when one entry would not fit", () => {
    const off = new RenderCache(0);
    off.set("a", bytes(1));
    assert.equal(off.size, 0);

    const small = new RenderCache(5);
    small.set("a", bytes(6));
    assert.equal(small.size, 0);
  });
});
