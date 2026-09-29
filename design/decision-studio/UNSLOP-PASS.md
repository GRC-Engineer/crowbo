# Decision Studio: 29 September unslop pass

This pass removes generic, machine-made patterns from the public landing page and the `/demo/` study, and writes the rules that replace them into code. The [brand guide](../BRAND.md) owns the identity. The [brand system page](brand/index.html) shows the rules in use.

Scope is the website source in this folder, the generated `site/` output and the design documents. Product documents under `docs/` belong to the backend owner and were read, not edited.

## Plan

Written before any code changed, as [AGENTS.md](../../AGENTS.md) requires.

1. Audit the rendered pages and the stylesheets. Count the patterns instead of judging by eye.
2. Put the palette, shape and shadow rules in one token file.
3. Rewrite the stylesheets against those tokens with a script a reviewer can rerun.
4. Replace the stock icon library with a pixel icon set drawn on the brand grid.
5. Fix the copy that reads as filler.
6. Add a test that fails when a stylesheet drifts from the tokens.
7. Generate crow state poses as candidates. Record every prompt. Wire none of them into the product until they are selected.
8. Build the brand system page from the same tokens and icons.
9. Rebuild `site/`, run the tests and check every changed view in a browser.

### Security considerations

| Consideration                                                                                            | Handling                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The production Content Security Policy blocks remote scripts, styles, fonts, connections and form posts. | Unchanged. The new page has the same policy. No remote font, script or image was added.                                         |
| Removing an icon library changes the dependency set.                                                     | The change removes `lucide-react` and adds nothing. The pixel icons are local SVG rectangles with no script.                    |
| A new public page goes live when `site/` is merged.                                                      | `/brand/` is unlinked and carries `noindex, nofollow` in its HTML and response headers. Merging remains the owner's decision.   |
| Generated images leave the machine as prompts and reference images.                                      | Only approved brand artwork that is already in this public repository was sent. No customer data, credentials or private notes. |
| Source notes and operator text are rendered in the demo.                                                 | Still React text, never HTML. No change to rendering paths.                                                                     |
| Agent skills were installed during this session.                                                         | They live in `.claude/`, which is excluded from git locally. None are committed here.                                           |

## Audit

Measured on `main` at `a4b976d` across ten stylesheets and eleven components.

| Pattern                             | Count                | Why it reads as generic                                                       |
| ----------------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| Distinct colours                    | 475, across 605 uses | Almost every rule has its own grey-green. Four brand colours are specified.   |
| Distinct font sizes                 | 51                   | No scale.                                                                     |
| Distinct corner radii               | 17                   | Rounded cards on a square-pixel identity.                                     |
| Soft shadows, bevels and glow rings | 14                   | `0 24px 80px` elevation is the default look of a generated dashboard.         |
| Background blur                     | 2                    | Frosted overlays.                                                             |
| Circles                             | 10                   | Avatars and status dots in a system whose marks are squares.                  |
| Radial fades and dot fields         | 3                    | A grid masked by a radial fade sits behind the crow on the first demo screen. |
| Stock icons                         | 31 names, 136 uses   | Includes `Sparkles`, the most recognisable marker of generated interfaces.    |
| Filler copy                         | 14 lines             | Two-beat taglines that could sit on any product.                              |

The landing page was already close to the brand. Most findings are in the demo.

Two findings are reported and left alone because the brand guide records them as selected: Space Grotesk and Bricolage Grotesque are common defaults in generated interfaces, and the landing page sets body copy in a system serif that the demo does not use.

## Rules that replace the patterns

| Rule                                                                              | In code                           |
| --------------------------------------------------------------------------------- | --------------------------------- |
| Colours come from 23 tokens: a neutral ramp from black to chalk and an oxide ramp. | `src/tokens.css`                  |
| Corners are square. Buttons and tags take a stepped pixel corner.                 | `src/tokens.css`, `.pixel-corner` |
| Floating layers cast a hard offset shadow. In-page panels cast none.              | `--shadow-hard`                   |
| Overlays are a flat scrim. No blur.                                               | `--scrim`                         |
| Marks are squares.                                                                | No circular radius remains.       |
| Icons are drawn on an 8 by 8 grid with square pixels.                             | `src/pixel-icons.tsx`             |
| Copy says what the thing is or does.                                              | See the copy table below.         |

