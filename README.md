<p align="left">
  <img src="site/public/assets/logo/svg/waldrand-mark.svg" width="64" height="64" alt="waldrand.dev">
</p>

# avatar.waldrand.dev

**[avatar.waldrand.dev](https://avatar.waldrand.dev)**

A keyless `GET` that turns any string into a stable, unique avatar.

```sh
curl "https://avatar.waldrand.dev/ada.svg?size=256&style=ridge"
```

No account, no token, nothing stored. The seed is hashed and the digest is the
only source of randomness a style may draw on, so the same seed renders the same
image on any machine, in any process, for as long as the style stands.

Node 22 · TypeScript · Astro + Tailwind for the docs · one Docker image.

## Run it

```sh
docker run --rm -p 8080:8080 ghcr.io/waldrand-dev/avatar.waldrand.dev
```

Then <http://localhost:8080> for the docs and
<http://localhost:8080/ada.svg> for an avatar. `compose.yaml` is the same thing
with the flags a public deployment wants.

## The surface

| Route | Returns |
| --- | --- |
| `GET /{seed}.svg` | `image/svg+xml` |
| `GET /{seed}.png` | `image/png` |
| `GET /{seed}.webp` | `image/webp` |
| `GET /healthz` | `application/json` |
| `GET /` | the docs page, English; `/de` for German |

| Parameter | Range | Default | |
| --- | --- | --- | --- |
| `seed` | any UTF-8, ≤256 chars | required | in the path |
| `size` | 16–1024 | 256 | ignored for SVG |
| `style` | `ridge` `grid` `initials` `rings` | `ridge` | |
| `radius` | 0–50 | 0 | percent of the edge; 50 is a circle |
| `bg` | hex, `none`, `auto` | `auto` | |

Anything else is JSON: `bad_seed`, `bad_param` and `unknown_format` are 400,
`method_not_allowed` is 405, `rate_limited` is 429. The body names the parameter
at fault.

## Styles

All four draw from one digest, and all four put the accent down exactly once —
which is what makes a wall of them look like one set rather than four.

- **ridge** — the waldrand mark, redrawn per seed: a near ridgeline, a far one
  behind it, and the threshold across at a height the seed picks. The default.
- **grid** — the classic identicon, a 5×5 field mirrored down the middle.
- **initials** — one or two letters off the seed on a tinted tile.
- **rings** — concentric arcs, turned and broken. The one that still reads at 16px.

Adding a fifth is a file in `src/avatar/styles/` and a line in its `index.ts`.
Changing an existing one changes every avatar that was ever rendered from it, so
don't — add.

## Determinism

`src/avatar/rng.ts` is the whole of the promise. SHA-256 of `style:seed` gives
32 bytes; running out hashes the last block with a counter, so the stream is
unbounded and still a pure function of the seed. Nothing in `src/avatar/` reads
the clock, the filesystem or a counter.

That is also what makes the caching honest: a rendered avatar carries a strong
`ETag` and `Cache-Control: public, max-age=2592000, immutable`, because the bytes
for a URL genuinely cannot change.

## Layout

```
src/index.ts          boot: load assets, listen, drain on SIGTERM
src/server.ts         routing, headers, conditional requests
src/config.ts         every environment variable, read once
src/avatar/rng.ts     the seed to a byte stream
src/avatar/palette.ts the byte stream to colour
src/avatar/styles/    one file per style
src/avatar/render.ts  the SVG, and the ETag over its inputs
src/avatar/raster.ts  SVG to PNG or WebP, through libvips
src/http/ratelimit.ts a token bucket per IP, charged for renders only
src/http/render-cache.ts rendered avatars by ETag, bounded by bytes
src/http/static.ts    the docs, read into memory at boot
site/                 the docs page: Astro, Tailwind, two prerendered languages
```

The service serves its own docs. `astro build` writes `public/`, and
`src/http/static.ts` reads that directory into memory once at startup — there is
no second process and no path from a request into the filesystem.

## Develop

```sh
npm install && npm install --prefix site
npm run dev         # builds the docs, then watches the server on :8080
npm test
npm run typecheck
npm run build       # docs into public/, server into dist/
```

`npm run --prefix site dev` gives the Astro dev server with hot reload, but the
avatars in it 404 — it is not the service. Run `npm run dev` from the root to
see the page as it is served.

## Configuration

Every variable and its default is in [.env.example](.env.example). These are
worth knowing about:

- **`TRUST_PROXY_HOPS`** — 0 by default, which uses the socket address and
  ignores `X-Forwarded-For` entirely. Set it to the number of proxies actually
  in front of the container. Setting it higher than that lets a caller forge
  their way past the rate limit.
- **`RATE_LIMIT_PER_MINUTE`** — 60. The bucket is held in this process's memory,
  so two replicas mean two buckets. Behind more than one, either limit at the
  gateway or accept that the real ceiling is 60 × replicas.
- **`RATE_LIMIT_BURST`** — 0, meaning four minutes' worth (240). A page showing
  80+ distinct avatars is one burst on first load; a bucket only a minute deep
  would 429 its tail.
- **`RENDER_CACHE_MB`** — 32. Rendered avatars kept in memory by ETag. Only
  renders spend a token: a cache hit or a 304 reports the bucket but does not
  draw from it, so repeat views of the same page never approach the limit.

## Deploy

The image is the deployment. It needs no volume, no database and no writable
filesystem — `compose.yaml` runs it `read_only` with all capabilities dropped.

```sh
docker compose up -d --build
```

The port is only exposed on the Docker network, not published on the host, so
put a TLS terminator on that network, point `avatar.waldrand.dev` at it, and set
`TRUST_PROXY_HOPS` to match. On Coolify that is the service's domain, given as
`https://avatar.waldrand.dev:8080` so Traefik knows which container port to use.

## Licence

MIT for the code. The name and the mark are not covered — see [LICENSE](LICENSE),
and [BRAND.md](site/public/assets/logo/BRAND.md) for how the mark may be used.
