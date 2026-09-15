/** Small helpers shared by the styles. Everything draws in a 0 0 100 100 box. */

/** Two decimals is under half a pixel at 1024, and keeps the markup short. */
export const n = (value: number): string =>
  (Math.round(value * 100) / 100).toString();

export const point = (x: number, y: number): string => `${n(x)},${n(y)}`;

/** Escapes the five characters that cannot sit in XML text or an attribute. */
export function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
}
