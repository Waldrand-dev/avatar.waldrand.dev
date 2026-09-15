import type { ServerResponse } from "node:http";

/**
 * Every response leaves through here, so the headers that must be on all of
 * them - the sniffing guard, the CORS grant that makes the images usable from
 * a page on someone else's origin - are written in exactly one place.
 */

export type Headers = Record<string, string | number>;

const BASE: Headers = {
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

export function send(
  res: ServerResponse,
  status: number,
  headers: Headers,
  body: Buffer | string | null,
  headOnly = false,
): void {
  const payload = body === null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");

  res.writeHead(status, {
    ...BASE,
    ...headers,
    ...(payload === null ? {} : { "Content-Length": payload.byteLength }),
  });

  // A HEAD still advertises the length it would have sent; it just sends none.
  res.end(headOnly || payload === null ? undefined : payload);
}

export interface ProblemBody {
  readonly code: string;
  readonly message: string;
  readonly param?: string;
}

/**
 * Errors come back as JSON even though the happy path is an image: a caller
 * who gets a 400 is holding a string, and a string that parses beats one that
 * has to be read.
 */
export function sendProblem(
  res: ServerResponse,
  status: number,
  problem: ProblemBody,
  docsUrl: string,
  extra: Headers = {},
  headOnly = false,
): void {
  const body = JSON.stringify({ error: { status, ...problem }, docs: docsUrl }, null, 2) + "\n";
  send(
    res,
    status,
    { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
    body,
    headOnly,
  );
}
