import sharp from "sharp";

import type { Format } from "./params.ts";

/**
 * SVG to pixels, through libvips.
 *
 * The SVG already carries the requested width and height, so the rasteriser
 * renders at the target size rather than scaling up from a default - which is
 * what keeps a 1024px `ridge` crisp along its diagonals.
 */
export async function rasterize(
  svg: string,
  format: Exclude<Format, "svg">,
  size: number,
): Promise<Buffer> {
  const pipeline = sharp(Buffer.from(svg, "utf8"), { density: 96 }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  return format === "png" ?
      pipeline.png({ compressionLevel: 9, effort: 7 }).toBuffer()
    : pipeline.webp({ quality: 92, effort: 4 }).toBuffer();
}

/**
 * libvips keeps a decode cache we have no use for - every input is unique - and
 * left alone it sizes its thread pool to the whole host, which is the wrong
 * shape for a container with a CPU limit.
 */
export function configureSharp(): void {
  sharp.cache(false);
  const requested = Number(process.env.SHARP_CONCURRENCY);
  sharp.concurrency(Number.isInteger(requested) && requested > 0 ? requested : 2);
}
