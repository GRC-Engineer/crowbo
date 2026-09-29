# Modular Crow website assets

Generated 24 September 2026 with the built-in image model in edit mode. These are local homepage exports based on the selected four-colour Modular Crow specimen and the twelve existing feather designs. The [brand guide](../../../../BRAND.md) owns the identity decision.

## Assets

- [Modular Crow](crowbo-modular-homepage-v1.png): 1254 × 1254, standalone full-body character for the top-right masthead mascot and portrait fallback.
- [Favicon](crowbo-modular-favicon-v1.png): 1254 × 1254, simplified head with chalk frames, sage eyes and oxide terminal.
- [Topology feathers](crowbo-feathers-topology-modular-v1.png): 1536 × 1024, Spine, Branch, Mesh, Loop, Braid and Cluster.
- [Infrastructure feathers](crowbo-feathers-infrastructure-modular-v1.png): 1536 × 1024, Object, Column, Vector, Merge, Series and Shard.

Each runtime copy in `design/homepage-mockups/2026-09-21/assets/` is byte-identical to its source here. Existing concept sheets remain unchanged. The two feather sheets retain the six-tile composition so the homepage can reuse its established crops and card geometry.

These PNGs have dark backgrounds, not transparent production alpha. The homepage uses a matching background and lighten blending. Hex values in the prompts are design targets, not a claim that every raster pixel matches a token. Dedicated deck exports and Packet Runner slide variants remain pending the user's slide choices.

## Exact generation prompts

### mascot

Input: `/Users/ayoubfandi/Documents/crowbo/design/crow-concepts/2026-09-24/modular-crow/modular-packet-chalk-sage-oxide-v1.png`.

Output: `crowbo-modular-homepage-v1.png`.

```text
Use case: precise-object-edit. Extract and faithfully redraw ONLY the full-body Modular Crow on the LEFT of this supplied approved Crowbo specimen as a clean website asset.
Preserve its exact silhouette and simple chunky pixel scale: perched full body, stepped swept crest, long dark pointed beak facing right, curious sage eyes, asymmetric chalk-white circuit spectacles, one tiny oxide glasses terminal, and three branch-like wing feathers with sage paths ending in oxide squares. Both feet fully visible. Same black #171B1A body and charcoal #38413C planes. Preserve expression and proportions; do not return to the detailed Archivist, do not add feather texture or turn it into a cute baby.
One square canvas, uniform fully OPAQUE background #0C1010, no transparency. Crow alone, centred, comfortably filling about 82% of canvas height with even margins. The highest crest, beak tip, wing nodes and feet must all be inside the frame. No caption, palette, swatches, separate feather, Packet Runner, trail, frame or other object. Crisp flat square pixel clusters, clean edges, no gradients, glow, bloom, shadow, dither, matte outline or stray pixels. The whole character should remain readable at 140px tall on a dark web page.
```

### favicon

Input: `/Users/ayoubfandi/Documents/crowbo/design/crow-concepts/2026-09-24/modular-crow/modular-packet-chalk-sage-oxide-v1.png`.

Output: `crowbo-modular-favicon-v1.png`.

```text
Use case: precise-object-edit. Create a square favicon from ONLY the head of the approved Modular Crow on the LEFT of the supplied specimen. Preserve its chunky stepped crest, angular dark crow beak facing right, curious sage eyes and distinctive asymmetric CHALK WHITE circuit glasses. One tiny OXIDE square at the end of the right temple. This is the same selected character, simplified only enough for a favicon.
Composition: bold head silhouette fills 84% of a square with safe margins, no body, separate feather, labels, swatches or other birds. Uniform fully OPAQUE background #0C1010. Limited palette nearly black #171B1A, charcoal #38413C, sage #91AA9D, chalk #F5F3E8, oxide #D18A66. White spectacle frames are broad and eyes read at small size. Deliberate crisp coarse pixel art, around 32x32 apparent pixel grid scaled cleanly up. No transparency, glow, shadows, gradients, framing box, noisy fringes or decorative detail.
```

### topology

Input: `/Users/ayoubfandi/Documents/crowbo/design/homepage-mockups/2026-09-21/assets/crowbo-feathers-topology-v2.png`.

Output: `crowbo-feathers-topology-modular-v1.png`.

```text
Use case: precise-object-edit. Recolour this existing six-feather pixel-art sheet for the selected Crowbo brand. Preserve ALL six feather silhouettes, internal topology patterns, branch count, shape, scale, position, square pixel clusters, quill endpoints, row/column placement and exact printed captions. This is a palette replacement, not a redesign.
Keep the original 1536x1024 landscape canvas, exactly 3 columns x 2 rows with 512px tiles; preserve identical placements within those tiles so existing website crops remain valid.
Replace purple/violet plumage with NEUTRAL black #171B1A and charcoal #38413C feather planes with occasional #59645E highlights. Replace bright mint paths with muted SAGE #91AA9D. Replace yellow terminal squares with warm OXIDE #D18A66, keeping a few small chalk #F5F3E8 inset marks inside those squares. Keep captions chalk #F5F3E8. Flat uniformly OPAQUE background #0C1010, absolutely no transparency. No purple, blue, yellow or glow. Keep the crisp pixel silhouettes, same feather details, no new elements, no padding or crop changes.
The six captions must remain exactly SPINE, BRANCH, MESH, LOOP, BRAID, CLUSTER in their existing order.
```

### infrastructure

Input: `/Users/ayoubfandi/Documents/crowbo/design/homepage-mockups/2026-09-21/assets/crowbo-feathers-infrastructure-v1.png`.

Output: `crowbo-feathers-infrastructure-modular-v1.png`.

```text
Use case: precise-object-edit. Recolour this existing six-feather pixel-art sheet for the selected Crowbo brand. Preserve ALL six feather silhouettes, internal topology patterns, branch count, shape, scale, position, square pixel clusters, quill endpoints, row/column placement and exact printed captions. This is a palette replacement, not a redesign.
Keep the original 1536x1024 landscape canvas, exactly 3 columns x 2 rows with 512px tiles; preserve identical placements within those tiles so existing website crops remain valid.
Replace purple/violet plumage with NEUTRAL black #171B1A and charcoal #38413C feather planes with occasional #59645E highlights. Replace bright mint paths with muted SAGE #91AA9D. Replace yellow terminal squares with warm OXIDE #D18A66, keeping a few small chalk #F5F3E8 inset marks inside those squares. Keep captions chalk #F5F3E8. Flat uniformly OPAQUE background #0C1010, absolutely no transparency. No purple, blue, yellow or glow. Keep the crisp pixel silhouettes, same feather details, no new elements, no padding or crop changes.
The six captions must remain exactly OBJECT, COLUMN, VECTOR, MERGE, SERIES, SHARD in their existing order.
```
