# Decision Studio: second pass, 29 September

The [de-generic pass](README.md#de-generic-pass--29-september) merged earlier on 29 September 2026 replaced the stock icons, set the label rule, moved the landing page to Space Grotesk and tidied the workspace shell. It briefed further crow poses and could not generate them.

This second pass covers what that one left open. It puts the colour, corner and shadow rules into code, removes the remaining filler copy, runs the crow brief, and adds a brand page that renders from the live files. The [brand guide](../BRAND.md) owns the identity.

Scope is the website source in this folder, the generated `site/` output and the design documents. Product documents under `docs/` belong to the backend owner and were read, not edited.

## Plan

Written before any code changed, as [AGENTS.md](../../AGENTS.md) requires.

1. Audit the rendered pages and the stylesheets. Count the patterns instead of judging by eye.
2. Put the palette, shape and shadow rules in one token file.
3. Rewrite the stylesheets against those tokens with a script a reviewer can rerun.
4. Fix the copy that reads as filler.
5. Add a test that fails when a stylesheet drifts from the tokens.
6. Generate crow state poses as candidates. Record every prompt. Wire none of them into the product until they are selected.
7. Build the brand page from the same tokens, icons and components.
8. Rebuild `site/`, run the tests and check the changed views in a browser.

The first pass reached `main` while this one was in progress. This branch was merged with it and keeps its icon set, its 11 pixel label rule and its copy where the two overlapped. An icon set drawn for this pass was dropped in favour of the merged one.

### Security considerations

| Consideration                                                                                            | Handling                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The production Content Security Policy blocks remote scripts, styles, fonts, connections and form posts. | Unchanged. The new page has the same policy. No remote font, script or image was added.                                                                                                                                              |
| A new public page goes live when `site/` is merged.                                                      | `/brand/` is unlinked and carries `noindex, nofollow` in its HTML and response headers. Merging remains the owner's decision.                                                                                                        |
| Generated images leave the machine as prompts and reference images.                                      | Only approved brand artwork that is already in this public repository was sent. No customer data, credentials or private notes. The API key was read from the local environment file by the image tool and is not in the repository. |
| Source notes and operator text are rendered in the demo.                                                 | Still React text, never HTML. No change to rendering paths.                                                                                                                                                                          |
| Agent skills were installed during this session.                                                         | They live in `.claude/`, which is excluded from git locally. None are committed here.                                                                                                                                                |

## Audit

Measured on `main` at `2a04f7f`, after the first pass, across ten stylesheets.

| Pattern                             | Count                | Why it reads as generic                                                                                   |
| ----------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| Distinct colours                    | 477, across 608 uses | Almost every rule has its own grey-green. Four brand colours are specified.                               |
| Corner radius declarations          | 100                  | Rounded cards and circular marks on a square-pixel identity.                                              |
| Soft shadows, bevels and glow rings | 14                   | `0 24px 80px` elevation is the default look of a generated dashboard.                                     |
| Background blur                     | 2                    | Frosted overlays.                                                                                         |
| Radial fades and dot fields         | 3                    | A grid masked by a radial fade sat behind the crow on the first demo screen.                              |
| Text sizes below 11 pixels          | 280 declarations     | The first pass overrode the visible labels. The smaller values stayed in the base stylesheets underneath. |
| Filler copy                         | 14 lines             | Two-beat taglines and numbered labels that could sit on any product.                                      |

## Rules added by this pass

| Rule                                                                               | In code                        |
| ---------------------------------------------------------------------------------- | ------------------------------ |
| Colours come from 23 tokens: a neutral ramp from black to chalk and an oxide ramp. | `src/tokens.css`               |
| Corners are square. Primary buttons and tags take a stepped pixel corner.          | `src/tokens.css`               |
| Floating layers cast a hard offset shadow. Panels in the page cast none.           | `--shadow-hard`                |
| Overlays are a flat scrim. No blur.                                                | `--scrim`                      |
| Marks are squares.                                                                 | No radius remains.             |
| The 11 pixel floor applies to every text size in a stylesheet.                     | `tools/apply-brand-tokens.mjs` |
| Copy says what the thing is or does.                                               | See the copy table below.      |

`tools/apply-brand-tokens.mjs` performs the stylesheet rewrite. `tests/brand-tokens.test.mjs` fails when a stylesheet uses a raw colour, a radius, a blur, a soft shadow or a text size below 11 pixels.

## Copy changes

| Before                                                         | After                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Small signals. Connected.                                      | Records a decision draws on                                                      |
| Signals in context.                                            | Records a decision draws on                                                      |
| Decisions, with context.                                       | Removed. The heading already says it.                                            |
| 01 / A little perspective                                      | Removed. It labelled nothing.                                                    |
| Start with a question. Put the context around it.              | Pick a prepared security question and see the records behind the recommendation. |
| Choose an example to start its journey.                        | Choosing an example starts its walkthrough.                                      |
| What matters                                                   | Summary                                                                          |
| Same work. Different tradeoffs.                                | Options for the same work                                                        |
| Twelve shapes. Different kinds of context.                     | Twelve feather shapes, one per kind of source                                    |
| The wider picture                                              | Feather library                                                                  |
| The context behind the choice.                                 | Records behind this recommendation                                               |
| The original stays. The context grows.                         | Earlier versions stay available.                                                 |
| 01 / Ask, 02 / Explore, 03 / Decide, 01 / Sources, 02 EXAMPLES | Numbers removed. The breadcrumb already shows the step.                          |
| Page title with an em dash                                     | Crowbo · The decision engine for security teams                                  |

## Results

| Measure                                | Before                 | After                      |
| -------------------------------------- | ---------------------- | -------------------------- |
| Distinct colours in stylesheets        | 477                    | 23 tokens                  |
| Corner radius declarations             | 100                    | 0                          |
| Soft shadows, bevels and glow rings    | 14                     | 0                          |
| Background blur                        | 2                      | 0                          |
| Radial fades and dot fields            | 3                      | 0                          |
| Text size declarations below 11 pixels | 280                    | 0                          |
| Tests                                  | 23                     | 31                         |
| Pages built                            | 2                      | 3                          |
| Crow poses                             | 3 briefed, 0 generated | 12 generated as candidates |

Colour movement is measured in OKLab, where a difference near 0.02 is about the smallest a viewer notices side by side. The median move is 0.026, nine in ten colours moved 0.050 or less, and the farthest is 0.071, from `#a6be8f` to `--muted`. Of the 477 colours, 183 moved less than 0.02. The change is visible when the old and new pages sit side by side.

## Checks

Run on 29 September 2026 against the production build served on loopback, after merging `main` at `2a04f7f`.

- `tsc --noEmit` and the Vite production build passed for all three pages.
- All 31 tests passed: the 23 existing behaviour tests and 8 new brand rule tests.
- `node tools/apply-brand-tokens.mjs --check` reported nothing left to change.
- Browser review at 1440 by 900 covered the landing page, the demo entry, the question composer, the source network, the recommendation, the option comparison dialog, the workspace and the brand page.
- Browser review at 375 by 812 covered the workspace and the brand page, with no horizontal page overflow.
- The brand page showed 31 icons and 12 pose images with none broken.
- No browser console warnings or errors in the checked views.
- The review caught two problems, both fixed: intro text ran under the crow on the entry card, and the question box showed two focus rings.

Not checked: the source, people, history and settings views beyond the first screen; the remaining dialogs; the assistant preview; the gateway question; tablet widths; reduced-motion emulation; screen readers. Raising text sizes in the base stylesheets can change wrapping in views that were not opened.

[Landing](previews/2026-09-29-unslop-landing.png) · [Demo entry](previews/2026-09-29-unslop-entry.png) · [Workspace](previews/2026-09-29-unslop-workspace.png) · [Brand page](previews/2026-09-29-unslop-brand.png) · [Phone entry](previews/2026-09-29-unslop-entry-phone.png)

These are local engineering and visual checks. They are not a usability study, an accessibility audit or evidence of decision quality. Nothing was deployed.

## Remaining limits

- The crow state poses are candidates on an approximate grid. None is wired into the product.
- The repository now has two brand pages. The [static sheet](../brand-system/2026-09-29/README.md) records the first pass. The [live page](brand/index.html) renders from the current tokens, icons and components. Folding them into one is a decision for the owner.
- Canvas colours in `landing/*.js` are still literal brand values because a canvas cannot read a stylesheet token without extra code.
- `/brand/` becomes public when this branch is merged. It is unlisted and marked `noindex`, which asks search engines to skip it and does not restrict access.
