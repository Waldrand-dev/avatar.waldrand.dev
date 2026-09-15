import type { Palette } from "../palette.ts";
import type { SeedStream } from "../rng.ts";

export interface StyleContext {
  readonly rng: SeedStream;
  readonly colors: Palette;
  readonly seed: string;
}

export interface StyleDefinition {
  readonly id: string;
  /** Whether the style's default ground is the dark end of the palette. */
  readonly dark: boolean;
  /** Returns the markup that goes inside the root `<svg>`, ground excluded. */
  readonly draw: (ctx: StyleContext) => string;
}
