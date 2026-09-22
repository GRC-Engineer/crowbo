# Crowbo homepage directions

Three local, responsive homepage mockups exploring a distinctive identity for Crowbo. Use the review bar to switch between Field Notes, Command Room and Flight Path. These are proposals for review, not a deployed website or an executable Crowbo decision engine.

## Shared decisions

The [brand guide](../../BRAND.md) owns the selected identity: Circuit Frames V3, lowercase Geist Pixel Square with plain lettering, and the ink/midnight/mint/lemon/ivory palette. Body and headline font pairings, composition, site copy and graphic motifs are exploratory. The [typography study](../../typography/2026-09-21/README.md) retains the approved wordmark settings.

## Directions

1. **Field Notes.** An editorial identity built around a warm paper surface, large Bricolage headings, a dark Archivist specimen plate, numbered notes and a readable decision dossier. It foregrounds curiosity and considered judgment.
2. **Command Room.** A restrained technical identity built around midnight, mint labels, a decision console and a visible reasoning structure. It foregrounds inspection, traceability and the accountable decision owner.
3. **Flight Path.** A bolder graphic identity built around mint surfaces, large Space Grotesk headlines, lemon waypoints and a stepped route motif. It foregrounds movement from a difficult question to a reasoned next action.

Each includes an introduction, a working illustrative scenario switcher, an approach section and local navigation. The example and approach links scroll to actual sections; there are no unconnected signup buttons or forms.

## Product grounding and fictional examples

The copy is grounded in `docs/FOUNDATION.md` and `docs/EVALUATION.md`. Crowbo is intended to support security decisions by connecting evidence, objectives, constraints, options and inspectable reasoning. The selected first proof is tool purchase versus remediation capacity. The mockups make no claim that the product has been validated or deployed and include no fabricated customers, endorsements or performance results.

All examples are fictional, and the review bar labels them as such. The scenario switcher selects authored text from a fixed mapping. It performs no inference or actions. These candidate recommendations are design specimens, not validated evaluation judgments.

- **Unclear bottleneck.** Uses the public fictional development case: $120,000 available, 12 findings arriving and 8 resolved per week, and a backlog of 32. The +4 figure is queue growth, not a risk score. The next step is to investigate why remediation is constrained, without predetermining an investment winner.
- **Urgent coverage gap.** Adds an explicitly fictional critical-asset coverage gap to illustrate how a new fact can change the next step to a bounded tool pilot. The proposed tool cost of $60,000 comes from the development case; it is not an approved pilot budget or vendor price.
- **Credible capacity plan.** Adds an explicitly fictional assumption that engineering time is the constraint and a plan could deliver 16 resolutions per week. Eight weeks is 32 / (16 - 12), conditional on the stated steady rates. It does not establish risk reduction or validate the illustrative $90,000 capacity plan. The open question retains process alternatives and owner approval.

## Assets and licences

All three directions display the selected Circuit Frames V3 through a CSS viewport over an unchanged copy of the generated source. The crop excludes its caption. They share the selected head favicon with the terminal prototype; [the brand guide](../../BRAND.md) records the exact assets, crop and generation provenance. All route graphics and layout decoration are original HTML/CSS or inline SVG.

Four existing inspected font files and their original OFL 1.1 licences are copied unchanged from the typography study: Geist Pixel Square, Space Grotesk, Bricolage Grotesque and Departure Mono. The typography study README records upstream sources. Copyright and licence notices are included in `licenses/`. All runtime assets are local, with no analytics, external requests or data collection.

## Preview and verification

Serve only this directory on loopback. From this directory, `python3 -m http.server 0 --bind 127.0.0.1` chooses an available port and prints the local preview address. Stop the server with Ctrl-C.

The design bar and scenario selectors use fixed allowlists; variable copy uses `textContent`. The page has a restrictive Content Security Policy, no arbitrary URL loading, no form submission and no stored user data. Motion respects reduced-motion preferences.

Verified in the Codex browser on 21 September 2026 at 1280 × 900, 768 × 1024 and 390 × 844. All three directions fit the viewport without horizontal page overflow. The four local fonts loaded, concept switching and section links worked, scenario changes updated the recommendation and metrics, and the reasoning disclosure opened. The browser reported no console warnings or errors. `node --check mockups.js` passed. These checks cover the mockups, not product decision quality or a complete accessibility audit.

After the Circuit Frames V3 rollout on 22 September 2026, all three directions loaded the selected mascot and new favicon. Each direction was checked at 1280px and 390px widths without page overflow. Concept switching worked and the browser reported no warnings or errors. The caption-excluding crop and local asset links passed inspection.
