/**
 * The stats page: one HTML document, rendered here, with the charts as inline
 * SVG.
 *
 * No script, no fetch, no chart library - the numbers are known at the moment
 * the page is written, so the bars are drawn as geometry and the document is
 * the whole thing. It wears waldrand.dev's dark tokens, but it does not share
 * the docs' stylesheet: this page has to be legible from a phone on a train
 * with nothing else loaded.
 */

import { OUTCOMES, type Counts, type Snapshot } from "./stats.ts";

const NUMBER = new Intl.NumberFormat("en-US");

/** What each outcome is called in the open, and what it actually means. */
const LABELS: Record<keyof Counts, { readonly name: string; readonly note: string }> = {
  rendered: { name: "Rendered", note: "reached the renderer" },
  cached: { name: "Cache hits", note: "served from the render cache" },
  revalidated: { name: "Revalidated", note: "304, the caller already had it" },
  limited: { name: "Rate limited", note: "429" },
  rejected: { name: "Rejected", note: "bad seed, parameter or method" },
  page: { name: "Docs & assets", note: "the docs page, its assets, health checks" },
};

const COLORS = {
  surface: "#12100e",
  raised: "#17140f",
  hairline: "#2a251e",
  accent: "#e8552f",
  fg: "#efece4",
  dim: "#a8a196",
  faint: "#6e675d",
} as const;

const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * A round number at or above the highest bar, so the top gridline is one a
 * reader can hold: 1, 2, 2.5 or 5 times a power of ten.
 */
function niceCeiling(peak: number): number {
  if (peak <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= peak) return step * magnitude;
  }
  return 10 * magnitude;
}

/** A column with a 4px rounded cap and square feet on the baseline. */
function columnPath(x: number, y: number, width: number, height: number): string {
  const radius = Math.min(4, width / 2, height);
  const bottom = y + height;
  return (
    `M${x} ${bottom}V${y + radius}` +
    `a${radius} ${radius} 0 0 1 ${radius} ${-radius}` +
    `h${width - radius * 2}` +
    `a${radius} ${radius} 0 0 1 ${radius} ${radius}` +
    `V${bottom}Z`
  );
}

interface Column {
  /** Axis label, or "" for a slot the axis leaves unlabelled. */
  readonly label: string;
  /** What the hover text calls this column. */
  readonly title: string;
  readonly total: number;
  readonly counts: Counts;
}

/**
 * One column chart: bars in the accent, three recessive gridlines, the peak
 * labelled on its cap and every column's breakdown on hover.
 *
 * A single series carries no legend - the heading above it already says what
 * is plotted - and only the peak gets a printed value, because a number over
 * every bar is read by nobody.
 */
