import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRequest } from "../src/avatar/params.ts";
import { etagFor, renderSvg } from "../src/avatar/render.ts";
import { initialsFor } from "../src/avatar/styles/initials.ts";
import { STYLE_IDS } from "../src/avatar/styles/index.ts";

const request = (path: string, query = "") => parseRequest(path, new URLSearchParams(query));
const render = (path: string, query = "") => renderSvg(request(path, query));

describe("renderSvg", () => {
  it("renders the same bytes for the same request", () => {
    assert.equal(render("/ada.svg"), render("/ada.svg"));
  });

  it("renders different marks for different seeds", () => {
    assert.notEqual(render("/ada.svg"), render("/grace.svg"));
  });

  it("treats a style as a different drawing, not a recolour", () => {
    assert.notEqual(render("/ada.svg", "style=grid"), render("/ada.svg", "style=rings"));
  });

  it("produces well-formed markup for every style", () => {
    for (const style of STYLE_IDS) {
      const svg = render("/ada-lovelace.svg", `style=${style}`);
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      assert.match(svg, /<\/svg>$/);
      assert.ok(svg.includes('viewBox="0 0 100 100"'), `${style} lost its viewBox`);
      // Balanced tags, and no stray `<` from an unescaped seed.
      assert.equal((svg.match(/</g) ?? []).length, (svg.match(/>/g) ?? []).length);
      assert.ok(!/NaN|undefined|Infinity/.test(svg), `${style} emitted a bad number`);
    }
  });

  it("carries the seed into the accessible name, escaped", () => {
    const svg = render(`/${encodeURIComponent('a<b>&"c')}.svg`);
    assert.ok(svg.includes("&lt;b&gt;"), "the seed was not escaped");
    assert.ok(!svg.includes("<b>"), "raw markup from the seed reached the output");
  });

  it("honours size in the root attributes only", () => {
    assert.ok(render("/ada.svg", "size=512").includes('width="512" height="512"'));
    // The geometry is written in viewBox units, so the body is untouched by size.
    const body = (svg: string) => svg.slice(svg.indexOf("<title>"));
    assert.equal(body(render("/ada.svg", "size=64")), body(render("/ada.svg", "size=512")));
  });

  it("drops the ground for bg=none and clips a rounded tile", () => {
    const transparent = render("/ada.svg", "bg=none");
    assert.ok(!transparent.includes("<rect width=\"100\" height=\"100\" fill="));

    const square = render("/ada.svg");
    assert.ok(!square.includes("clipPath"), "a square tile needs no clip");

    const round = render("/ada.svg", "radius=50");
    assert.ok(round.includes("clipPath"), "a rounded tile must clip its figure");
    assert.ok(round.includes('rx="50"'));
  });

  it("uses the caller's background over the palette's", () => {
    assert.ok(render("/ada.svg", "bg=%23112233").includes('fill="#112233"'));
  });
});

describe("initialsFor", () => {
  it("takes one letter from each of the first two words", () => {
    assert.equal(initialsFor("ada lovelace"), "AL");
    assert.equal(initialsFor("ada-lovelace"), "AL");
    assert.equal(initialsFor("Grace  Brewster  Hopper"), "GB");
  });

  it("takes two letters from a single word", () => {
    assert.equal(initialsFor("waldrand"), "WA");
  });

  it("copes with one letter, with digits and with scripts beyond latin", () => {
    assert.equal(initialsFor("x"), "X");
    assert.equal(initialsFor("9f2c1ab"), "9F");
    assert.equal(initialsFor("здравей"), "ЗД");
  });

  it("falls back to the hash when the seed has no letters at all", () => {
    const value = initialsFor("!!! ???");
    assert.match(value, /^[0-9A-F]{2}$/);
    assert.equal(value, initialsFor("!!! ???"));
  });
});

describe("etagFor", () => {
  it("is stable for a request and different for any change to it", () => {
    const base = etagFor(request("/ada.svg"));
    assert.equal(base, etagFor(request("/ada.svg")));

    for (const query of ["size=512", "style=grid", "radius=10", "bg=none"]) {
      assert.notEqual(base, etagFor(request("/ada.svg", query)), `${query} did not move the etag`);
    }
    assert.notEqual(base, etagFor(request("/ada.png")));
  });

  it("cannot be forged by a seed that mimics the joining of the parts", () => {
    // Length-prefixed parts: no seed can spell out a neighbouring field.
    assert.notEqual(etagFor(request("/ada.svg", "style=grid")), etagFor(request("/adagrid.svg")));
  });

  it("is a quoted strong validator", () => {
    assert.match(etagFor(request("/ada.svg")), /^"[\w-]{22}"$/);
  });
});
