import { createHash } from "node:crypto";

import type { AvatarRequest } from "./params.ts";
import { palette } from "./palette.ts";
import { SeedStream } from "./rng.ts";
import { findStyle } from "./styles/index.ts";
import { escapeXml, n } from "./svg.ts";

/**
 * Nothing here touches the clock, the filesystem or a counter: a request is a
 * pure function of its parameters. That is the whole promise the service makes,
 * and it is also what makes the ETag below safe to hand out for a year.
 */

export const VIEW_BOX = 100;

export function renderSvg(request: AvatarRequest): string {
  const style = findStyle(request.style);
  if (!style) throw new Error(`unregistered style ${request.style}`);

  // The style is part of the stream key, so `?style=grid` is not the same
  // drawing as `?style=ridge` wearing different clothes.
  const rng = new SeedStream(`${request.style}:${request.seed}`);
  const colors = palette(rng, style.dark);
  const figure = style.draw({ rng, colors, seed: request.seed });

  // `auto` hands the choice to the palette; an explicit `none` is the only way
  // to get a transparent tile.
  const ground = request.backgroundAuto ? colors.ground : request.background;

  // Percent of the edge, as the parameter is documented; 50 lands on a circle.
  const rx = (request.radius / 100) * VIEW_BOX;
  const rounded = rx > 0;

  // The ground already carries the corner, but a figure can reach past it -
  // grid cells at radius=50, for one - so anything but a square tile is
  // clipped rather than trusted to stay inside.
  const clip =
    rounded ?
      `<defs><clipPath id="r"><rect width="${VIEW_BOX}" height="${VIEW_BOX}" rx="${n(rx)}" ry="${n(rx)}"/></clipPath></defs>`
    : "";

  const tile =
    ground === null ?
      ""
    : `<rect width="${VIEW_BOX}" height="${VIEW_BOX}"${rounded ? ` rx="${n(rx)}" ry="${n(rx)}"` : ""} fill="${ground}"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${request.size}" height="${request.size}"` +
    ` viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX}" role="img" aria-label="Identicon for ${escapeXml(request.seed)}">` +
    `<title>${escapeXml(request.seed)}</title>` +
    clip +
    tile +
    (rounded ? `<g clip-path="url(#r)">${figure}</g>` : figure) +
    "</svg>"
  );
}

/**
 * A strong ETag over everything that can change a byte of the response.
 *
 * The parts are length-prefixed rather than joined with a separator, so no
 * seed can impersonate another by containing the separator itself. Size is in
 * it even for SVG, where it only moves two attributes, because the body still
 * differs.
 */
export function etagFor(request: AvatarRequest): string {
  const parts: string[] = [
    request.seed,
    request.style,
    request.format,
    String(request.size),
    String(request.radius),
    request.backgroundAuto ? "auto" : (request.background ?? "none"),
  ];
  const canonical = parts.map((part) => `${part.length}:${part}`).join("");

  return `"${createHash("sha256").update(canonical, "utf8").digest("base64url").slice(0, 22)}"`;
}
