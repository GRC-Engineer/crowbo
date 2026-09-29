# Decision Studio — 29 September design pass

This pass applies the [brand](../BRAND.md) to the [interaction model](../../docs/INTERACTION-MODEL.md). The source frontend, linked earlier prototype, interaction document and approved runtime sprites were copied from the a3a3 checkout into the main working checkout. Copies were SHA-256 checked. Existing main-checkout work and the source preview were preserved. No backend code was imported.

## Plan and alternatives

Corridor reviewed the plan before code changes. Keep the production CSP, text-only rendering of notes, in-memory synthetic data and separation between saving, reassessing, expressing a preference and authorising work.

| Direction | Sketch | Trade-off |
| --- | --- | --- |
| Paper brief | Recommendation → small evidence margin → history | Direct, but the brand becomes decorative. |
| Terminal table | Source rows → result columns → inspector | Fast to scan, but too close to a generic data tool. |
| Feather workbench — selected | Boxed feather topology ↔ compact recommendation; collection → inspector; people → their evidence; history → retained versions | A recognisable system without hiding the next action. |

Use React, Radix Dialog/Tabs, Motion and Lucide already present. Keep effects purposeful: path selection, subtle packet movement, feather hover, drawer transitions and occasional crow motion. Provide a pause control and honour reduced motion and hidden tabs. Use the original twelve feather tiles through SVG clipping; preserve original raster files.

## Research translated into the four areas

| Area | Observed pattern | Application |
| --- | --- | --- |
| Nest | Clay [workflows](https://university.clay.com/lessons/enriching-an-audience-with-workflows) show a record moving through explicit steps. | Evidence, advice, owner review and outcomes have separate states; one next action is prominent. |
| Feathers | Clay [connections](https://university.clay.com/docs/connections) combine a scannable collection with a contextual side panel. [Sources](https://university.clay.com/docs/sources) keep source changes separate from reprocessing. | Search/filter the evidence, inspect its original basis beside the workspace, explicitly reassess after a correction. |
| Flock | Linear [custom views](https://linear.app/docs/custom-views) keep a stable view around relevant work. | Each person has a role, unresolved responsibility and links to the facts they contribute. |
| Flight log | incident.io's [incident timeline](https://incident.io/changelog/tell-the-full-story-with-your-incident-timeline) makes events into a readable sequence. | Corrections, recommendations and preferences stay visually distinct; earlier versions remain inspectable. |

An interior Clay product screenshot was visually inspected from [V7's article](https://www.v7labs.com/blog/best-ai-tools-listed). It showed a dense company table and adjacent enrichment panel with provider icons. It is an older third-party reproduction, not a claim about Clay's current release. The primary documentation above supports the interaction principles. No Clay artwork or code is included.

Provider marks identify illustrative source mappings only. This UI has no live integrations. The backend worktree currently has a bounded Slack reader; this frontend does not call it. Other provider mappings are examples, not statements of connector availability.

## Review loops

Receipts will be added after each build and browser review. The earlier 28 September receipts in README describe the imported baseline and do not count towards this pass.

### Loop 1 — identity and topology

Built and browser-reviewed at 1440×1080 and 390×844. Original feather tiles now form a boxed orthogonal circuit around Modular Crow. Verified selecting App activity updates the preview and opens the original source drawer with scope and limits. TypeScript/build and all five decision tests passed. Phone review exposed a cramped tab/action row; the next loop gives the action its own line. The collection and people screens still used generic source icons, so the next loop carries the identity through those views.

### Loop 2 — sources and the shared workflow

Build passed. Browser checks confirmed provider search (`Slack` returns the owner-context record), search clearing, all twelve original feather designs, and selecting Merge updates its explanation and GitHub example. The source collection now carries the same feather identity as the network and inspector. Flock links each person to relevant evidence. Review caught a narrow background under those links, and the quick finder still needed arrow-key browsing. The final pass addresses those, adds a shared decision breadcrumb on supporting pages, refines motion, and checks the complete decision loop and responsive layouts.

### Loop 3 — interaction and responsive polish

Added a persistent decision reference on supporting pages, arrow-key quick-find navigation, staggered source arrival, a single hover scan with byte detail, occasional crow motion and a numbered Flight log. Repaired the Flock source-panel width, narrow-phone challenge control, tablet map width and an inherited mobile rule that hid provider marks. Removed the replaced circular-map CSS and unused generic source-icon component.

Verified the running production build in the browser:

- At 1440×1080, selected feathers, opened sources, followed Flock evidence links, searched by provider, filtered by kind, recovered an empty search and explored all twelve tiles. Selecting Merge shows its GitHub example and explanation.
- Saved an unavailable-role correction: version 1 stayed current. Explicit reassessment produced version 2 and the feasibility request. Version 1 remained inspectable. HTML-like note text was displayed literally.
- Recorded an interim preference: advice stayed at version 2 and the log added a distinct simulated-preference event. No authority or execution was created.
- Challenged the owner statement from Flock. The shared header reported context waiting, the log offered reassessment, and reassessment produced the reporting-confirmation request.
- Checked Cmd+K, Arrow Down and Enter, Escape focus restoration, and mobile-menu focus trapping. Pause removed animations while all source rows stayed visible. System reduced-motion CSS is implemented but was not independently emulated.
- Inspected 768×1024 tablet, 390×844 phone and 320×800 narrow phone. No page overflow or clipped controls were found in the checked final views. The tablet network keeps full-width cards; narrow-phone labels wrap. Mobile provider marks remain visible.
- Browser diagnostics contained no warnings/errors. Local server logs confirmed successful font and image loads. Both local preview server processes remained listening, with the source worktree preview preserved.

Final checks: `npm run build` passed strict TypeScript and production bundling; `npm test` passed all five decision-loop tests; Prettier and whitespace checks passed; local documentation links resolved. The final JS bundle is 144.67 kB gzip. Vite's non-fatal client-directive warnings remain from the existing client-only dependencies. The production CSP is unchanged and denies runtime connections, scripts from other origins, and form submission. Original mascot PNGs and provider SVGs match their recorded/source hashes. Corridor feedback was submitted once after applying the guidance.

## Reviewed screens

- [Nest](previews/2026-09-29-brief.png)
- [Feathers](previews/2026-09-29-feathers.png)
- [Twelve-feather library](previews/2026-09-29-library.png)
- [Source inspector](previews/2026-09-29-source.png)
- [Flock](previews/2026-09-29-flock.png)
- [Flight log](previews/2026-09-29-flight-log.png)
- [Phone](previews/2026-09-29-phone.png)

The result is a locally running synthetic UI study in the main working checkout. It is not a backend integration, a deployment, a usability study or evidence of decision quality. No commit or push was made.
