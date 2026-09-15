import { n } from "../svg.ts";
import type { StyleContext, StyleDefinition } from "./types.ts";

/**
 * Concentric rings, some closed and some broken into an arc and turned. Reads
 * as a dial or a tree ring — quiet at small sizes, where the grid style starts
 * to look like static.
 */

const OUTER = 42;
const INNER = 12;

export const rings: StyleDefinition = {
  id: "rings",
  dark: true,
  draw(ctx) {
    const { rng, colors } = ctx;
    const count = rng.int(3, 5);
    const step = (OUTER - INNER) / (count - 1);

    // Exactly one ring is the accent, chosen before any are drawn so the
    // choice does not depend on how many bytes the widths happen to consume.
    const accentIndex = rng.int(0, count - 1);
    const parts: string[] = [];

    for (let i = 0; i < count; i += 1) {
      const radius = OUTER - step * i;
      const width = 3 + rng.unit() * 5;
      const circumference = 2 * Math.PI * radius;
      const broken = rng.chance(0.55);
      // A gap under a third keeps the ring reading as a ring; the rotation is
      // what makes two seeds with the same gap look unrelated.
      const gap = broken ? circumference * (0.12 + rng.unit() * 0.2) : 0;
      const rotation = rng.int(0, 359);
      const stroke = i === accentIndex ? colors.accent : colors.figure;

      parts.push(
        `<circle cx="50" cy="50" r="${n(radius)}" fill="none" stroke="${stroke}"` +
          ` stroke-width="${n(width)}"` +
          (broken ?
            ` stroke-dasharray="${n(circumference - gap)} ${n(gap)}" stroke-linecap="butt"` +
              ` transform="rotate(${rotation} 50 50)"`
          : "") +
          "/>",
      );
    }

    if (rng.chance(0.5)) {
      parts.push(`<circle cx="50" cy="50" r="${n(3 + rng.unit() * 3)}" fill="${colors.figure}"/>`);
    }

    return parts.join("");
  },
};
