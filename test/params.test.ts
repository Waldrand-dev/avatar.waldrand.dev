import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ParamError, parseHex, parseRequest, splitPath } from "../src/avatar/params.ts";

const parse = (path: string, query = "") => parseRequest(path, new URLSearchParams(query));

describe("splitPath", () => {
  it("separates a known extension from the seed", () => {
    assert.deepEqual(splitPath("/ada.svg"), { seed: "ada", format: "svg" });
    assert.deepEqual(splitPath("/ada.png"), { seed: "ada", format: "png" });
    assert.deepEqual(splitPath("/ada.webp"), { seed: "ada", format: "webp" });
  });

  it("defaults to svg when there is no extension", () => {
    assert.deepEqual(splitPath("/ada"), { seed: "ada", format: "svg" });
  });

  it("leaves a dotted seed alone when the tail is not extension-shaped", () => {
    assert.deepEqual(splitPath("/ada.lovelace"), { seed: "ada.lovelace", format: "svg" });
    assert.deepEqual(splitPath("/v1.2.3-rc"), { seed: "v1.2.3-rc", format: "svg" });
  });

  it("strips only the trailing format off a dotted seed", () => {
    assert.deepEqual(splitPath("/ada.lovelace.png"), { seed: "ada.lovelace", format: "png" });
  });

  it("refuses a format it cannot produce rather than guessing", () => {
    assert.throws(() => splitPath("/ada.jpg"), (e: ParamError) => e.code === "unknown_format");
  });

  it("decodes the seed", () => {
    assert.equal(splitPath("/ada%20lovelace.svg").seed, "ada lovelace");
    assert.equal(splitPath("/%E2%9B%B0.svg").seed, "⛰");
  });

  it("rejects seeds that are empty, oversized, malformed or controlling", () => {
    const bad = (e: ParamError) => e.code === "bad_seed";
    assert.throws(() => splitPath("/.svg"), bad);
    assert.throws(() => splitPath(`/${"a".repeat(257)}.svg`), bad);
    assert.throws(() => splitPath("/%E0%A4%A.svg"), bad);
    assert.throws(() => splitPath("/a%00b.svg"), bad);
  });
});

describe("parseHex", () => {
  it("takes the four spellings of a colour", () => {
    for (const input of ["#e8552f", "e8552f", "#E8552F", "E8552F"]) {
      assert.equal(parseHex(input), "#e8552f");
    }
  });

  it("expands the three-digit form", () => {
    assert.equal(parseHex("#abc"), "#aabbcc");
  });

  it("rejects anything else", () => {
    for (const input of ["red", "#ab", "#abcd", "12345g"]) {
      assert.throws(() => parseHex(input), ParamError);
    }
  });
});

describe("parseRequest", () => {
  it("fills in the documented defaults", () => {
    assert.deepEqual(parse("/ada.svg"), {
      seed: "ada",
      format: "svg",
      size: 256,
      style: "ridge",
      radius: 0,
      background: null,
      backgroundAuto: true,
    });
  });

  it("reads every parameter", () => {
    const request = parse("/ada.png", "size=512&style=grid&radius=12&bg=%23112233");
    assert.equal(request.size, 512);
    assert.equal(request.style, "grid");
    assert.equal(request.radius, 12);
    assert.equal(request.background, "#112233");
    assert.equal(request.backgroundAuto, false);
  });

  it("treats bg=none as a transparent ground, not as auto", () => {
    const request = parse("/ada.png", "bg=none");
    assert.equal(request.background, null);
    assert.equal(request.backgroundAuto, false);
  });

  it("holds size and radius to their range", () => {
    const bad = (param: string) => (e: ParamError) => e.code === "bad_param" && e.param === param;
    assert.throws(() => parse("/ada.png", "size=15"), bad("size"));
    assert.throws(() => parse("/ada.png", "size=1025"), bad("size"));
    assert.throws(() => parse("/ada.png", "radius=51"), bad("radius"));
    assert.throws(() => parse("/ada.png", "radius=-1"), bad("radius"));
  });

  it("will not take a number dressed up as something else", () => {
    // `Number("1e3")` is 1000, which is in range - but nobody meant that.
    assert.throws(() => parse("/ada.png", "size=1e3"), ParamError);
    assert.throws(() => parse("/ada.png", "size=0x40"), ParamError);
    assert.throws(() => parse("/ada.png", "size=64px"), ParamError);
  });

  it("names an unknown style and lists the real ones", () => {
    assert.throws(
      () => parse("/ada.svg", "style=blobs"),
      (e: ParamError) => e.param === "style" && e.message.includes("ridge"),
    );
  });

  it("treats an empty parameter as absent", () => {
    assert.equal(parse("/ada.svg", "size=&style=&radius=").size, 256);
  });
});
