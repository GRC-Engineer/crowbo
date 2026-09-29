# Crowbo identity in use

Local brand-board prototype, 22 September 2026. Question: can the selected Crowbo identity remain recognisable across a public homepage, a useful decision interface and an investor presentation?

Status: proposed applications awaiting user review. [The brand guide](../../../BRAND.md) continues to own approved decisions. The circuit-frame secondary mark, colour roles, layouts and copy here are proposals, not newly approved identity rules.

On 23 September, the user selected a simpler public website direction. The [company homepage](../homepage-prototype/README.md) is the current website preview. This board retains the earlier application studies for reference.

## Open the board

Serve the parent `design/homepage-mockups/2026-09-21/` directory with:

```sh
python3 -m http.server 0 --bind 127.0.0.1
```

Open the printed loopback URL followed by `/brand-board-prototype/`. The board reuses the parent's local assets and licences. It needs no build step or dependency installation.

The default overview shows the three applications together. The review bar, previous/next buttons and left/right keys switch focus views: `?view=website`, `?view=product`, `?view=pitch`, or `?view=overview`. Controls inside an application keep their own keyboard behaviour. Browser Back restores the preceding view.

## What to try

- Website: hover or keyboard-focus the crow for bytes; leave to return to the sprite. Click/tap pins or unpins the byte view. The call to action opens the product specimen.
- Product: switch the fictional context between an unclear constraint, an urgent coverage gap and a supported capacity premise. Inspect the synthetic source and its limits. The candidate guidance changes, while the owner decision stays unrecorded.
- Pitch: switch between a cover and a method slide. The secondary mark carries the identity without requiring the full mascot on every slide.
- Board: click the circuit-frame mark to trace a signal. The visible effects control pauses animation; reduced-motion preference starts effects paused.

The prototype uses the UI branch of the prototype skill. The user's request is for one cohesive identity across three applications, so these are different layouts with shared brand rules, not competing identity directions. The separate study route sits alongside the existing terminal prototype and leaves that selected page intact.

## Sources and boundaries

The approved V3 mascot, favicon and fonts are reused unchanged. The presentation uses the newly recorded purple and mint background choices in the brand guide; ivory is a text colour, not a slide background. The original SVG frame motif is a new proposed graphic derived from the spectacles' geometry, not a physically validated circuit. Both sprite and byte views use the selected PNG's existing caption-excluding rectangle, x 100, y 160, width 1000, height 950. Font notices remain in the parent [licences directory](../licenses/).

Product wording follows [the foundation](../../../../docs/FOUNDATION.md). The case uses [the evaluation contract's](../../../../docs/EVALUATION.md) public fictional inputs. Scenario variations and candidate guidance are assistant-authored design specimens, not reviewed evaluation answers or demonstrated product judgment. The illustrative eight-week clearance calculation assumes 16 completions and 12 arrivals per week against a 32-item backlog. It is not a risk-reduction result.

No external requests, persistence, analytics, live integrations, model inference or authorised actions occur. The URL view is allowlisted; output uses safe DOM text. All state besides the selected URL view is temporary. Animations are bounded to interaction, respect reduced motion and stop when the page is hidden. The browser scales the slide layouts; this is an HTML visual study, not a finished slide deck or production website.

## Review outcome

Pending user feedback. Keep the selected mascot, wordmark and palette governed by the existing brand guide. Adopt or revise the proposed secondary mark and application rules after reviewing these specimens.

## Verification

Checked in the local Codex browser on 22 September 2026 at 1280px desktop, 768px tablet, and 390px and 320px phone widths. All focus views fit without horizontal page overflow. The website and product phone layouts were inspected visually, as were the overview and both pitch slides. The purple cover and mint method backgrounds match the current brand guide.

Verified view switching, URL reload, Browser Back, arrow-key navigation, preservation of arrow keys inside the case controls, and fallback to overview for an unknown view parameter. Fictional coverage/capacity changes updated the candidate guidance while the owner decision stayed unrecorded; the source disclosure opened. Hover revealed bytes, leaving restored the sprite, and click-to-pin/unpin worked. The visible effects toggle paused the hover effect. Reduced-motion preference handling is implemented; the runtime check used the visible toggle rather than changing the operating system preference. The circuit trace and slide controls worked. No browser warning/error logs were reported.

JavaScript syntax and local asset/document references passed. CSS crops reuse the selected source unchanged. These checks cover the local design specimen, not product decision quality, a complete accessibility audit or production readiness.
