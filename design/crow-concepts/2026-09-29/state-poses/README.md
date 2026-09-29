# Modular Crow state poses

Generated 29 September 2026 with OpenAI `gpt-image-2.5-sunburst` through the image edit endpoint, at high quality. The [brand guide](../../../BRAND.md) owns the identity. These are candidates. None is selected and none is used in the product.

## Why these poses

The demo has moments that the approved artwork cannot show: reading one source, comparing options, a challenged fact, missing evidence, paused motion and the next action. Each pose below answers one of those moments with the approved character.

| File                                                   | Pose                 | Intended use                        | Size        |
| ------------------------------------------------------ | -------------------- | ----------------------------------- | ----------- |
| [01-inspecting-v1.png](01-inspecting-v1.png)           | Inspecting           | Reading one source record           | 1024 × 1024 |
| [02-weighing-v1.png](02-weighing-v1.png)               | Weighing             | Comparing two options               | 1024 × 1024 |
| [03-challenging-v1.png](03-challenging-v1.png)         | Challenging          | A reviewer disputes a fact          | 1024 × 1024 |
| [04-unresolved-v1.png](04-unresolved-v1.png)           | Unresolved           | Missing evidence, empty states, 404 | 1024 × 1024 |
| [05-resting-v1.png](05-resting-v1.png)                 | Resting              | Motion paused                       | 1024 × 1024 |
| [06-pointing-v1.png](06-pointing-v1.png)               | Pointing             | The next action                     | 1024 × 1024 |
| [07-expressions-v1.png](07-expressions-v1.png)         | Expressions          | Six head studies                    | 1536 × 1024 |
| [08-size-ladder-v1.png](08-size-ladder-v1.png)         | Size ladder          | 16, 24 and 40 pixel grids           | 1536 × 1024 |
| [09-feather-in-beak-v1.png](09-feather-in-beak-v1.png) | Carrying a feather   | A new source was added              | 1024 × 1024 |
| [10-pair-v1.png](10-pair-v1.png)                       | Pair                 | Owner and reviewer                  | 1536 × 1024 |
| [11-runner-carrying-v1.png](11-runner-carrying-v1.png) | Runner with a record | Packet Runner delivering            | 1536 × 1024 |

The `web/` folder holds 512 pixel copies for the [brand system page](../../../decision-studio/brand/index.html). The full-size files are the masters.

## Reference images

Poses 01 to 10 used two references:

- `design/crow-concepts/2026-09-24/approved-runtime/modular-crow.png`
- `design/crow-concepts/2026-09-24/modular-crow/modular-packet-chalk-sage-oxide-v1.png`

Pose 11 used `approved-runtime/runner-glide.png` and the same specimen sheet. Only these approved brand images, already public in this repository, were sent to the image service.

## Review notes

- The character holds across all eleven: stepped crest, long beak, asymmetric chalk spectacles with one oxide terminal, three branch feathers, four-colour palette.
- The pixel grid is approximate. Pixel sizes vary slightly inside one image. A selected pose needs a redraw on a native grid before it becomes a production sprite.
- Backgrounds are opaque `#0C1010`, not transparent.
- 02 shows the two packets on the wing tips but they read as wing terminals. A revision should lift them clear of the feathers.
- 07 varies the eyes less than the prompt asked. Sceptical and neutral are close.
- 08 shows the smallest crow keeping the crest, beak, spectacles and one oxide square, which supports a small-size mark.
- Hex values in the prompts are targets. The rasters contain in-between shades.

## Exact prompts

Each prompt file in [`prompts/`](prompts/) holds the full text sent for that image. One attempt was made per pose. No image was edited after generation.
