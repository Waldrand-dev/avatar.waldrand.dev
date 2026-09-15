import { grid } from "./grid.ts";
import { initials } from "./initials.ts";
import { ridge } from "./ridge.ts";
import { rings } from "./rings.ts";
import type { StyleDefinition } from "./types.ts";

/** Declaration order is the order the docs list them in. */
export const STYLES = [ridge, grid, initials, rings] as const;

export const STYLE_IDS = STYLES.map((style) => style.id);

export const DEFAULT_STYLE = ridge.id;

const byId = new Map<string, StyleDefinition>(STYLES.map((style) => [style.id, style]));

export function findStyle(id: string): StyleDefinition | undefined {
  return byId.get(id);
}

export type { StyleDefinition };