`tools/apply-brand-tokens.mjs` performs the stylesheet rewrite. `tests/brand-tokens.test.mjs` fails the build when a stylesheet uses a raw colour, a radius, a blur or a soft shadow.

## Copy changes

| Before                                                         | After                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Small signals. Connected.                                      | Records a decision draws on                                                      |
| Signals in context.                                            | Records a decision draws on                                                      |
| Decisions, with context.                                       | Removed. The heading already says it.                                            |
| 01 / A little perspective                                      | Removed. It labelled nothing.                                                    |
| Start with a question. Put the context around it.              | Pick a prepared security question and see the records behind the recommendation. |
| Choose an example to see the full journey.                     | Choose an example to see the whole walkthrough.                                  |
| What matters                                                   | Summary                                                                          |
| Same work. Different tradeoffs.                                | Options for the same work                                                        |
| Twelve shapes. Different kinds of context.                     | Twelve feather shapes, one per kind of source                                    |
| The wider picture                                              | Feather library                                                                  |
| The context behind the choice.                                 | Records behind this recommendation                                               |
| The original stays. The context grows.                         | Earlier versions stay available.                                                 |
| 01 / Ask, 02 / Explore, 03 / Decide, 01 / Sources, 02 EXAMPLES | Numbers removed. The breadcrumb already shows the step.                          |
| Page title with an em dash                                     | Crowbo · The decision engine for security teams                                  |

## Results

| Measure                             | Before           | After     |
| ----------------------------------- | ---------------- | --------- |
| Distinct colours in stylesheets     | 475              | 23 tokens |
| Corner radius declarations          | 97               | 0         |
| Soft shadows, bevels and glow rings | 14               | 0         |
| Background blur                     | 2                | 0         |
| Radial fades and dot fields         | 3                | 0         |
| Text below 10 pixels                | 179 declarations | 0         |
| Stock icon dependency               | `lucide-react`   | Removed   |
| Runtime dependencies                | 5                | 4         |
| Behaviour tests                     | 23               | 31        |

Colour movement is measured in OKLab, where a difference near 0.02 is about the smallest a viewer notices side by side. The median move is 0.026, nine in ten colours moved 0.050 or less, and the farthest is 0.071, from `#a6be8f` to `--muted`. Of the 475 colours, 181 moved less than 0.02. The change is visible when the old and new pages sit side by side.

## Checks

Run on 29 September 2026 against the production build served on loopback.

- `tsc --noEmit` and the Vite production build passed for all three pages.
- All 31 tests passed: the 23 existing behaviour tests and 8 new brand rule tests.
- `node tools/apply-brand-tokens.mjs --check` reported nothing left to change.
- Browser review at 1440 by 900 covered the landing page, the demo entry, the question composer, the source network, the recommendation, the workspace, the review dialog and the brand page. Review at 375 by 812 covered the demo entry and the workspace.
- No horizontal page overflow at 375 pixels. No browser console warnings or errors.
- The review caught two problems, both fixed: intro text ran under the crow on the entry card, and the question box showed two focus rings.

Not checked: the source, people, history and settings views beyond the first screen, every dialog, the assistant preview, tablet widths, reduced-motion emulation and screen readers. Raising 179 small text sizes to 10 pixels can change wrapping in views that were not opened.

[Landing](previews/2026-09-29-unslop-landing.png) · [Demo entry](previews/2026-09-29-unslop-entry.png) · [Workspace](previews/2026-09-29-unslop-workspace.png) · [Brand system](previews/2026-09-29-unslop-brand.png) · [Phone entry](previews/2026-09-29-unslop-entry-phone.png)

These are local engineering and visual checks. They are not a usability study, an accessibility audit or evidence of decision quality. Nothing was deployed.

## Remaining limits

- The crow state poses are candidates on an approximate grid. None is wired into the product.
- The typefaces are unchanged. Whether to keep Space Grotesk and Bricolage Grotesque is a brand decision.
- Canvas colours in `landing/*.js` are still literal brand values because a canvas cannot read a stylesheet token without extra code.
- `/brand/` becomes public when this branch is merged. It is unlisted and marked `noindex`, which asks search engines to skip it and does not restrict access.
