# syntax=docker/dockerfile:1

# ── docs ──────────────────────────────────────────────────────────────────────
# Astro writes the docs page into `public/`, which the service reads at boot.
# It is built in its own stage so none of Astro, Tailwind or their dependency
# tree reaches the runtime image.
FROM node:22-bookworm-slim AS docs
WORKDIR /build

COPY package.json package-lock.json ./
COPY site/package.json site/package-lock.json ./site/
RUN npm ci --ignore-scripts && npm ci --ignore-scripts --prefix site

COPY scripts ./scripts
COPY site ./site
RUN node scripts/fonts.mjs && npm run --prefix site build

# The `initials` style renders text, and libvips reads fonts from the system
# rather than from the SVG - so the runtime image needs IBM Plex as an sfnt.
# Neither npm nor Debian ships one, so the woff2 the docs page already serves
# is decompressed back into the TrueType it was made from. One file, one face,
# and the page and the renderer cannot drift on to different cuts of it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends woff2 \
  && woff2_decompress site/public/assets/fonts/ibm-plex-sans-latin-600-normal.woff2 \
  && mv site/public/assets/fonts/ibm-plex-sans-latin-600-normal.ttf /IBMPlexSans-SemiBold.ttf \
  && rm -rf /var/lib/apt/lists/*

# ── server ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS server
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

# DejaVu stands behind Plex in the stack: the Plex file is the latin subset the
# web page uses, so a seed in Greek or Cyrillic would otherwise render as empty
# boxes. fontconfig falls back per glyph, not per string, so latin initials
# still come out in Plex.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core fontconfig \
  && rm -rf /var/lib/apt/lists/*

COPY --from=docs /IBMPlexSans-SemiBold.ttf /usr/local/share/fonts/
RUN fc-cache -f

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=server /build/dist ./dist
COPY --from=docs /build/public ./public

# Node's own unprivileged user; nothing here writes to disk.
USER node

ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080

# No curl or wget in the image, so the check runs in the runtime that is there.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, so the process is PID 1 and gets Docker's SIGTERM directly.
CMD ["node", "dist/index.js"]
