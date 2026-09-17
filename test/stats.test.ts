import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import type { AvatarRequest } from "../src/avatar/params.ts";
import { RecentRenders, type RecentEntry } from "../src/http/recent.ts";
import { RequestStats, recentDates, sum } from "../src/http/stats.ts";

/** An avatar request, as `parseRequest` would have produced it. */
const request = (seed: string, style = "ridge"): AvatarRequest => ({
  seed,
  format: "svg",
  size: 256,
  style,
  radius: 0,
  background: null,
  backgroundAuto: true,
});

/**
 * The counters are read through a zone, so every assertion here pins one:
 * `UTC` where only the arithmetic matters, and a real zone where the point is
 * that a local day is not a UTC one.
 */

const HOUR = 3_600_000;
const at = (iso: string) => Date.parse(iso);

describe("request stats", () => {
  it("counts a request into the hour it happened", () => {
    const stats = new RequestStats("UTC");
    const now = at("2026-09-17T14:20:00Z");

    stats.record("rendered", now);
    stats.record("rendered", now + 60_000);
    stats.record("cached", now);

    const snapshot = stats.snapshot(now);
    assert.equal(snapshot.today.date, "2026-09-17");
    assert.equal(snapshot.today.total, 3);
    assert.equal(snapshot.today.counts.rendered, 2);
    assert.equal(snapshot.today.counts.cached, 1);
    assert.equal(snapshot.today.hours.at(14)?.total, 3);
    assert.equal(snapshot.today.hours.at(13)?.total, 0);
  });

  it("reports twenty-four hours and thirty days whether or not anything happened", () => {
    const snapshot = new RequestStats("UTC").snapshot(at("2026-01-02T03:00:00Z"));

    assert.equal(snapshot.today.hours.length, 24);
    assert.deepEqual(
      snapshot.today.hours.map((point) => point.hour),
      Array.from({ length: 24 }, (_, hour) => hour),
    );
    assert.equal(snapshot.days.length, 30);
    assert.equal(snapshot.days.at(-1)?.date, "2026-01-02");
    // Thirty days back from 2 January is 4 December, and the year turns over.
    assert.equal(snapshot.days.at(0)?.date, "2025-12-04");
    assert.equal(snapshot.today.total, 0);
  });

  it("splits the day by the configured zone, not by UTC", () => {
    const stats = new RequestStats("Europe/Berlin");
    // 22:30 UTC is already the next day in Berlin, and its 00:30.
    const late = at("2026-09-17T22:30:00Z");

    stats.record("rendered", late);
    const snapshot = stats.snapshot(late);

    assert.equal(snapshot.today.date, "2026-09-18");
    assert.equal(snapshot.today.hours.at(0)?.total, 1);
    assert.equal(snapshot.today.total, 1);
  });

  it("keeps a month of hours and forgets what falls out", () => {
    const stats = new RequestStats("UTC");
    const now = at("2026-09-17T12:00:00Z");

    stats.record("rendered", now - 40 * 24 * HOUR);
    stats.record("rendered", now - 10 * 24 * HOUR);
    stats.record("rendered", now);

    const snapshot = stats.snapshot(now);
    const monthTotal = snapshot.days.reduce((running, day) => running + day.total, 0);

    // The 40-day-old hour was dropped when a newer one was opened, so only the
    // two inside the window are left to find.
    assert.equal(monthTotal, 2);
    assert.equal(snapshot.days.at(-1)?.total, 1);
    assert.equal(snapshot.days.find((day) => day.date === "2026-09-07")?.total, 1);
  });

  it("totals a bucket across outcomes", () => {
    const stats = new RequestStats("UTC");
    const now = at("2026-09-17T09:00:00Z");
    for (const outcome of ["rendered", "cached", "revalidated", "limited", "rejected", "page"] as const) {
      stats.record(outcome, now);
    }

    const snapshot = stats.snapshot(now);
    assert.equal(sum(snapshot.today.counts), 6);
    assert.equal(snapshot.today.total, 6);
  });
});

