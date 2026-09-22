# Crowbo wordmark study 01

Eight actual font specimens beside the selected Circuit Frames V3 Archivist. Open `index.html` from a local static server to compare fonts, case, background, preview size and letter spacing. All assets are included locally; the page makes no external requests. This is a design artifact, not a product implementation.

## Selected wordmark direction

The user selected **Geist Pixel Square, lowercase `crowbo`, with minimum letter spacing and plain lettering** on 2026-09-21. In this study, the minimum is **-0.04em**, or -4.4px at the default 110px preview size. The initial preview and Reset use this spacing. The other seven fonts remain available for comparison. This records the wordmark direction; the complete brand identity and final logo assets remain in development.

The user dropped both glow and shadow after comparing them. The wordmark uses ivory lettering on the dark background, with no effects or finish selector. Font files remain unchanged. The mascot and favicon were updated on 22 September to the selection owned by [the brand guide](../../BRAND.md).

## Design constants

- Crow ink: `#28243E`
- Mint: `#A4EDC3`
- Lemon: `#EEF34B`
- Midnight background: `#10101B`
- Warm ivory: `#F3E9D5`

These are the palette targets discussed in this design task. The generated raster reference includes shading and is not a flat-colour master.

The Archivist is framed with CSS from an unchanged copy of the selected Circuit Frames V3 PNG. The [brand guide](../../BRAND.md) owns its source, exact caption-excluding crop and favicon derivative. No source image or Epreuve file was edited. “Curious by nature” is specimen copy, not an approved tagline.

## Fonts and provenance

All eight fonts are distributed under SIL Open Font License 1.1. The original copyright and licence texts are included in `licenses/`. Fonts have not been modified. The initial shortlist is an editorial design judgment.

| # | Font | Specimen weight | Official source | Local file |
|---|---|---|---|---|
| 01 | Geist Pixel Square | 400 | [Vercel Geist](https://vercel.com/font) · [repository](https://github.com/vercel/geist-font) | `fonts/GeistPixel-Square.woff2` |
| 02 | Departure Mono | 400 | [Departure Mono](https://departuremono.com/) · [font licence](https://github.com/rektdeckard/departure-mono/blob/main/public/assets/LICENSE) | `fonts/DepartureMono-Regular.woff2` |
| 03 | Pixelify Sans | 600 | [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/pixelifysans) | `fonts/PixelifySans.ttf` |
| 04 | Jersey 10 | 400 | [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/jersey10) | `fonts/Jersey10-Regular.ttf` |
| 05 | IBM Plex Mono | 700 | [IBM Plex](https://github.com/IBM/plex) | `fonts/IBMPlexMono-Bold.ttf` |
| 06 | Google Sans Code | 600 | [Google Sans Code](https://github.com/googlefonts/googlesans-code) | `fonts/GoogleSansCode-Variable.woff2` |
| 07 | Space Grotesk | 700 | [Space Grotesk](https://github.com/floriankarsten/space-grotesk) | `fonts/SpaceGrotesk.ttf` |
| 08 | Bricolage Grotesque | 800 | [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) | `fonts/BricolageGrotesque.ttf` |

Geist Pixel Square and its licence were downloaded from the fixed `geist@1.7.2` package on jsDelivr. Pixelify Sans and Jersey 10 were downloaded from the Google Fonts repository on 2026-09-21. The other five font binaries and four accompanying licences were copied unchanged from the existing local Epreuve font asset directory; Departure Mono’s font licence was obtained from its official repository. The original Epreuve assets remain untouched. The Departure repository root licence applies to its website; this artifact includes the font’s separate OFL licence.

The original font files are bundled so this particular comparison remains stable even if upstream releases change. `SHA256SUMS.txt` records the font and image checksums. The official Departure Mono recommendation is to use sizes in multiples of 11px; this study’s default 110px preview and 44px desktop cards follow that recommendation. Responsive fitting can reduce the displayed size. No synthetic weights are used.

## Local preview

From this directory, run `python3 -m http.server 8765 --bind 127.0.0.1`, then open `http://127.0.0.1:8765/`. Stop the server with Ctrl-C. Serve this artifact directory only.

Font loads are checked before each specimen is enabled. A failed font is labelled unavailable rather than silently presented using a fallback. The page uses fixed local assets, native controls, bounded numeric adjustments and `textContent` for variable text.

## Verification

Checked in the Codex browser on 2026-09-21 at 1280px and 390px viewport widths: all eight font loads succeeded; choosing a specimen changed the hero font; uppercase, background, size, spacing and reset controls worked. The narrow-screen uppercase specimen at maximum size and spacing fitted its container after a fitting adjustment. No page-width overflow or browser warning/error logs were observed in the final check. `node --check study.js` passed. Font and image SHA-256 checks passed.

After removing all wordmark effects, the refreshed browser showed plain ivory Geist Pixel Square, lowercase `crowbo`, -0.04em spacing and no text shadow. Reset restores the adjustments while retaining the selected font. The finish selector and its code were removed. The JavaScript syntax check passed.

After the Circuit Frames V3 rollout on 22 September 2026, the selected mascot and favicon loaded at 1280px and 390px widths with no page overflow. All eight fonts loaded; choosing Departure Mono changed the preview, and Reset restored case, size, spacing and background while retaining the chosen font. The initial page selection remains Geist Pixel Square. The plain wordmark had no text shadow, the browser reported no warnings or errors, and the updated font/image checksum manifest passed.
