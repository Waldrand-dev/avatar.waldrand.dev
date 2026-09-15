import { createHash } from "node:crypto";

import { escapeXml, n } from "../svg.ts";
import type { StyleContext, StyleDefinition } from "./types.ts";

/**
 * Letters off the seed on a tinted tile — the one style whose output a person
 * can read. The colour still comes from the hash, so two people called Ada get
 * different tiles.
 */

/**
 * The stack the container has fonts for, with the usual fallbacks behind it for
 * a browser rendering the SVG itself. DejaVu carries the glyphs the latin
 * subset of Plex does not.
 */
const FONT = "'IBM Plex Sans','DejaVu Sans','Helvetica Neue',Helvetica,Arial,sans-serif";

/**
 * `ada-lovelace` and `Ada Lovelace` both give AL; `waldrand` gives WA. A seed
 * with no letters or digits in it at all falls back to two characters of its
 * own hash, which is unlovely but never blank.
 */
export function initialsFor(seed: string): string {
  const words = seed.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  if (words.length >= 2) {
    const first = [...words[0]!][0] ?? "";
    const second = [...words[1]!][0] ?? "";
    return (first + second).toUpperCase();
  }

  if (words.length === 1) {
    return [...words[0]!].slice(0, 2).join("").toUpperCase();
  }

  return createHash("sha256").update(seed, "utf8").digest("hex").slice(0, 2).toUpperCase();
}

export const initials: StyleDefinition = {
  id: "initials",
  dark: true,
  draw(ctx) {
    const { colors, seed } = ctx;
    const letters = initialsFor(seed);
    const fontSize = letters.length > 1 ? 34 : 42;

    // `dominant-baseline` is read inconsistently by SVG rasterisers, so the
    // baseline is positioned by hand instead: the cap height of these faces is
    // close enough to 0.72em that half of it centres the line optically.
    const baseline = 50 + fontSize * 0.36;

    return [
      `<text x="50" y="${n(baseline)}" text-anchor="middle" font-family="${FONT}"` +
        ` font-size="${n(fontSize)}" font-weight="600" letter-spacing="-1" fill="${colors.figure}">` +
        `${escapeXml(letters)}</text>`,
      `<rect x="38" y="78" width="24" height="4" fill="${colors.accent}"/>`,
    ].join("");
  },
};
