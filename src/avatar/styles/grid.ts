import { n } from "../svg.ts";
import type { StyleContext, StyleDefinition } from "./types.ts";

/**
 * The classic identicon: a 5x5 field mirrored down the middle, so the result
 * reads as a face or a glyph rather than as noise. One filled cell carries the
 * accent, picked from the centre column where it can, so the mark stays single
 * even though the field is doubled.
 */

const CELLS = 5;
const PAD = 10;
const SIZE = (100 - PAD * 2) / CELLS;
const MIDDLE = (CELLS - 1) / 2;

/** Of the fifteen independent cells, how many may be set and still read well. */
const MIN_FILLED = 5;
const MAX_FILLED = 11;

export const grid: StyleDefinition = {
  id: "grid",
  dark: false,
  draw(ctx) {
    const { rng, colors } = ctx;

    // Only the left half plus the centre column is drawn from the stream; the
    // right half is its reflection.
    const half: boolean[][] = [];
    for (let row = 0; row < CELLS; row += 1) {
      const cols: boolean[] = [];
      for (let col = 0; col <= MIDDLE; col += 1) cols.push(rng.chance(0.5));
      half.push(cols);
    }

    // A field that came out nearly empty or nearly solid reads as neither a
    // face nor a fingerprint. Cells are flipped in a fixed order until the
    // count is back inside the legible band - each flip moves it one step
    // towards the band and never away, so this always stops.
    let weight = half.flat().filter(Boolean).length;
    for (let row = 0; row < CELLS && (weight < MIN_FILLED || weight > MAX_FILLED); row += 1) {
      for (let col = 0; col <= MIDDLE; col += 1) {
        if (weight < MIN_FILLED && !half[row]![col]!) {
          half[row]![col] = true;
          weight += 1;
        } else if (weight > MAX_FILLED && half[row]![col]!) {
          half[row]![col] = false;
          weight -= 1;
        }
      }
    }

    const filled: Array<{ row: number; col: number }> = [];
    for (let row = 0; row < CELLS; row += 1) {
      for (let col = 0; col <= MIDDLE; col += 1) {
        if (half[row]![col]!) filled.push({ row, col });
      }
    }

    // Prefer the centre column: an accent there appears once. Anywhere else it
    // is mirrored, which is two marks, so it is only the fallback.
    const centre = filled.filter((cell) => cell.col === MIDDLE);
    const accentCell = (centre.length > 0 ? centre : filled).length > 0 ?
        rng.pick(centre.length > 0 ? centre : filled)
      : null;

    const rects: string[] = [];
    for (const { row, col } of filled) {
      const isAccent = accentCell !== null && accentCell.row === row && accentCell.col === col;
      const fill = isAccent ? colors.accent : colors.figure;
      const y = PAD + row * SIZE;
      rects.push(
        `<rect x="${n(PAD + col * SIZE)}" y="${n(y)}" width="${n(SIZE)}" height="${n(SIZE)}" fill="${fill}"/>`,
      );
      if (col !== MIDDLE) {
        const mirrored = CELLS - 1 - col;
        rects.push(
          `<rect x="${n(PAD + mirrored * SIZE)}" y="${n(y)}" width="${n(SIZE)}" height="${n(SIZE)}" fill="${fill}"/>`,
        );
      }
    }

    return rects.join("");
  },
};
