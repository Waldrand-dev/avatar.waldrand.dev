import { config } from "../config.ts";
import { DEFAULT_STYLE, STYLE_IDS, findStyle } from "./styles/index.ts";

export const FORMATS = ["svg", "png", "webp"] as const;
export type Format = (typeof FORMATS)[number];

export const SIZE_MIN = 16;
export const SIZE_MAX = 1024;
export const SIZE_DEFAULT = 256;
export const RADIUS_MAX = 50;

/** A caller's mistake, carrying the machine-readable code the JSON body uses. */
export class ParamError extends Error {
  readonly code: string;
  readonly param: string;

  constructor(code: string, param: string, message: string) {
    super(message);
    this.name = "ParamError";
    this.code = code;
    this.param = param;
  }
}

export interface AvatarRequest {
  readonly seed: string;
  readonly format: Format;
  readonly size: number;
  readonly style: string;
  /** Corner rounding in percent of the edge, 0-50. 50 is a circle. */
  readonly radius: number;
  /** `#rrggbb`, or null for a transparent ground. */
  readonly background: string | null;
  /** True when the caller said nothing and the style picks its own ground. */
  readonly backgroundAuto: boolean;
}

const isFormat = (value: string): value is Format =>
  (FORMATS as readonly string[]).includes(value);

/** C0 controls and DEL. They cannot appear in a URL unencoded, so a seed
    that decodes to one was built by something that should not have. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Splits `ada-lovelace.svg` into a seed and a format.
 *
 * A seed is allowed to contain dots, so only a trailing segment that is one of
 * the known formats is treated as an extension - `ada.lovelace.png` is the
 * seed `ada.lovelace`. A trailing segment that looks like an extension but is
 * not a format we serve is an error rather than part of the seed, because the
 * alternative is silently returning an SVG to somebody who asked for `.jpg`.
 */
export function splitPath(pathname: string): { seed: string; format: Format } {
  const raw = pathname.replace(/^\/+/, "");
  const dot = raw.lastIndexOf(".");
  const tail = dot === -1 ? "" : raw.slice(dot + 1).toLowerCase();

  // A tail we can actually encode is always the extension, even with nothing
  // in front of it: `/.svg` is an empty seed somebody interpolated badly, and
  // it should say so rather than draw the literal string ".svg".
  if (isFormat(tail)) {
    return { seed: decodeSeed(raw.slice(0, dot)), format: tail };
  }

  // A short alphanumeric tail was an extension attempt at something we do not
  // produce. Anything longer - `ada.lovelace` - or shorter - `v1.2` - is just
  // part of the seed.
  if (dot > 0 && /^[a-z0-9]{2,5}$/.test(tail)) {
    throw new ParamError(
      "unknown_format",
      "format",
      `Unsupported format ".${tail}". Use ${FORMATS.map((f) => `.${f}`).join(", ")}.`,
    );
  }

  return { seed: decodeSeed(raw), format: "svg" };
}

function decodeSeed(raw: string): string {
  let seed: string;
  try {
    seed = decodeURIComponent(raw);
  } catch {
    throw new ParamError("bad_seed", "seed", "The seed is not valid percent-encoding.");
  }

  if (seed.length === 0) {
    throw new ParamError("bad_seed", "seed", "A seed is required: /{seed}.svg");
  }
  if (seed.length > config.maxSeedLength) {
    throw new ParamError(
      "bad_seed",
      "seed",
      `The seed is ${seed.length} characters; the limit is ${config.maxSeedLength}.`,
    );
  }
  if (CONTROL_CHARACTERS.test(seed)) {
    throw new ParamError("bad_seed", "seed", "The seed contains control characters.");
  }
  return seed;
}

function integer(
  params: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = params.get(name);
  if (raw === null || raw === "") return fallback;

  // `Number` on its own accepts "1e3", " 12 " and "0x10"; a URL parameter that
  // is meant to be an integer should look like one.
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new ParamError("bad_param", name, `${name} must be a whole number, got "${raw}".`);
  }
  const value = Number(raw.trim());
  if (value < min || value > max) {
    throw new ParamError(
      "bad_param",
      name,
      `${name} must be between ${min} and ${max}, got ${value}.`,
    );
  }
  return value;
}

/** `#e8552f`, `e8552f`, `#abc` and `abc` all parse; anything else is an error. */
export function parseHex(raw: string): string {
  const value = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(value)) {
    return `#${[...value].map((c) => c + c).join("")}`;
  }
  if (/^[0-9a-f]{6}$/.test(value)) {
    return `#${value}`;
  }
  throw new ParamError("bad_param", "bg", `bg must be a hex colour or "none", got "${raw}".`);
}

export function parseRequest(pathname: string, params: URLSearchParams): AvatarRequest {
  const { seed, format } = splitPath(pathname);

  const style = (params.get("style") || DEFAULT_STYLE).trim().toLowerCase();
  if (!findStyle(style)) {
    throw new ParamError(
      "bad_param",
      "style",
      `Unknown style "${style}". Known styles: ${STYLE_IDS.join(", ")}.`,
    );
  }

  const bg = params.get("bg");
  const auto = bg === null || bg === "" || bg.toLowerCase() === "auto";
  const background =
    auto || bg!.toLowerCase() === "none" ? null : parseHex(bg!);

  return {
    seed,
    format,
    size: integer(params, "size", SIZE_DEFAULT, SIZE_MIN, SIZE_MAX),
    style,
    radius: integer(params, "radius", 0, 0, RADIUS_MAX),
    background,
    backgroundAuto: auto,
  };
}
