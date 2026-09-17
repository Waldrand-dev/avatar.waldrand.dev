/**
 * What was rendered lately, for the operator's own page.
 *
 * This is the one place the service holds on to a seed, and it does so for two
 * hours in memory - never on disk, never past a restart, and only when
 * `STATS_TOKEN` is set, so a container nobody is watching keeps nothing at all.
 * A seed can be somebody's user id, so the window is short by design and the
 * buffer is capped: past `maxEntries` the oldest go, however recent they are.
 *
 * Addresses are still not recorded. This says what was drawn, not who asked.
 */

import type { AvatarRequest } from "../avatar/params.ts";

interface Note {
  readonly at: number;
  readonly request: AvatarRequest;
  readonly etag: string;
  readonly fresh: boolean;
}

/** One avatar, with how often it went out inside the window. */
export interface RecentEntry {
  readonly request: AvatarRequest;
  readonly etag: string;
  /** Requests for this exact image inside the window. */
  readonly count: number;
  /** How many of those reached the renderer rather than the cache. */
  readonly rendered: number;
  /** Unix ms of the most recent one. */
  readonly lastAt: number;
}

export class RecentRenders {
  #notes: Note[] = [];
  readonly #windowMs: number;
  readonly #maxEntries: number;

  constructor(windowMs: number, maxEntries = 500) {
    this.#windowMs = windowMs;
    this.#maxEntries = maxEntries;
  }

  get enabled(): boolean {
    return this.#windowMs > 0 && this.#maxEntries > 0;
  }

  /** Notes one image going out. `fresh` is false when the cache answered. */
  record(request: AvatarRequest, etag: string, fresh: boolean, now: number = Date.now()): void {
    if (!this.enabled) return;

    this.#notes.push({ at: now, request, etag, fresh });
    this.#forget(now);
  }

  /**
   * The window's avatars, most recently seen first, one entry per distinct
   * image. Repeats become a count rather than another tile: fifty hits on the
   * same avatar are one thing that happened fifty times.
   */
  list(now: number = Date.now()): RecentEntry[] {
    this.#forget(now);

    const byEtag = new Map<string, RecentEntry>();
    for (const note of this.#notes) {
      const seen = byEtag.get(note.etag);
      byEtag.set(note.etag, {
        request: note.request,
        etag: note.etag,
        count: (seen?.count ?? 0) + 1,
        rendered: (seen?.rendered ?? 0) + (note.fresh ? 1 : 0),
        lastAt: note.at,
      });
    }

    return [...byEtag.values()].sort((a, b) => b.lastAt - a.lastAt);
  }

  /** How many requests the window is holding, before grouping. */
  get size(): number {
    return this.#notes.length;
  }

  get windowMs(): number {
    return this.#windowMs;
  }

  /**
   * Drops what has aged out, then what does not fit.
   *
   * The notes are in the order they arrived, so the expired ones are always a
   * prefix and a single scan finds where the window starts.
   */
  #forget(now: number): void {
    const cutoff = now - this.#windowMs;
    let first = 0;
    while (first < this.#notes.length && (this.#notes[first]?.at ?? 0) <= cutoff) first++;

    const overflow = Math.max(0, this.#notes.length - first - this.#maxEntries);
    if (first + overflow > 0) this.#notes = this.#notes.slice(first + overflow);
  }
}
