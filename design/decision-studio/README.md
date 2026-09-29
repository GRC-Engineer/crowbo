# Crowbo decision studio

React design study, updated 29 September 2026 in the main checkout. Since 29 September 2026 its production build supplies the company landing page and `/demo/` at [crowbo.ai](https://crowbo.ai); see [Publication as the website](#publication-as-the-website--29-september). The [earlier identity pass](DESIGN-PASS.md) records the Clay research, twelve-feather system, provider marks and three new review loops. Synthetic Acme evidence only. This study preserves the earlier [three-layout prototype](../decision-prototype/2026-09-28/README.md).

## Publication as the website — 29 September

The public root is the approved two-paragraph company homepage, with Modular Crow, the boxed feather network, contact information and an Open the demo link. The existing React walkthrough lives at `/demo/`; its full workspace is at `/demo/?view=workspace`. The demo wordmark returns to the company homepage. The earlier Command Room is retained as design history.

Vite builds `index.html` and `demo/index.html` together into the repository's `site/` directory and empties stale files first. Edit source files rather than the generated output. `landing/` reuses the approved homepage study; `src/` owns the synthetic demo. The `public/` folder supplies the unchanged security headers, static 404 page and font/provider-mark licences. Commit the regenerated `site/` with source changes so the Git-triggered deployment publishes both pages together.

Both pages are public and static. No authentication or access policy is implemented. The demo calls no backend, model or external service; `connect-src 'none'` and `form-action 'none'` remain in force. Publishing it establishes no evaluation result or user acceptance.

## Workflow coverage and next refinement

The agreed initial portfolio is remediation tracking, access reviews, and issues and exceptions management. Launch order, equal implementation depth and the commercial entry point remain open. The [interaction model](../../docs/INTERACTION-MODEL.md#initial-workflow-portfolio-29-september) records the UI consequences and links the owning contracts; product scope belongs to the foundation maintained by the backend owner.

The current preview still has two prepared questions: support access and a service upgrade. Access has the fuller conversation, comparison, challenge, version history and shared Assistant preview. The upgrade example is a candidate remediation or exception case, not an implemented tracking workflow. There is no dedicated issue/exception lifecycle yet.

The [next bounded UI delta](../../docs/INTERACTION-MODEL.md#smallest-next-ui-delta) is planned: label prepared questions by workflow and add two non-access synthetic stories using the existing question-and-decision card. One separates a merged fix from deployment, verification and proposed closure; the other compares responses to a logging gap, including a bounded exception request. Preserve the current identity and interactions. Show changed source contributions, explicit reassessment and prior versions; keep requests, authority, execution and verified outcomes distinct. This planning update adds no runtime functionality, backend connection or evaluation result.

## Question-first walkthrough — 29 September

Open [Ask Crowbo](http://127.0.0.1:8799/demo/) after serving `site/` as described under [Run](#run). The `/demo/` URL opens the [question-first interaction](../../docs/INTERACTION-MODEL.md#question-first-walkthrough-29-september), matching production. `?view=ask` remains a supported alias. Open workspace links to `?view=workspace`; absent or unrecognised view values open the question card. This uses PStack Experience First, Exhaust the Design Space and Model the Domain.

One opening card expands into a question composer, a finite source-network illustration, and a recommendation. Prepared support-access and gateway-upgrade questions each have six fictional records. Feather shapes use the existing topology family; provider marks are examples. Larger cards mean greater influence on this choice. Constraints have a separate Must hold marker. The graph uses two columns on phones, without sideways scrolling.

The result exposes source details, alternatives and a source-grounded challenge. Confidence is expressed through support and unresolved checks. The gateway example retains its prepared what-if and before/after. The access-review example now uses the versioned conversation described below. Free-text operator context stays attributed and unverified. An arbitrary question outside the two prepared examples cannot receive a scripted answer. Recording a next step is an explicit simulation in this tab.

This is not connected to Turbopuffer, Jev or the Crowbo backend. The four research stages are a labelled illustration, not actual processing or model reasoning. No evaluations, integrations or external actions run. The existing production CSP still blocks connections and form submissions. New state and transitions live in `src/question-demo-model.ts`; the route uses existing React, Motion and Radix dependencies, approved artwork and local fonts.

Local review covered 1280×720, 390×844 and 320×800; both questions; exact-question rejection; automatic completion, pause/resume and skip; source scope and limits; keyboard example selection; dialog focus trapping and restoration; operator-note text rendering; both what-ifs; simulated next-step recording; and the unchanged default workspace. No page horizontal overflow or browser warnings/errors were observed. Review fixed transition scroll position, source-override disclosure, focus after recording, and the phone network. Reduced-motion handling is implemented but the OS preference was not separately emulated. Build, all ten behaviour tests, formatting and local links passed. Dependency `use client` build warnings remain non-fatal. These checks do not establish decision quality or user acceptance.

[Opening card](previews/2026-09-29-question-entry.png) · [Recommendation](previews/2026-09-29-question-result.png) · [Phone result](previews/2026-09-29-question-phone.png) · [Phone network](previews/2026-09-29-question-network-phone.png)

### Access-review conversation — 29 September

The access-review result now keeps one recommendation card in place, with four fields: Recommended move, Why this option, What must hold and Next action. Compare options and Challenge this sit beside the card on desktop, before the source details on phones. The approved Packet Runner, twelve-feather family, palette and four local fonts remain.

The prepared conversation introduces annual recovery as work outside the 90-day observation window. Staging that context leaves the first advice unchanged; explicit reassessment creates a second version. Three additional evidence outcomes can then be previewed and applied:

- **Tested path:** a fictional controlled rehearsal includes successful recovery, a 45-minute grant, expiry, denied administrative action after expiry and denied cross-queue exports. Only this record supports narrower everyday access plus the tested recovery path. Owner approval and a separate daily-role permissions test remain unresolved.
- **Runbook only:** a process is described without implementation or test results. The next step is a rehearsal, not reliance on the proposed mechanism.
- **No path available:** the fictional environment cannot supply the temporary grant. The next step is to establish another supported recovery method.

A small feather relationship shows exactly which added source changes the advice, with a finite 1.8-second highlight and a pause control. Previous advice retains its own source revisions, conditions and any simulated next-step record. Alternative outcomes do not rewrite those earlier versions. The original six-source network remains under Explore the sources, with applied records listed separately. Notes stay plain, unverified text and never choose a branch.

The [interaction model](../../docs/INTERACTION-MODEL.md#access-review-a-recommendation-that-survives-a-challenge) owns the design rationale and fixture boundaries. `src/access-review-model.ts` owns this finite local state; `src/access-review.tsx` renders it. Shared source inspection, network and note components now live in `src/question-components.tsx`. No new dependencies, backend calls, storage or external actions were added; the existing CSP remains unchanged.

Verified in the browser at 1280×900, 390×844 and 320×800: initial comparison; staged versus applied context; all three evidence outcomes; source inspection and return focus; earlier source sets; simulated next-step recording scoped to a version; literal HTML-like note rendering; gateway what-if; and return to the original workspace. No horizontal page overflow or browser warnings/errors were observed in the checked flow. Review moved Compare and Challenge up beside the recommendation. Reduced-motion support is implemented; the OS preference was not separately emulated. Production build and all 18 behavior tests passed. These are local UI checks, not backend evaluation or decision-quality evidence.

[Initial advice](previews/2026-09-29-access-start.png) · [Revised advice](previews/2026-09-29-access-revised.png) · [Phone conversation](previews/2026-09-29-access-phone.png)

### Assistant preview and conversation refinement, 29 September

The access-review result has a Decision view / Assistant preview switch. Both presentations use one reducer and the same fixed records. Draft follow-ups, staged context, current and previous versions, saved reviewer notes and simulated next-step records survive switching. Open in Crowbo returns to the full decision without starting a new case.

The generic coding-assistant preview shows an ordinary-language question selecting Crowbo, a compact recommendation with its remaining conditions, optional source records and an editable follow-up composer. This is an original UI illustration, not a live Claude or Codex connection. Choose a prepared suggestion, then press Enter or Send. Shift+Enter inserts a new line. Sending a recognized phrase stages its synthetic record for review; only reassessment changes the recommendation. Unrecognized text stays editable with an explanation and never receives an unrelated answer. The input is capped at 500 characters and renders as plain text.

The first layout repeated the initial question and routing explanation above every revision. Browser review moved those earlier turns behind a disclosure after the first reassessment, keeping the latest follow-up beside its answer. Previous turns retain their reasons, conditions and exact source revisions. Comparison, next-step review and pending-context cards are shared with the decision view to keep the boundaries consistent. The phone layout places the conversation before supporting context and preserves the approved typography, feather designs and palette.

[The interaction model](../../docs/INTERACTION-MODEL.md#the-same-decision-in-a-coding-assistant) owns this direction. Implementation is in `src/access-assistant.tsx`, `src/access-assistant.css` and the existing access reducer; shared cards are in `src/access-review-actions.tsx`. No new dependencies, backend changes, external requests, storage or actual agent activation were added. The production CSP still blocks network connections and form submission.

Checked locally at 1280×1000, 390×844 and 320×800: switching with a draft and with staged context; applying context in either presentation; shared version and simulated-next-step state; saved-note continuity; rejection of unsupported HTML-like input; Enter and Shift+Enter behavior; exact historical source lists; source inspection, Escape and return focus; and option comparison. No horizontal page or inspected-dialog overflow, browser warnings or errors were observed. Reduced-motion handling is implemented but was not separately emulated. Build, all 23 behavior tests and formatting passed. These checks establish local UI behavior, not model quality or a live host integration.

[Desktop assistant preview](previews/2026-09-29-assistant-desktop.png) · [Phone conversation controls](previews/2026-09-29-assistant-phone.png)

## Current simplicity pass — 29 September

The founder asked for a simpler experience based on the feedback shared from Nasem: less bird terminology, less information at once and clear routes into detail. The current layout keeps the chalk recommendation panel and removes competing first-screen sections.

- Decisions, Sources, People and History replace Nest, Sources, Flock and Flight log in navigation. Settings remains separate.
- The decision opens with one question, a short explanation and one primary Review recommendation action. Required owner review, unconfirmed facts and other conditions remain visible.
- Permissions open in the review dialog. Compare options opens the existing comparison. Explore the sources expands the original boxed feather network. History no longer has a duplicate tab on the overview.
- Sources rows show their title, provider and status; quotation, revision, scope and limits remain in the inspector. Per-person sources expand only when requested. The design-library gallery is retained in source but removed from the daily collection view.
- Reading text is 16px on the overview and 15px in supporting views; navigation and main actions are at least 14px. The existing four local brand fonts remain. A phone presents the recommendation and primary action first.

The obsolete overview tabs, process strip, sidebar slogans, duplicate case link and footer shortcut are removed. Radix Tabs is no longer a dependency. The reducer and synthetic scenarios are unchanged; dialogs still use Radix focus handling. Source notes remain React text, never HTML.

Verified at 1280×720, 390×844 and 320×800. Checks covered the review dialog, expandable network and source inspection, both changed scenarios, saved versus applied corrections, retained version 1, comparison and outcome dialogs, People disclosures, source-to-integration navigation, Slack's exact source filter, keyboard search, and returning focus after a dialog or page transition. The primary action is visible without scrolling on both checked phone sizes. All four local font families loaded when used. The browser reported no warnings or errors in the checked session.

The review fixed a redundant phone status label, an off-screen skip link peeking into the header, and focus being set during the departing page's animation. Focus now moves only when the arriving page finishes. Production build, five decision-loop tests, formatting and local documentation links passed. Existing client-only dependency build warnings remain non-fatal. These are local engineering checks, not a user study or a complete accessibility audit.

[Desktop preview](previews/2026-09-29-clarity-desktop.png) · [Phone preview](previews/2026-09-29-clarity-phone.png) · [Expanded source network](previews/2026-09-29-clarity-sources.png)

## Earlier design exploration

The pstack Experience First and Exhaust the Design Space skills guided three competing sketches before implementation:

| Sketch        | Structure                                                                                                       | Benefit                                                                      | Cost                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| Observatory   | Full-width evidence constellation → selected claim → recommendation drawer                                      | Strong spatial identity and source exploration                               | Hides the next action behind exploration            |
| Field notes   | Large paper brief → evidence margin → chronology                                                                | Readable, editorial, calm                                                    | Underuses the relationships that distinguish Crowbo |
| Field station | Persistent programme rail → brief and evidence instrument side by side → option comparison and retained history | Keeps the action and its basis together; distinctive visual detail has a job | Needs a deliberate single-column mobile order       |

Selected for the original iteration: field station. The observatory becomes an interactive part of the brief rather than the entire application. The paper treatment is reserved for the recommendation, with a dark source instrument and warm oxide for attention and actions.

## Live references inspected

Visited and inspected rendered DOM/CSS and screenshots on 28 September 2026. These observations are design inputs, not claims about the sites' private source code. No third-party website artwork or code was copied.

- [Linear](https://linear.app): 64px desktop headline, close tracking, low-contrast dividing rules, dense embedded product views, grouped navigation and progressive detail. Applied hierarchy, stable navigation and contextual inspection.
- [Raycast](https://www.raycast.com): visible keyboard language, a tightly framed primary interaction and deliberate entrance motion. Applied a searchable command dialog, shortcut hints and short transitions, without its large marketing animation.
- [Work Louder](https://www.worklouder.cc): large product-specific visual objects, tactile controls, soft panel framing and generous scale contrast. Applied physical-feeling tabs and panels, with Crowbo's own pixel characters and instrument markings.

The [brand guide](../BRAND.md) owns the approved mascots, palette and type. The [interaction model](../../docs/INTERACTION-MODEL.md) owns terminology and authority boundaries. Local fonts retain their [existing licenses](../typography/2026-09-21/README.md).

## Dependencies and boundaries

Sources is the main workspace collection of individual records. Settings opens
Integrations, where each tool has connection, permission and sync details. The
integration list and source inspector link in both directions; viewing a tool's
sources applies an exact, removable provider filter. Quick find and the mobile
menu also expose Settings. All tool mappings and proposed scopes are examples:
no connections, permissions, credentials or sync jobs are created by this UI.

Checked on 29 September: Settings at 1280×720, 390×844 and 320×800;
mobile-menu and keyboard navigation; Slack returning one example record; Zendesk
returning two; combined filters producing an empty state; clearing filters
restoring all six records; source-to-integration links; the zero-record GitHub
state; and Escape returning focus to the selected tool. Review caught and fixed
the Settings button falling below a short sidebar and an overfull phone
breadcrumb. Build, the five decision tests and formatting passed. The fresh
browser tab reported no warnings or errors. [Settings preview](previews/2026-09-29-integrations.png)
and [phone preview](previews/2026-09-29-integrations-phone.png) show the result.

React/ReactDOM own rendering and state. Radix Dialog owns modal focus, Escape and screen-reader semantics. Native details/summary elements provide keyboard-accessible disclosures. Motion handles short view and layout transitions. Lucide supplies consistent ordinary UI icons; the crow artwork stays original. TypeScript checks the state model; Vite bundles a local static build. Versions are pinned in package.json and package-lock.json.

Prettier is development-only and keeps the React and CSS source formatted. No formatter code is included in the browser bundle. This checkout was built and tested with Node 26.0.0 and npm 11.12.1.

The interface uses Bricolage for headings, Space Grotesk for reading, Departure Mono for terminal labels and Geist Pixel Square for the lowercase wordmark. Original licensed font files are bundled locally. Provider SVGs are bundled with their [source manifest](src/assets/providers/provenance.json).

No component theme kit, CSS framework, graph framework, remote font, charting dependency or state library. The evidence instrument uses small SVG paths and HTML buttons. Source text is React text, never interpreted HTML. The production CSP denies connections and form submissions. Inline styles are permitted for Radix and Motion, not arbitrary user-supplied styles. No credentials, private records, storage, provider calls, authentication or live actions.

## Run

```sh
cd design/decision-studio
npm ci
npm run build
```

The build writes to `site/` at the repository root. From there, serve it on loopback:

```sh
python3 -m http.server 8799 --bind 127.0.0.1 --directory site
```

Open <http://127.0.0.1:8799/> for the landing page or <http://127.0.0.1:8799/demo/> for the walkthrough. Use the production build for review because its CSP intentionally blocks development WebSockets. `npx wrangler dev` from the repository root serves the same folder with the `_headers` response headers applied, which the Python server does not do.

Changes stay in this tab and reset on reload. Saving a correction does not change advice; explicit reassessment creates a retained version. Notes are not interpreted by a model. A simulated preference never approves a role change. Source timestamps describe the fixture, not live freshness. Judgment quality remains outside this UI study.

## Iteration receipts

Three local review loops were completed on 28 September 2026:

1. Built the field-station composition and exercised the unavailable-role scenario. Saving left the original advice intact; reassessment changed the next step; the original version stayed inspectable. HTML-like note text appeared literally. [First desktop pass](previews/loop-1-desktop.png), [first phone pass](previews/loop-1-phone.png).
2. Increased functional text sizes, moved the phone status into the reading order, made the tablet evidence instrument a map-and-detail composition, replaced the phone menu with a focus-trapped Radix dialog, and visibly marked sources challenged by a scenario. Added people to quick find. [Second desktop pass](previews/loop-2-desktop.png), [tablet composition](previews/loop-2-tablet.png).
3. Tested command-search navigation, comparisons, the unconfirmed-reporting scenario, simulated preference capture, history, empty-search recovery and unobserved outcomes. Fixed focus after navigating out of a dialog, and strengthened secondary text and focus-ring contrast on the paper panel. [Final brief](previews/brief.png), [phone](previews/phone.png), [Feathers](previews/feathers.png), [Flock](previews/flock.png), [comparison](previews/comparison.png), [Flight log](previews/flight-log.png).

The browser checks covered 1440px desktop, 768px tablet, 390px phone, and a 320px narrow-phone check. No page horizontal overflow was observed. Modal focus trapping, Escape, focus restoration, Cmd+K, keyboard search, and the motion-pause control were exercised. All referenced crow images loaded. The browser reported no warnings or errors during the checked flows. OS-level reduced-motion handling is implemented but was not separately emulated.

`npm test` passed five decision-loop tests. `npm run build` passed strict TypeScript checking and production bundling. Formatting and whitespace checks passed. Vite reports non-fatal `use client` directive warnings for the client-only dependencies; this study does not use server rendering. That baseline JS bundle was approximately 142 kB gzipped. Original full-resolution PNG exports are retained; a production asset-size pass is still appropriate.

These receipts establish local UI behavior, not a full accessibility audit, a user study, backend integration, or decision quality. No site was published or deployed at that time; publication followed on 29 September as described above.
