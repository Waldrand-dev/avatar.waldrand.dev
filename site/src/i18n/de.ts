import type { Copy } from "./en.ts";

/**
 * Typed against the English object, so a key added there fails this file until
 * it is translated. German cannot quietly fall behind.
 */
export const de: Copy = {
  meta: {
    title: "avatar.waldrand.dev — Avatare & Identicons",
    description:
      "Ein GET ohne Schlüssel, das aus jeder Zeichenkette einen festen, eindeutigen Avatar macht. SVG, PNG oder WebP, vier Stile, nichts gespeichert.",
    ogDescription:
      "Ein GET ohne Schlüssel, das aus jeder Zeichenkette einen festen, eindeutigen Avatar macht.",
    skip: "Zum Inhalt springen",
    switchLabel: "Switch language to English",
  },

  nav: {
    docs: "docs",
    status: "status",
    started: "Erste Schritte",
    reference: "Referenz",
    other: "Weitere APIs",
    quickstart: "Schnellstart",
    seeds: "Seeds & Determinismus",
    formats: "Formate",
    styles: "Stile",
    parameters: "Parameter",
    rateLimits: "Limits",
    errors: "Fehler",
    allEndpoints: "Alle Endpunkte",
  },

  hero: {
    eyebrow: "Avatar-API — v1 — stabil",
    h1: "Avatare & Identicons",
    lede:
      "Schick irgendeine Zeichenkette — eine Nutzer-ID, einen E-Mail-Hash, einen Commit-SHA — und " +
      "bekomm ein festes, eindeutiges Zeichen zurück. Nichts wird gespeichert; derselbe Seed ergibt " +
      "immer dasselbe Bild.",
    request: "Anfrage",
    copy: "kopieren",
    copied: "kopiert",
    previewAlt: "Der Avatar zum Seed „ada“",
  },

  seeds: {
    h2: "Seeds & Determinismus",
    p1:
      "Der Seed ist alles zwischen dem führenden Schrägstrich und der Dateiendung. Er wird mit " +
      "SHA-256 gehasht, und der Digest ist die einzige Zufallsquelle, aus der ein Stil schöpfen " +
      "darf — das Zeichen zu einem Seed liegt damit fest, auf jeder Maschine, in jedem Prozess, " +
      "solange der Stil steht.",
    p2:
      "Es gibt keine Datenbank und kein Konto. Zwei Aufrufer mit demselben Seed bekommen dieselben " +
      "Bytes, ohne sich je begegnet zu sein.",
    bullets: [
      "Beliebiger UTF-8-Text bis 256 Zeichen. Alles, was eine URL sonst als Struktur liest, prozentkodieren — <code>/</code>, <code>?</code>, <code>#</code>.",
      "Seeds unterscheiden Groß- und Kleinschreibung: <code>Ada</code> und <code>ada</code> sind zwei verschiedene Personen.",
      "Punkte sind erlaubt. Nur ein abschließendes <code>.svg</code>, <code>.png</code> oder <code>.webp</code> gilt als Format, <code>ada.lovelace.png</code> ist also der Seed <code>ada.lovelace</code>.",
      "Der Stil geht in den Hash ein, <code>?style=grid</code> ist also eine andere Zeichnung und nicht dieselbe in anderen Farben.",
    ],
    note:
      "Hash die Kennung vorher, wenn sie personenbezogen ist. Eine E-Mail-Adresse in einer URL " +
      "steht in jedem Log und jedem Cache dazwischen; ihr SHA-256 zeichnet sich genauso gut.",
  },

  formats: {
    h2: "Formate",
    p:
      "Die Endung wählt den Encoder. SVG ist die Vorgabe und das Günstigste — ein paar hundert " +
      "Bytes Geometrie, die auf jede Größe skalieren, weshalb <code>size</code> dort nichts tut.",
    thPath: "Pfad",
    thType: "Content-Type",
    thNotes: "Anmerkungen",
    svg: "Die Vorgabe. Auflösungsunabhängig, rund 400 Bytes.",
    png: "Gerastert auf <code>size</code>. Transparent bei <code>bg=none</code>.",
    webp: "Dieselben Pixel, etwa ein Drittel der Bytes.",
  },

  styles: {
    h2: "Stile",
    p:
      "Vier, und kein fünfter geplant. Jeder macht aus demselben Digest eine andere Form; der " +
      "Akzent taucht in jedem Zeichen genau einmal auf, und das hält eine ganze Wand davon zusammen.",
    ridge:
      "Das Hauszeichen, pro Seed neu gezeichnet: zwei Kammlinien und die Schwelle. Die Vorgabe.",
    grid: "Das klassische Identicon — ein 5×5-Feld, an der Mitte gespiegelt.",
    initials: "Ein oder zwei Buchstaben aus dem Seed auf getönter Kachel. Der einzige lesbare Stil.",
    rings:
      "Konzentrische Bögen, gedreht und aufgebrochen. Trägt noch bei 16px, wo grid zu Rauschen wird.",
  },

  svg: {
    p:
      "Liefert <code>image/svg+xml</code>. Das Markup trägt ein <code>&lt;title&gt;</code> und ein " +
      "<code>aria-label</code> mit dem Seed, ein Screenreader sagt also etwas Besseres als „Bild“. " +
      "Kein Skript, keine externe Referenz darin.",
    c1: "ein 64px-Zeichen für eine Nutzer-ID, rund geschnitten",
    c2: "direkt ins HTML — kein Build-Schritt, kein Proxy",
  },

  png: {
    p:
      "Liefert <code>image/png</code>, gerastert auf <code>size</code>. Für alles, wo SVG nicht " +
      "willkommen ist — E-Mail, OpenGraph-Karten, native Bildansichten. Endung auf " +
      "<code>.webp</code> tauschen, um ein Drittel der Bytes zu senden.",
    c1: "512px, transparenter Grund, auf die Platte",
    c2: "derselbe Seed, dieselben Pixel, kleinere Datei",
  },

  parameters: {
    h2: "Parameter",
    thName: "Name",
    thType: "Typ",
    thDefault: "Vorgabe",
    thNotes: "Anmerkungen",
    required: "erforderlich",
    seed: "Im Pfad. Beliebiger UTF-8-Text bis 256 Zeichen.",
    size: "Kantenlänge in Pixeln. Bei SVG ohne Wirkung.",
    style: "ridge · grid · initials · rings",
    radius: "Eckenrundung in Prozent. 50 = Kreis.",
    bg: "Hintergrundfüllung, oder <code>none</code> für transparent.",
  },

  rate: {
    h2: "Limits",
    label: "Limit — pro IP",
    unit: "Anfr. / Min.",
    p:
      "Der Eimer fasst vier Minuten, eine Seite mit 200 Avataren lädt also in einem Rutsch; er füllt " +
      "sich mit einer pro Sekunde nach. Es zählen nur frische Renderings: ein <code>304</code> oder ein " +
      "Avatar aus dem Server-Cache ist frei, und vom Browser gecachte Bilder erreichen uns gar nicht.",
    headers: "Antwort-Header",
    epoch: "1738 (Epoch s)",
    on429: "nur bei 429",
    p2:
      "Jeder gerenderte Avatar kommt mit einem starken <code>ETag</code> und " +
      "<code>Cache-Control: public, max-age=2592000, immutable</code> zurück. Eine bedingte " +
      "Anfrage, die trifft, wird mit 304 beantwortet und kostet dich kein Rendern.",
  },

  errors: {
    h2: "Fehler",
    p:
      "Der gute Fall ist ein Bild; alles andere ist JSON, weil ein Aufrufer mit einem Fehler in der " +
      "Hand ihn lieber parst als liest.",
    thStatus: "Status",
    thCode: "Code",
    thWhen: "Wann",
    badSeed: "Leer, über 256 Zeichen, oder keine gültige Prozentkodierung.",
    badParam:
      "Ein Parameter liegt außerhalb des Bereichs oder ist kein bekannter Wert. Der Body nennt welcher.",
    unknownFormat: "Eine andere Endung als .svg, .png oder .webp.",
    method: "Alles außer GET, HEAD oder OPTIONS.",
    rateLimited: "Über der Decke. <code>Retry-After</code> sagt, wie lange.",
  },

  footer: {
    built: "gebaut am Waldrand",
    source: "Quelltext",
    issues: "Issues",
    brand: "Marke",
    health: "Status",
  },
};
