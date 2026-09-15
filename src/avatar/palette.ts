import type { SeedStream } from "./rng.ts";

/** The brand constants, from public/assets/logo/colors.json. */
export const BRAND = {
  ink: "#12100E",
  paper: "#EFECE4",
  accent: "#E8552F",
  muted: "#A8A196",
} as const;

const hex = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n * 255)))
    .toString(16)
    .padStart(2, "0");

/** HSL to `#rrggbb`. Hue in degrees, saturation and lightness in percent. */
export function hsl(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = lig - c / 2;
  return `#${hex(r! + m)}${hex(g! + m)}${hex(b! + m)}`;
}

export interface Palette {
  /** The tile behind everything. */
  readonly ground: string;
  /** The figure — ridge, cells, rings, letters. */
  readonly figure: string;
  /** The figure again, stepped back: second ridges, inactive cells, faint rings. */
  readonly figureSoft: string;
  /** Always the brand accent. One mark per avatar, never more. */
  readonly accent: string;
  readonly hue: number;
}

/**
 * Colour is the loudest signal an identicon has, so it is drawn first and from
 * the widest part of the space: a full hue circle. Saturation and lightness
 * stay inside a narrow band either side of ink and paper, which is what keeps
 * two unrelated seeds looking like they came from the same house.
 *
 * `dark` picks which way round the tile runs — a dark ground with a light
 * figure, or the inverse.
 */
export function palette(rng: SeedStream, dark: boolean): Palette {
  const hue = rng.int(0, 359);
  // A touch more colour in the blues and greens, which read flatter than the
  // warm half of the circle at the same saturation.
  const cool = hue > 150 && hue < 290 ? 4 : 0;

  return dark ?
      {
        hue,
        ground: hsl(hue, 20 + cool, 9 + rng.int(0, 3)),
        figure: hsl(hue, 12 + cool, 90 + rng.int(0, 4)),
        figureSoft: hsl(hue, 16 + cool, 28 + rng.int(0, 10)),
        accent: BRAND.accent,
      }
    : {
        hue,
        ground: hsl(hue, 22 + cool, 91 + rng.int(0, 4)),
        figure: hsl(hue, 24 + cool, 10 + rng.int(0, 5)),
        figureSoft: hsl(hue, 14 + cool, 72 + rng.int(0, 6)),
        accent: BRAND.accent,
      };
}