describe("recent renders", () => {
  const now = at("2026-09-17T14:00:00Z");

  it("keeps what happened inside the window and forgets the rest", () => {
    const recent = new RecentRenders(2 * HOUR);
    recent.record(request("old"), '"old"', true, now - 3 * HOUR);
    recent.record(request("fresh"), '"fresh"', true, now - 30 * 60_000);

    const list = recent.list(now);
    assert.equal(list.length, 1);
    assert.equal(list[0]?.request.seed, "fresh");
  });

  it("counts repeats of the same image instead of listing it twice", () => {
    const recent = new RecentRenders(2 * HOUR);
    recent.record(request("ada"), '"ada"', true, now - 10 * 60_000);
    recent.record(request("ada"), '"ada"', false, now - 5 * 60_000);
    recent.record(request("ada"), '"ada"', false, now - 60_000);

    const [entry] = recent.list(now);
    assert.equal(recent.list(now).length, 1);
    assert.equal(entry?.count, 3);
    assert.equal(entry?.rendered, 1, "only the first one reached the renderer");
    assert.equal(entry?.lastAt, now - 60_000);
  });

  it("lists the newest first", () => {
    const recent = new RecentRenders(2 * HOUR);
    recent.record(request("first"), '"first"', true, now - 20 * 60_000);
    recent.record(request("second"), '"second"', true, now - 10 * 60_000);
    recent.record(request("third"), '"third"', true, now - 60_000);

    assert.deepEqual(
      recent.list(now).map((entry) => entry.request.seed),
      ["third", "second", "first"],
    );
  });

  it("drops the oldest once the ceiling is reached, however recent they are", () => {
    const recent = new RecentRenders(2 * HOUR, 3);
    for (const seed of ["a", "b", "c", "d"]) {
      recent.record(request(seed), `"${seed}"`, true, now - 60_000);
    }

    assert.equal(recent.size, 3);
    assert.deepEqual(
      recent.list(now)
        .map((entry) => entry.request.seed)
        .sort(),
      ["b", "c", "d"],
    );
  });

  it("holds nothing at all when the window is zero", () => {
    const recent = new RecentRenders(0);
    recent.record(request("ada"), '"ada"', true, now);

    assert.equal(recent.enabled, false);
    assert.equal(recent.size, 0);
    assert.deepEqual(recent.list(now), []);
  });
});

