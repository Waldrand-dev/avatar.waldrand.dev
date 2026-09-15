import { de } from "./de.ts";
import { en, type Copy } from "./en.ts";

export type Lang = "en" | "de";

export const LANGS: readonly Lang[] = ["en", "de"];

const DICTS: Record<Lang, Copy> = { en, de };

export const copyFor = (lang: Lang): Copy => DICTS[lang];

/**
 * English is served from the root and German from `/de`, both prerendered.
 * The language switch is a link between two real pages rather than a script
 * that rewrites the one you are on, so the HTML is right before anything runs
 * and either language can be linked to directly.
 */
export const hrefFor = (lang: Lang, hash = ""): string =>
  (lang === "en" ? "/" : "/de/") + hash;

export const otherLang = (lang: Lang): Lang => (lang === "en" ? "de" : "en");

export type { Copy };
