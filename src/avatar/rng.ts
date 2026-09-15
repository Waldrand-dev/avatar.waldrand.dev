import { createHash } from "node:crypto";

/**
 * The determinism guarantee lives here: a seed becomes a byte stream, and the
 * byte stream is the only source of randomness any style is allowed to use.
 *
 * SHA-256 of the seed gives the first 32 bytes. Running out of bytes hashes the
 * previous block with a counter appended, so the stream is unbounded and still
 * a pure function of the seed — the same seed renders the same image on any
 * machine, in any process, for as long as the styles stay put.
 */
export class SeedStream {
  #block: Buffer;
  #offset = 0;
  #counter = 0;
  readonly #seed: string;

  constructor(seed: string) {
    this.#seed = seed;
    this.#block = createHash("sha256").update(seed, "utf8").digest();
  }

  /** One byte, 0–255. */
  byte(): number {
    if (this.#offset >= this.#block.length) {
      this.#counter += 1;
      const next = createHash("sha256").update(this.#block);
      next.update(Buffer.from([this.#counter & 0xff, (this.#counter >> 8) & 0xff]));
      this.#block = next.digest();
      this.#offset = 0;
    }
    // Checked above: the offset is always in range by this point.
    return this.#block[this.#offset++]!;
  }

  /** An unsigned 16-bit integer — enough resolution for angles and percentages. */
  uint16(): number {
    return (this.byte() << 8) | this.byte();
  }

  /** A float in [0, 1). */
  unit(): number {
    return this.uint16() / 0x10000;
  }

  /**
   * An integer in [min, max]. Drawn from a 16-bit value by rejection so the
   * distribution stays flat — modulo would quietly favour the low end.
   */
  int(min: number, max: number): number {
    const span = max - min + 1;
    if (span <= 0) throw new RangeError(`empty range ${min}..${max}`);
    const limit = Math.floor(0x10000 / span) * span;
    let value = this.uint16();
    while (value >= limit) value = this.uint16();
    return min + (value % span);
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.unit() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("cannot pick from an empty list");
    return items[this.int(0, items.length - 1)]!;
  }

  /** The seed this stream was built from, for error messages and ETags. */
  get seed(): string {
    return this.#seed;
  }
}
