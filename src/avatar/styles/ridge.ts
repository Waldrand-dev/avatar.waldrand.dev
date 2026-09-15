import { n, point } from "../svg.ts";
import type { StyleContext, StyleDefinition } from "./types.ts";

/**
 * The house style: the waldrand mark, redrawn for every seed.
 *
 * A near ridge and a far one behind it, then the threshold — the one accent
 * the brand allows — laid across at a height the seed chooses. The mark itself
 * is a member of this family, not an exception to it: four peaks, the line at
 * a little under half height.
 */

const LEFT = 12;
const RIGHT = 88;
const BASE = 80;

/** A ridge line as a closed polygon: up one side of each peak and down the other. */
function ridgePolygon(
  ctx: StyleContext,
  peaks: number,
  peakRange: readonly [number, number],
  valleyFloor: number,
): string {
  const { rng } = ctx;
  const vertices: string[] = [point(LEFT, BASE)];

  // 2n-1 alternating vertices: peak, valley, peak, … so the silhouette always
  // starts and ends on a summit and never trails off flat.
  const steps = peaks * 2 - 1;
  const span = (RIGHT - LEFT) / (steps + 1);

  for (let i = 0; i < steps; i += 1) {
    const isPeak = i % 2 === 0;
    // Jitter each x within its own slot so ridges never look metronomic, but
    // never far enough to cross its neighbour.
    const x = LEFT + span * (i + 1) + (rng.unit() - 0.5) * span * 0.7;
    const y =
      isPeak ?
        peakRange[0] + rng.unit() * (peakRange[1] - peakRange[0])
      : valleyFloor + rng.unit() * (BASE - valleyFloor) * 0.55;
    vertices.push(point(x, y));
  }

  vertices.push(point(RIGHT, BASE));
  return vertices.join(" ");
}

export const ridge: StyleDefinition = {
  id: "ridge",
  dark: true,
  draw(ctx) {
    const { rng, colors } = ctx;
    const peaks = rng.int(2, 5);

    // The far ridge is lower and blunter, so it reads as distance rather than
    // as a second subject competing with the near one.
    const far = ridgePolygon(ctx, peaks + rng.int(0, 1), [34, 52], 58);
    const near = ridgePolygon(ctx, peaks, [17, 40], 48);

    // The threshold sits in the upper half, clear of the base but never so
    // high it floats off the tile.
    const thresholdY = 30 + rng.unit() * 26;

    return [
      `<polygon points="${far}" fill="${colors.figureSoft}"/>`,
      `<polygon points="${near}" fill="${colors.figure}"/>`,
      `<rect x="${n(LEFT)}" y="${n(thresholdY)}" width="${n(RIGHT - LEFT)}" height="4.4" fill="${colors.accent}"/>`,
    ].join("");
  },
};
