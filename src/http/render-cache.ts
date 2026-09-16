/**
 * Rendered avatars, held in this process's memory and keyed by ETag.
 *
 * A request is a pure function of its parameters and the ETag covers every one
 * of them, so a hit is byte-for-byte the answer a fresh render would give. It
 * is also free to hand out, which is why the server does not charge a hit
 * against the rate limit: the ceiling is there to protect the renderer, and a
 * hit never reaches it.
 *
 * Bounded by total bytes; past that the least recently used entries go first.
 */

export class RenderCache {
  readonly #entries = new Map<string, Buffer>();
  readonly #maxBytes: number;
  #bytes = 0;

  constructor(maxBytes: number) {
    this.#maxBytes = maxBytes;
  }

  get(key: string): Buffer | undefined {
    const body = this.#entries.get(key);
    if (body === undefined) return undefined;
    // Re-insert so iteration order stays least-recently-used first.
    this.#entries.delete(key);
    this.#entries.set(key, body);
    return body;
  }

  set(key: string, body: Buffer): void {
    if (this.#maxBytes <= 0 || body.byteLength > this.#maxBytes) return;

    const previous = this.#entries.get(key);
    if (previous !== undefined) {
      this.#bytes -= previous.byteLength;
      this.#entries.delete(key);
    }

    while (this.#bytes + body.byteLength > this.#maxBytes) {
      const oldest = this.#entries.entries().next();
      if (oldest.done) break;
      this.#bytes -= oldest.value[1].byteLength;
      this.#entries.delete(oldest.value[0]);
    }

    this.#entries.set(key, body);
    this.#bytes += body.byteLength;
  }

  get size(): number {
    return this.#entries.size;
  }

  get bytes(): number {
    return this.#bytes;
  }
}
