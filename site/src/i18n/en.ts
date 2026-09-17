/**
 * The English copy, and the shape every other language has to satisfy.
 *
 * `Copy` is inferred from this object rather than declared, so a string added
 * here is a type error in `de.ts` until it is translated - the same trick the
 * waldrand.dev site uses, for the same reason.
 */
export const en = {
  meta: {
    title: "avatar.waldrand.dev — avatars & identicons",
    description:
      "A keyless GET that turns any string into a stable, unique avatar. SVG, PNG or WebP, four styles, nothing written down.",
    ogDescription: "A keyless GET that turns any string into a stable, unique avatar.",
    skip: "Skip to content",
    switchLabel: "Sprache auf Deutsch umstellen",
  },

  nav: {
    docs: "docs",
    status: "status",
    started: "Get started",
    reference: "Reference",
    other: "Other APIs",
    quickstart: "Quickstart",
    seeds: "Seeds & determinism",
    formats: "Formats",
    styles: "Styles",
    parameters: "Parameters",
    rateLimits: "Rate limits",
    errors: "Errors",
    allEndpoints: "All endpoints",
  },

  hero: {
    eyebrow: "Avatar API — v1 — stable",
    h1: "Avatars & identicons",
    lede:
      "Pass any string — a user id, an email hash, a commit sha — and get a stable, unique mark " +
      "back. Nothing is written to disk; the same seed always renders the same image.",
    request: "Request",
    copy: "copy",
    copied: "copied",
    previewAlt: "The avatar rendered for the seed ada",
  },

  seeds: {
    h2: "Seeds & determinism",
    p1:
      "The seed is everything between the leading slash and the file extension. It is hashed with " +
      "SHA-256, and the digest is the only source of randomness a style may draw on — so the mark " +
      "for a seed is fixed, on every machine, in every process, for as long as the style stands.",
    p2:
      "There is no database and no account. Two callers who send the same seed get the same bytes " +
      "without ever having met.",
    bullets: [
      "Any UTF-8 string up to 256 characters. Percent-encode anything a URL would otherwise read as structure — <code>/</code>, <code>?</code>, <code>#</code>.",
      "Seeds are case-sensitive: <code>Ada</code> and <code>ada</code> are two different people.",
      "Dots are fine. Only a trailing <code>.svg</code>, <code>.png</code> or <code>.webp</code> is read as a format, so <code>ada.lovelace.png</code> is the seed <code>ada.lovelace</code>.",
      "The style is part of the hash, so <code>?style=grid</code> is a different drawing, not the same one recoloured.",
    ],
    note:
      "Hash the identifier before sending it if it is personal. An email address in a URL is an " +
      "email address in every log and cache between you and here; its SHA-256 renders just as well.",
  },

  formats: {
    h2: "Formats",
    p:
      "The extension picks the encoder. SVG is the default and the cheapest — it is a few hundred " +
      "bytes of geometry that scales to any size, which is why <code>size</code> does nothing for it.",
    thPath: "Path",
    thType: "Content-Type",
    thNotes: "Notes",
    svg: "The default. Resolution-independent, around 400 bytes.",
    png: "Rasterised at <code>size</code>. Transparent where <code>bg=none</code>.",
    webp: "Same pixels, roughly a third of the bytes.",
  },

  styles: {
    h2: "Styles",
    p:
      "Four, and no plans for a fifth. Each one is a different way of turning the same digest into " +
      "a shape; the accent appears exactly once in every mark, which is what keeps a wall of them " +
      "looking like one set.",
    ridge: "The house mark, redrawn per seed: two ridgelines and the threshold. The default.",
    grid: "The classic identicon — a 5×5 field mirrored down the middle.",
    initials: "One or two letters off the seed on a tinted tile. The only readable style.",
    rings:
      "Concentric arcs, turned and broken. Holds together at 16px, where grid turns to static.",
  },

  svg: {
    p:
      "Returns <code>image/svg+xml</code>. The markup carries a <code>&lt;title&gt;</code> and an " +
      "<code>aria-label</code> holding the seed, so a screen reader announces something better " +
      "than “image”. There is no script and no external reference in it.",
    c1: "a 64px mark for a user id, rounded to a circle",
    c2: "drop it straight into HTML — no build step, no proxy",
  },

  png: {
    p:
      "Returns <code>image/png</code>, rasterised at <code>size</code>. Use it where SVG is not " +
      "welcome — email, OpenGraph cards, anything that ends up in a native image view. Swap the " +
      "extension for <code>.webp</code> to send a third of the bytes.",
    c1: "512px, transparent ground, saved to disk",
    c2: "same seed, same pixels, smaller file",
  },

  parameters: {
    h2: "Parameters",
    thName: "Name",
    thType: "Type",
    thDefault: "Default",
    thNotes: "Notes",
    required: "required",
    seed: "In the path. Any UTF-8 string up to 256 characters.",
    size: "Pixel edge length. Ignored for SVG.",
    style: "ridge · grid · initials · rings",
    radius: "Corner rounding in percent. 50 = circle.",
    bg: "Background fill, or <code>none</code> for transparent.",
  },

  rate: {
    h2: "Rate limits",
    label: "Rate limit — per IP",
    unit: "req / min",
    p:
      "The bucket holds four minutes’ worth, so a page of 200 avatars loads in one go; it refills at " +
      "one a second. Only fresh renders count: a <code>304</code> or an avatar already in the server’s " +
      "cache is free, and browser-cached images never reach us at all.",
    headers: "Response headers",
    epoch: "1738 (epoch s)",
    on429: "on 429 only",
    p2:
      "Every rendered avatar comes back with a strong <code>ETag</code> and " +
      "<code>Cache-Control: public, max-age=2592000, immutable</code>. A conditional request that " +
      "matches is answered with a 304 and costs you nothing to render.",
  },

  errors: {
    h2: "Errors",
    p:
      "The happy path is an image; everything else is JSON, because a caller holding an error " +
      "would rather parse it than read it.",
    thStatus: "Status",
    thCode: "Code",
    thWhen: "When",
    badSeed: "Empty, over 256 characters, or not valid percent-encoding.",
    badParam: "A parameter is out of range or not a known value. The body names which.",
    unknownFormat: "An extension other than .svg, .png or .webp.",
    method: "Anything but GET, HEAD or OPTIONS.",
    rateLimited: "Over the ceiling. <code>Retry-After</code> says how long.",
  },

  footer: {
    built: "built at the forest edge",
    source: "source",
    issues: "issues",
    brand: "brand",
    health: "health",
  },
};

/** Widened on purpose: German has to match the shape, not the wording. */
export type Copy = typeof en;
