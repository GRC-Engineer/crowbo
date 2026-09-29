# Crowbo brand system sheet — 29 September 2026

One local page that lays out the identity as a system rather than as separate
studies: palette with jobs, the four typefaces and where each is allowed, the
label rule, the pixel icon set, the mascot family, the feather library, motion
rules, the honesty labels, and specimen components. It is the reference for
the de-generic pass applied to the website and Decision Studio on the same
date. [The brand guide](../../BRAND.md) remains the owner of every decision;
this sheet shows them together.

## Run

From the `design/` directory:

```sh
python3 -m http.server 8799 --bind 127.0.0.1 --directory design
```

Open <http://127.0.0.1:8799/brand-system/2026-09-29/>. The page reads the
licensed fonts from `typography/2026-09-21/fonts/` and the approved artwork
from `crow-concepts/2026-09-24/` and `homepage-mockups/2026-09-21/assets/`.
Nothing is fetched from the network. A short inline script draws the icon
sheet from the same rectangle data as `decision-studio/src/pixel-icons.tsx`;
keep the two lists in step when an icon changes.

## What the sheet decides

- **Palette jobs.** Chalk is for the thing to read, sage for context and
  infrastructure, oxide for the one action or the thing that changed, black
  for everything else. Charcoal is a shade plane, not an accent.
- **Type.** Geist Pixel Square only for the wordmark. Bricolage Grotesque for
  headings. Space Grotesk for reading everywhere, including the company
  homepage, which previously used a system serif. Departure Mono for labels,
  codes and terminal lines.
- **Label rule.** One uppercase monospace eyebrow per block, never smaller
  than 11px. Field labels inside a block are sentence case in the heading
  face. Keyboard hints and codes are never smaller than 11px.
- **Icons.** A pixel set drawn on a 16-unit grid from filled rectangles, so
  every glyph shares the stepped edges of the mascot and feathers. It replaces
  the Lucide stroke library in the studio.
- **Depth.** One border per layer. A card holds text buttons, not bordered
  buttons; a notice is a paragraph with a left rule, not a box in a box.

## Crow iteration brief (not executed)

The founder asked for further Modular Crow iterations generated with an image
model and refined in Claude Design. Neither was available in the session that
produced this sheet: the Claude Design connector was not authorised and no
image-model API key was present in the environment, so no image was generated
and no key was handled. The sheet records the brief so the run can happen
later under the [asset generation conventions](../../crow-concepts/2026-09-24/modular-crow/README.md):

1. **Poses to add.** Perched-reading (head down, glasses catching light),
   pointing-with-wing (for empty states), and a compact 24 × 24 head for
   inline use in labels.
2. **Prompt skeleton.** "Pixel-art crow, compact full body, stepped crest,
   long dark beak, expressive sage eyes behind chalk circuit-frame glasses,
   three branching wing feathers with connection endpoints, near-black body
   #171B1A, chalk #F5F3E8 highlights, sage #91AA9D eyes and circuits, sparse
   warm oxide #D18A66 terminals, broad pixel shapes, solid interior, crisp
   edges, transparent background, no caption, [pose]."
3. **Acceptance.** Same silhouette proportions as the approved specimen,
   oxide under ten percent of the artwork, chalk brightest on the glasses,
   readable at 48px. Record the exact prompt, model, date and chosen output in
   a dated README beside the PNGs, as the earlier generations do.

These are candidates until the founder selects them. The current approved
artwork is unchanged.
