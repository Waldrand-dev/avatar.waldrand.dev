/**
 * How many requests there were, held in this process's memory.
 *
 * One counter per hour per outcome, and nothing else: no addresses, no seeds,
 * no paths. A bucket cannot be turned back into who asked for what, which is
 * the point - the service stores nothing about its callers and this does not
 * change that.
 *
 * In-process means one container's view only, and a restart starts the day
 * over. Same trade as the rate limiter and the render cache: the numbers are
 * for the operator's own eyes, not billing.
 */

/** What became of a request. Every request lands in exactly one of these. */
export const OUTCOMES = ["rendered", "cached", "revalidated", "limited", "rejected", "page"] as const;

export type Outcome = (typeof OUTCOMES)[number];

export type Counts = Record<Outcome, number>;

/** Hourly buckets kept: 31 days, so a 30-day chart is always fully covered. */
const HOURS_KEPT = 24 * 31;

const HOUR_MS = 3_600_000;

/** How many days of totals a snapshot reports, today included. */
const DAYS_REPORTED = 30;

const zeroed = (): Counts => ({
  rendered: 0,
  cached: 0,
  revalidated: 0,
  limited: 0,
  rejected: 0,
  page: 0,
});

export const sum = (counts: Counts): number =>
  OUTCOMES.reduce((running, outcome) => running + counts[outcome], 0);

const addInto = (target: Counts, source: Counts): void => {
  for (const outcome of OUTCOMES) target[outcome] += source[outcome];
};

export interface HourPoint {
  /** Hour of the local day, 0-23. */
  readonly hour: number;
  readonly counts: Counts;
  readonly total: number;
}

export interface DayPoint {
  /** Local calendar day, `YYYY-MM-DD`. */
  readonly date: string;
  readonly counts: Counts;
  readonly total: number;
}

export interface Snapshot {
  /** The zone every date and hour below is expressed in. */
  readonly timezone: string;
  readonly generatedAt: string;
  readonly today: {
    readonly date: string;
    readonly counts: Counts;
    readonly total: number;
    /** Always 24 entries, midnight first. Hours yet to happen are zero. */
    readonly hours: readonly HourPoint[];
  };
  /** Oldest first, ending with today. Days before the process started are zero. */
  readonly days: readonly DayPoint[];
  /** How far back the counters go, for a page that wants to say so. */
  readonly window: { readonly hours: number; readonly days: number };
}

/**
 * A wall-clock day is what the operator means by "today", so buckets are
 * counted in absolute hours and only interpreted in a zone when read. That
 * keeps recording free of any calendar work, and a zone change at boot
 * re-reads the same buckets differently rather than corrupting them.
 */
export class RequestStats {
  readonly #hours = new Map<number, Counts>();
  readonly #timezone: string;
  readonly #zoned: Intl.DateTimeFormat;

  constructor(timezone = "UTC") {
    this.#timezone = timezone;
    // Throws on an unknown zone - the caller validates at boot, so by here it
    // is known good.
    this.#zoned = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
  }

  /** Counts one request. The hot path: a map lookup and an increment. */
  record(outcome: Outcome, now: number = Date.now()): void {
    const hour = Math.floor(now / HOUR_MS);
    let bucket = this.#hours.get(hour);

    if (bucket === undefined) {
      bucket = zeroed();
      this.#hours.set(hour, bucket);
      // Only on the turn of an hour, so the sweep costs nothing per request.
      for (const key of this.#hours.keys()) {
        if (key <= hour - HOURS_KEPT) this.#hours.delete(key);
      }
    }

    bucket[outcome] += 1;
  }

  /** Reads the counters as the page and the JSON both want them. */
  snapshot(now: number = Date.now()): Snapshot {
    const today = this.#localise(now).date;

    const hours: HourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      counts: zeroed(),
      total: 0,
    }));
    const byDate = new Map<string, Counts>();

    for (const [hour, counts] of this.#hours) {
      const at = this.#localise(hour * HOUR_MS);

      let day = byDate.get(at.date);
      if (day === undefined) byDate.set(at.date, (day = zeroed()));
      addInto(day, counts);

      // A zone that repeats an hour over a DST fall-back folds both into the
      // same column, which is what a reader of a 24-hour day expects.
      const column = hours[at.hour];
      if (at.date === today && column !== undefined) addInto(column.counts, counts);
    }

    const todayCounts = byDate.get(today) ?? zeroed();

    return {
      timezone: this.#timezone,
      generatedAt: new Date(now).toISOString(),
      today: {
        date: today,
        counts: todayCounts,
        total: sum(todayCounts),
        hours: hours.map((point) => ({ ...point, total: sum(point.counts) })),
      },
      days: recentDates(today, DAYS_REPORTED).map((date) => {
        const counts = byDate.get(date) ?? zeroed();
        return { date, counts, total: sum(counts) };
      }),
      window: { hours: HOURS_KEPT, days: HOURS_KEPT / 24 },
    };
  }

  /** Which local day and hour an instant fell in. */
  #localise(ms: number): { date: string; hour: number } {
    const parts = this.#zoned.formatToParts(new Date(ms));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value ?? "00";

    return {
      date: `${part("year")}-${part("month")}-${part("day")}`,
      hour: Number(part("hour")) % 24,
    };
  }
}

/**
 * The `count` calendar days ending at `last`, oldest first.
 *
 * Done as calendar arithmetic on the date itself rather than by subtracting
 * 24 hours repeatedly: a day a zone made 23 or 25 hours long is still one day
 * on the axis, and stepping in milliseconds would skip or repeat it.
 */
export function recentDates(last: string, count: number): string[] {
  const [year = 1970, month = 1, day = 1] = last.split("-").map(Number);
  const dates: string[] = [];

  for (let back = count - 1; back >= 0; back--) {
    const at = new Date(Date.UTC(year, month - 1, day - back));
    dates.push(at.toISOString().slice(0, 10));
  }

  return dates;
}
