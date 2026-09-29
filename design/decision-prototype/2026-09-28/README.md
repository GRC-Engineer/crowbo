# Crowbo decision UI study

Three disposable, high-fidelity layouts answer the same question: which structure makes a security decision easiest to inspect, challenge and revisit? Visual polish and animated character behaviour are explicit requirements of this study.

From the Crowbo repository root, run:

```sh
python3 -m http.server 8798 --bind 127.0.0.1 --directory design
```

Open <http://127.0.0.1:8798/decision-prototype/2026-09-28/>. The server exposes the public design directory only. No package installation or backend credentials are needed. If that port is occupied by another process, choose an unused port in the command and URL.

## Compare

- `?variant=terminal`: evidence graph beside the proposed change, derived from investor deck v38 slide 6.
- `?variant=brief`: readable recommendation and role comparison, with deciding evidence beside it. Default hypothesis for everyday review.
- `?variant=programme`: attention queue and selected case in one workspace.

The bottom switcher and left/right arrow keys move between layouts. Arrow keys leave editable controls and modal dialogs alone. Nest, Flock, Feathers and Flight log work in each layout. Switching preserves temporary session state; reloading resets it.

Try inspecting a Feather, comparing alternatives, challenging a fact, explicitly reassessing, then opening the original and revised versions in the Flight log. Simulated preferences and proposed outcome checks are separate from recommendations. They never approve or execute work.

## Data and visual sources

The Acme support-platform access review is the synthetic example from investor deck v38. Activity, people, revisions, dates, roles and statements are illustrative. No customer records are present. Three deterministic scenarios cover a custom role with confirmed reporting need, unavailable custom roles, and unconfirmed reporting need. These are assistant-authored design cases, not qualified judgments. Free-text corrections are retained but are not interpreted by a model. The explicitly selected scenario drives the simulated reassessment.

The approved Modular Crow, Packet Runner and Geist Pixel wordmark follow [the current brand](../../BRAND.md). The resident crow and decision engine use Modular Crow; flying companions use the three Packet Runner poses. [Asset provenance and exact-copy hashes](../../crow-concepts/2026-09-24/approved-runtime/README.md) record their source. Complete transparent exports replace the historical Archivist crop and mask. The UI uses chalk, sage, near-black and oxide. Existing local Bricolage and Departure fonts come from the [typography study](../../typography/2026-09-21/README.md), which owns licensing notes.

[The interaction model](../../../docs/INTERACTION-MODEL.md) owns the vocabulary and proposed product workflow. These mock screens do not establish implemented multiuser access, background monitoring, approval authority or backend integration.

## Implementation and boundaries

Vanilla HTML, CSS and JavaScript, with no new runtime dependencies. All state is held in memory. Editable text is rendered with `textContent`. A restrictive CSP blocks remote connections, form submissions and inline scripts. URL variants are allowlisted. No cookies, storage, analytics, credentials or live model calls are used.

Crow motion uses transforms; the visible motion control and reduced-motion preference stop animations, and hidden tabs pause them. Decorative connections are labelled illustrative. Navigation does not animate a fictional backend pipeline. Actual progress cannot be inferred from a crow animation.

This folder is an isolated prototype, not a production app route. Do not publish it as an authenticated product. Once a layout has been reviewed, record the decision in the interaction model and remove or absorb the exploration deliberately.

## Review

Verified in the Codex browser on 28 September 2026:

- Terminal, brief and programme layouts rendered at 1440px desktop, 768px tablet and 390px phone widths. Tablet and phone checks showed no page horizontal overflow.
- Inspected source revision, scope, date, original quotation, influence and limits. Policy remained a separate constraint.
- Compared the three options; changed role availability and owner confirmation in separate scripted reviews. Advice changed only after explicit reassessment.
- Confirmed a saved correction did not replace the current recommendation; switching layouts retained session state. The Flight log still exposed version 1 after version 2 existed.
- Confirmed HTML-like correction text displayed literally; it did not become an image element or trigger a dialog.
- Exercised the Flock, simulated preference capture and outcome checks. The outcome checks remained marked not observed.
- Used arrow keys to change layouts, edited text with an arrow key without switching, and closed a dialog with Escape. Fixed missing keyboard focus after switching layouts.
- The motion control disabled all rendered crow and connection animations. OS-level reduced-motion handling is implemented in CSS and the media-query listener; that preference was not separately emulated.
- Reload retained the selected URL layout and reset demo state. No browser warnings or errors were reported. JavaScript syntax and whitespace checks passed.

Browser review found and fixed retained scroll position between layouts, a missing reassessment button after correcting a source from the Feathers page, and unclear original-source versus counterfactual labelling. Notifications now visibly acknowledge saved feedback and simulated choices.

Desktop screenshots: [brief](previews/brief.png), [terminal](previews/terminal.png), [programme](previews/programme.png). Screenshots pause motion for a stable view; the interactive page starts with motion enabled unless the user prefers reduced motion.

The decision brief remains a design hypothesis, not a selected product layout. No customer usability study, full accessibility audit, production integration or decision-quality evaluation is claimed.

The initial prototype incorrectly used the obsolete Circuit Frames V3 mascot from this worktree's stale brand guide. The 28 September correction reconciles the main project selection, updates that guide, replaces the favicon and all prototype crows with the approved pair, and refreshes the previews. Historical applications and artwork remain unchanged.

After that correction, all three layouts were checked again at 1440px, and the brief at 390px. Every crow loaded from the approved asset folder, with no page horizontal overflow or browser warnings/errors. The motion toggle still paused the artwork. The desktop previews and [phone preview](previews/phone.png) were recaptured; JavaScript syntax and whitespace checks passed.