function columnChart(columns: readonly Column[], caption: string): string {
  const width = 720;
  const height = 196;
  const pad = { top: 18, right: 6, bottom: 22, left: 46 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const peak = Math.max(...columns.map((column) => column.total));
  const ceiling = niceCeiling(peak);
  const band = plotWidth / columns.length;
  // Never the whole slot: the leftover is what keeps thirty columns from
  // reading as one solid block. Capped at 24px however wide the band gets.
  const barWidth = Math.max(2, Math.min(24, band * 0.7));
  const baseline = pad.top + plotHeight;
  const peakIndex = columns.findIndex((column) => column.total === peak);

  const gridlines = [0, 0.5, 1]
    .map((fraction) => {
      const y = pad.top + plotHeight * (1 - fraction);
      const value = NUMBER.format(Math.round(ceiling * fraction));
      return (
        `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="${COLORS.hairline}" stroke-width="1" />` +
        `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${COLORS.faint}" style="font-variant-numeric:tabular-nums">${value}</text>`
      );
    })
    .join("");

  const bars = columns
    .map((column, index) => {
      const x = pad.left + band * index + (band - barWidth) / 2;
      const breakdown = OUTCOMES.filter((outcome) => column.counts[outcome] > 0)
        .map((outcome) => `${NUMBER.format(column.counts[outcome])} ${LABELS[outcome].name.toLowerCase()}`)
        .join(", ");
      const hover = escape(
        `${column.title} · ${NUMBER.format(column.total)} request${column.total === 1 ? "" : "s"}` +
          (breakdown === "" ? "" : ` · ${breakdown}`),
      );

      // Every column answers to the pointer, including an empty one: "nothing
      // happened in this hour" is an answer, and a hit target that vanishes
      // with the bar is a worse page.
      const target = `<rect x="${pad.left + band * index}" y="${pad.top}" width="${band}" height="${plotHeight}" fill="transparent"><title>${hover}</title></rect>`;
      if (column.total === 0) return target;

      const barHeight = Math.max(2, (column.total / ceiling) * plotHeight);
      const bar = `<path d="${columnPath(x, baseline - barHeight, barWidth, barHeight)}" fill="${COLORS.accent}" />`;
      const label =
        index === peakIndex && peak > 0 ?
          `<text x="${x + barWidth / 2}" y="${baseline - barHeight - 6}" text-anchor="middle" font-size="11" fill="${COLORS.dim}" style="font-variant-numeric:tabular-nums">${NUMBER.format(peak)}</text>`
        : "";

      return bar + label + target;
    })
    .join("");

  const ticks = columns
    .map((column, index) =>
      column.label === "" ? ""
      : `<text x="${pad.left + band * index + band / 2}" y="${height - 6}" text-anchor="middle" font-size="11" fill="${COLORS.faint}" style="font-variant-numeric:tabular-nums">${escape(column.label)}</text>`,
    )
    .join("");

  const empty =
    peak > 0 ? ""
    : `<text x="${pad.left + plotWidth / 2}" y="${pad.top + plotHeight / 2}" text-anchor="middle" font-size="12" fill="${COLORS.faint}">nothing counted yet</text>`;

  return (
    `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escape(caption)}" style="overflow:visible">` +
    `${gridlines}${empty}${bars}${ticks}` +
    `<line x1="${pad.left}" y1="${baseline}" x2="${width - pad.right}" y2="${baseline}" stroke="${COLORS.hairline}" stroke-width="1" />` +
    `</svg>`
  );
}

function tile(label: string, value: number, note: string): string {
  return (
    `<div class="tile">` +
    `<div class="tile-label">${escape(label)}</div>` +
    `<div class="tile-value">${NUMBER.format(value)}</div>` +
    `<div class="tile-note">${escape(note)}</div>` +
    `</div>`
  );
}

/** The numbers again, as a table: the chart is a picture, this is the record. */
function table(snapshot: Snapshot): string {
  const head =
    `<tr><th scope="col">Day</th><th scope="col">Total</th>` +
    OUTCOMES.map((outcome) => `<th scope="col">${escape(LABELS[outcome].name)}</th>`).join("") +
    `</tr>`;

  const rows = [...snapshot.days]
    .reverse()
    .map(
      (day) =>
        `<tr><th scope="row">${escape(day.date)}</th><td>${NUMBER.format(day.total)}</td>` +
        OUTCOMES.map((outcome) => `<td>${NUMBER.format(day.counts[outcome])}</td>`).join("") +
        `</tr>`,
    )
    .join("");

  return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

const STYLE = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 32px 16px 64px;
  background: ${COLORS.surface}; color: ${COLORS.fg};
  font-family: "IBM Plex Sans", system-ui, -apple-system, sans-serif;
  line-height: 1.5; -webkit-font-smoothing: antialiased;
}
main { max-width: 860px; margin: 0 auto; }
h1 { font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: ${COLORS.dim}; margin: 0; }
h2 { font-size: 13px; font-weight: 600; margin: 0 0 2px; }
.sub { font-size: 12px; color: ${COLORS.faint}; margin: 4px 0 0; }
.hero { font-size: 56px; line-height: 1.05; font-weight: 600; margin: 20px 0 2px; }
.hero-note { font-size: 13px; color: ${COLORS.dim}; margin: 0 0 32px; }
.tiles { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); margin-bottom: 36px; }
.tile { background: ${COLORS.raised}; border: 1px solid ${COLORS.hairline}; border-radius: 6px; padding: 12px 14px; }
.tile-label { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: ${COLORS.dim}; }
.tile-value { font-size: 24px; font-weight: 600; margin: 2px 0 1px; }
.tile-note { font-size: 11px; color: ${COLORS.faint}; }
section { margin-bottom: 36px; }
.plot { margin-top: 14px; }
details { border-top: 1px solid ${COLORS.hairline}; padding-top: 14px; }
summary { font-size: 13px; color: ${COLORS.dim}; cursor: pointer; }
table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 5px 8px; border-bottom: 1px solid ${COLORS.hairline}; white-space: nowrap; }
thead th { color: ${COLORS.dim}; font-weight: 500; }
tbody th { text-align: left; font-weight: 400; color: ${COLORS.dim}; font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace; }
footer { margin-top: 40px; font-size: 12px; color: ${COLORS.faint}; }
footer p { margin: 0 0 6px; }
code { font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace; color: ${COLORS.dim}; }
@media (max-width: 520px) { .hero { font-size: 42px; } body { padding-top: 24px; } }
`;

/** The whole document, ready to send. */
export function renderStatsPage(snapshot: Snapshot, origin: string): string {
  const { today, days } = snapshot;

  const hourColumns: Column[] = today.hours.map((point) => ({
    label: point.hour % 3 === 0 ? String(point.hour).padStart(2, "0") : "",
    title: `${String(point.hour).padStart(2, "0")}:00`,
    total: point.total,
    counts: point.counts,
  }));

  const dayColumns: Column[] = days.map((day, index) => ({
    // Five labels across a month: enough to place a bar, few enough to read.
    label: index === days.length - 1 || (days.length - 1 - index) % 7 === 0 ? day.date.slice(5) : "",
    title: day.date,
    total: day.total,
    counts: day.counts,
  }));

  const monthTotal = days.reduce((running, day) => running + day.total, 0);
  const peak = Math.max(0, ...days.map((day) => day.total));
  const busiest = days.find((day) => day.total === peak) ?? { date: today.date, total: 0 };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Requests · avatar.waldrand.dev</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>${escape(new URL(origin).host)} · requests</h1>
  <p class="sub">${escape(today.date)} · all times ${escape(snapshot.timezone)} · read at ${escape(snapshot.generatedAt.slice(11, 16))} UTC</p>

  <p class="hero">${NUMBER.format(today.total)}</p>
  <p class="hero-note">requests today${today.total === 0 ? " so far" : ""}</p>

  <div class="tiles">
    ${OUTCOMES.map((outcome) => tile(LABELS[outcome].name, today.counts[outcome], LABELS[outcome].note)).join("\n    ")}
  </div>

  <section>
    <h2>Today, by hour</h2>
    <p class="sub">Every request, whether or not it reached the renderer.</p>
    <div class="plot">${columnChart(hourColumns, `Requests per hour on ${today.date}, ${snapshot.timezone}`)}</div>
  </section>

  <section>
    <h2>Last ${days.length} days</h2>
    <p class="sub">${NUMBER.format(monthTotal)} in total${busiest.total === 0 ? "" : ` · busiest was ${escape(busiest.date)} with ${NUMBER.format(busiest.total)}`}.</p>
    <div class="plot">${columnChart(dayColumns, `Requests per day over the last ${days.length} days`)}</div>
  </section>

  <details>
    <summary>The same numbers as a table</summary>
    ${table(snapshot)}
  </details>

  <footer>
    <p>Counters live in the container's memory: a restart or redeploy starts the day at zero, and a second replica would count only its own share. Nothing about a caller is recorded - no addresses, no seeds, no paths, only these totals.</p>
    <p>Machine-readable: <code>/stats.json</code>, same token.</p>
  </footer>
</main>
</body>
</html>
`;
}