describe("recentDates", () => {
  it("walks calendar days backwards across a month boundary", () => {
    assert.deepEqual(recentDates("2026-03-02", 4), ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("counts a leap day as a day", () => {
    assert.deepEqual(recentDates("2028-03-01", 2), ["2028-02-29", "2028-03-01"]);
  });
});

/**
 * The route is only a route when a token is configured, and `config` reads the
 * environment once at import, so the variable is set before the server module
 * is pulled in.
 */
const TOKEN = "s".repeat(32);
process.env.STATS_TOKEN = TOKEN;
process.env.STATS_TIMEZONE = "UTC";

const { createApp, holdsToken } = await import("../src/server.ts");
const { renderStatsPage } = await import("../src/http/stats-page.ts");

describe("holdsToken", () => {
  const request = (authorization?: string) =>
    ({ headers: authorization === undefined ? {} : { authorization } }) as IncomingMessage;
  const empty = new URLSearchParams();

  it("accepts a bearer header", () => {
    assert.equal(holdsToken(request(`Bearer ${TOKEN}`), empty, TOKEN), true);
  });

  it("accepts the query parameter a browser can carry", () => {
    assert.equal(holdsToken(request(), new URLSearchParams({ token: TOKEN }), TOKEN), true);
  });

  it("rejects a wrong token, a missing one, and any token at all when none is set", () => {
    assert.equal(holdsToken(request(`Bearer ${"x".repeat(32)}`), empty, TOKEN), false);
    assert.equal(holdsToken(request(), empty, TOKEN), false);
    assert.equal(holdsToken(request(), new URLSearchParams({ token: "" }), TOKEN), false);
    assert.equal(holdsToken(request(`Bearer ${TOKEN}`), empty, ""), false);
  });
});

describe("the stats route", () => {
  const server = createApp({ assets: new Map(), version: "test" });
  let origin = "";

  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => server.close());

  it("hides behind a 404 without the token", async () => {
    const res = await fetch(`${origin}/stats`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "not_found");

    const wrong = await fetch(`${origin}/stats?token=${"x".repeat(32)}`);
    assert.equal(wrong.status, 404);
  });

  it("serves the page to the token holder, and to nobody else's origin", async () => {
    const res = await fetch(`${origin}/stats?token=${TOKEN}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(res.headers.get("cache-control"), "no-store, private");
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");

    const html = await res.text();
    assert.match(html, /requests today/);
    assert.match(html, /<svg /);
    // The token opened the page; it must not then be written into it.
    assert.doesNotMatch(html, new RegExp(TOKEN));
  });

  it("serves the same numbers as json", async () => {
    await fetch(`${origin}/ada.svg`);
    const res = await fetch(`${origin}/stats.json`, { headers: { authorization: `Bearer ${TOKEN}` } });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      timezone: string;
      today: { total: number; hours: unknown[]; counts: { rendered: number } };
      days: unknown[];
    };
    assert.equal(body.timezone, "UTC");
    assert.equal(body.today.hours.length, 24);
    assert.equal(body.days.length, 30);
    assert.ok(body.today.counts.rendered >= 1, "the avatar request should have been counted as a render");
  });

  it("counts the outcomes apart", async () => {
    const before = await (
      await fetch(`${origin}/stats.json?token=${TOKEN}`)
    ).json() as { today: { counts: Record<string, number> } };

    const first = await fetch(`${origin}/grace.svg`);
    const etag = first.headers.get("etag") ?? "";
    await fetch(`${origin}/grace.svg`); // now in the render cache
    await fetch(`${origin}/grace.svg`, { headers: { "if-none-match": etag } });
    await fetch(`${origin}/grace.jpg`); // a format we do not serve

    const after = await (
      await fetch(`${origin}/stats.json?token=${TOKEN}`)
    ).json() as { today: { counts: Record<string, number> } };

    const delta = (key: string) => (after.today.counts[key] ?? 0) - (before.today.counts[key] ?? 0);
    assert.equal(delta("rendered"), 1);
    assert.equal(delta("cached"), 1);
    assert.equal(delta("revalidated"), 1);
    assert.equal(delta("rejected"), 1);
    // Reading the counters is not itself counted.
    assert.equal(delta("page"), 0);
  });
});

describe("the stats page", () => {
  const page = (stats: RequestStats, now: number, recent: RecentEntry[] = [], recentWindowMs = 2 * HOUR) =>
    renderStatsPage({ snapshot: stats.snapshot(now), recent, recentWindowMs, origin: "https://avatar.waldrand.dev" });

  it("draws a bar per hour that had traffic and says when nothing did", () => {
    const stats = new RequestStats("UTC");
    const now = at("2026-09-17T14:00:00Z");
    stats.record("rendered", now);

    const busy = page(stats, now);
    assert.match(busy, /14:00 · 1 request ·/);
    assert.doesNotMatch(busy, /nothing counted yet/, "today had a request, so the plot is not empty");

    assert.match(page(new RequestStats("UTC"), now), /nothing counted yet/);
  });

  it("escapes what it is given rather than trusting the zone name", () => {
    const stats = new RequestStats("UTC");
    const snapshot = { ...stats.snapshot(at("2026-09-17T14:00:00Z")), timezone: "<script>x</script>" };

    const html = renderStatsPage({ snapshot, recent: [], recentWindowMs: 0, origin: "https://avatar.waldrand.dev" });
    assert.doesNotMatch(html, /<script>x/);
  });

  it("draws each recent avatar into the page instead of linking it back", () => {
    const now = at("2026-09-17T14:00:00Z");
    const recent = new RecentRenders(2 * HOUR);
    recent.record(request("ada"), "\"ada\"", true, now - 30_000);
    recent.record(request("grace", "grid"), "\"grace\"", false, now - 4 * 60_000);

    const html = page(new RequestStats("UTC"), now, recent.list(now));

    assert.match(html, /Rendered in the last 2 hours/);
    assert.match(html, /ada/);
    assert.match(html, /grace/);
    assert.match(html, /4 min ago/);
    // The thumbnails are the markup itself, so nothing here points back at the
    // service - a linked image would be counted as a fresh request.
    assert.doesNotMatch(html, /<img/);
    assert.equal((html.match(/<svg /g) ?? []).length, 4, "two charts and two thumbnails");
  });

  it("says so when the window is empty, and leaves the section out when it is off", () => {
    const now = at("2026-09-17T14:00:00Z");
    assert.match(page(new RequestStats("UTC"), now, []), /Nothing yet/);

    const off = page(new RequestStats("UTC"), now, [], 0);
    assert.doesNotMatch(off, /Rendered in the last/);
    assert.match(off, /no seed is kept at all/);
  });

  it("escapes a seed rather than letting it write markup", () => {
    const now = at("2026-09-17T14:00:00Z");
    const recent = new RecentRenders(2 * HOUR);
    recent.record(request("<img src=x onerror=alert(1)>"), '"x"', true, now);

    const html = page(new RequestStats("UTC"), now, recent.list(now));
    // The seed may appear as text - escaped, it is inert - but never as a tag
    // or an attribute the browser would act on.
    assert.doesNotMatch(html, /<img/, "no tag the seed asked for");
    assert.doesNotMatch(html, /"[^"]*"\s+onerror/, "and no attribute broken out of");
    assert.match(html, /&#60;img src=x onerror/, "shown, but as characters rather than markup");
  });
});
