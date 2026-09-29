# Crowbo company homepage

Publication note, 29 September 2026: this page was ported into the [Decision Studio project](../../../decision-studio/README.md#publication-as-the-website--29-september) as the root of crowbo.ai, with a demo link and a features section added there. That copy is the deployed source; this directory is unchanged design history.

Local prototype, updated 24 September 2026. This is the current website direction. The user selected a sparse company introduction after reviewing [Cursive](https://cursive.ai/) and [Praxic](https://www.praxic.ai/), then approved the broader company copy below.

This is the starting page. The user plans to expand the website and add examples from the slide deck later. The current introduction now says Crowbo will help **humans and agents** make and explain those choices; the short format and existing design remain in place. The broader website and deck examples are deferred, not implemented by this copy update.

The default homepage pairs that copy with twelve pixel feathers in the restored boxed topology and the selected Modular Crow at the top right of the masthead. Chalk lettering, a near-black background, sage paths and sparse warm oxide details carry the new identity. It has one contact link, hover and keyboard exploration, and a small Pause/Play control. Design comparison controls appear only on explicit preview URLs. The brand board and terminal decision lab remain design history.

## Modular Crow identity update, 24 September

The [website asset record](../../../crow-concepts/2026-09-24/modular-crow/website/README.md) preserves the four generated PNGs, input references and exact prompts. A standalone Modular Crow replaces the old cropped portrait in the fallback and portrait/Flock previews; a simplified head supplies the favicon. Two matching feather sheets retain the twelve designs and six-tile geometry. The original sources remain available as history. Asset paths are local and fixed.

The homepage keeps the selected copy, twelve card positions, sizes, sixteen orthogonal connections and feather-to-evidence mappings. The crow sits at the top right of the masthead. The network keeps its caption and Pause control centred below it; the phone wordmark scales to leave room for the crow. Oxide marks selected paths, assessment terminals, the contact arrow and text selection. Chalk stays brightest on the wordmark and glasses. Network artwork opacity is 78% so the darker feathers remain visible; the earlier portrait motion previews retain their existing 55% overall opacity.

Checked in the local browser at 1280 × 800, 1280 × 720, 390 × 844, 320 × 740 and the normal 616 × 770 viewport. The narrow layouts scroll through the full graph, crow and footer without horizontal overflow. All twelve feather glyphs and sixteen paths remain present. Keyboard Enter pins a path, Escape clears it, and Pause holds feather and packet transforms still while Play resumes movement. The source PNGs load, the favicon points to the new asset and computed selection colours match oxide on near-black. Scan, Flock and the unknown-variant portrait fallback render the new character. Module syntax and browser warning/error logs pass. Reduced-motion handling is retained; the system setting was not changed. These are bounded local checks, not deployment or audience testing.

The requested top-right placement was checked at 1280 × 800, 1280 × 720, 390 × 844, 320 × 740 and the normal 616px panel. The crow fits beside the wordmark without covering text or feather cards; narrow layouts remain free of horizontal overflow. Keyboard Enter/Escape still pins and clears a path, and browser warning/error logs are empty.

The user then requested a larger crow. It now renders at 160px in the 616px panel (previously 74px), up to 224px on desktop and at least 100px on phones. Narrow mastheads use a two-column row for the wordmark and crow, with the tagline below. Desktop, 616px, 390px and 320px checks confirm clear spacing and no horizontal overflow; the desktop network remains below the larger character. The source artwork and interaction code are unchanged.

## Run

From the parent `design/homepage-mockups/2026-09-21/` directory:

```sh
python3 -m http.server 50752 --bind 127.0.0.1
```

Open `http://127.0.0.1:50752/homepage-prototype/`. No build or installation is needed.

## Boxed topology with twelve feather designs

Current direction, 24 September: open `/homepage-prototype/` without parameters. The user wants the previous boxed topology with the twelve new feather designs inside its boxes. The default uses the authored Response emphasis, which gives more space to capacity, experience and dependencies. The scenario question is hidden, and hover labels use general names such as PR reviews, Meetings and Team capacity. The caption identifies the illustration as an illustrative network; it does not present actual data or measured importance.

The original card positions, size formula and orthogonal connections remain unchanged. Each card displays one of the twelve approved pixel feather designs through a clipped SVG viewport into the matching Modular Crow palette sheets. The earlier concept sheets are preserved. Hover details, pinning and subtle feather motion remain available. The explicit study URL `?variant=network&motif=feathers&question=control` retains Equal/Weighted sizing, question selection and comparison controls. The rejected free-standing layout is removed from the active controls; its old `motif=plumage` preview URL opens this boxed view and preserves the question.

The mappings are Braid for reviews, Cluster for meetings, Branch for Slack, Merge for changes, Spine for policies, Vector for experience, Column for capacity, Series for incident feeds, Object for incident records, Loop for control assessments, Shard for risk assessments and Mesh for dependencies. Technical feather names and emphasis labels appear only in the design previews. These remain visual metaphors for synthetic examples, not implemented storage choices or measured evidence weights.

Verified at 1280 × 720 and 390 × 844 without horizontal overflow. Measured card positions and sizes and all sixteen connection paths exactly match the preceding boxed layout. All twelve distinct artwork crops render; pinning, Escape and Equal/Weighted controls pass. Module syntax passes and browser warning/error logs are empty.

The default-homepage update was checked at 1280 × 720 and 320 × 740. The copy, all twelve feathers, caption, pause button and footer fit without horizontal overflow; the phone scroll exposes the complete network. Pinning and Escape work with the general labels. DOM comparisons confirm that feather poses and byte packets stay still while paused and advance after Play. Arrow keys do not enter comparison mode on the normal homepage. Explicit Network and Scan previews still work, question selection updates the preview URL, and an unknown variant returns the prior portrait fallback with controls hidden. Module syntax, local asset/document links and unique HTML IDs pass. Reduced-motion handling retains the existing preference check; the operating system setting was not changed.

## Crows or circuit feathers

Earlier comparison, 24 September: should an information item be represented by a small crow or by a feather belonging to the broader Crowbo identity? This comparison follows the discussion forwarded from Steerer. The boxed feather selection above supersedes this open question. The dated study records below preserve what was reviewed and verified at each stage; the no-query homepage now opens the boxed feathers.

- Crows: `?variant=network&motif=crows&question=control`.
- Circuit feathers: `?variant=network&motif=feathers&question=control`.
- Previous Network: `?variant=network`, also available through **Original**.

Both comparison views use the same twelve positions, example item labels, sizes, opacity, connections, sequence duration, active-item count and moving byte marks. Switching motifs preserves the animation phase and question. Short source codes appear on both versions; hover, focus or selection identifies the particular synthetic item and its role. A PR review, meeting note, incident entry and resume example remain distinguishable from requirements, feasibility context and assessments. No real records or integrations are used.

**Control** asks what supports a control assessment. **Response** asks what shapes a feasible response, increasing the illustrative emphasis on capacity, relevant experience and dependencies. Card sizes and four lemon connections change between these authored examples. Assessment values are never computed or changed. **Equal / Weighted** remains available. Motif and question parameters are allowlisted, retained in the URL and restored on reload; sizes and animation controls remain page-local.

The initial comparison used six native SVG feather variants with stepped outlines and small gate shapes. The current boxed study above replaces those icons with the twelve approved pixel designs in `feather-glyphs.js`, retaining the same layout and animation time slots. The circuit shapes are visual references to structured reasoning, not executable gates or a claim that uncertain security judgments reduce to binary logic. The existing full mascot remains the approved brand asset.

Current assistant visual judgment, awaiting visitor and founder review:

| Criterion | Crows | Circuit feathers |
| --- | --- | --- |
| Immediate reading | Faces and reactions suggest characters working together; item labels help establish the evidence reading. | Repeated marks feel more like information in a shared system, but the meaning still depends on labels and context. |
| Brand recognition | Strongest direct connection to the Archivist. | Carries the corvid reference indirectly and benefits from the established mascot elsewhere in the identity. |
| Small-size legibility | Lemon glasses remain visible; differences between crow types become subtle. | The quill and outline remain visible; detailed gate shapes become secondary on phones. Do not add more circuitry. |
| Fit with decision infrastructure | More personality and a possible agent interpretation to test. | Quieter and more diagrammatic; the current recommendation for the network illustration. |

This is an aesthetic judgment, not a tested audience-comprehension result. The recommendation is to retain the Archivist as the mascot and develop the circuit feathers as the information motif. A useful next review is to show each version without explanation and ask what its individual marks represent before revealing the item labels. Neither outcome has been assumed or validated.

Verified: both motifs have exactly matching measured node geometry and connections under each question, and switching to Response enlarges capacity while reducing review emphasis. All Equal cards have identical widths. Pointer and keyboard pinning, Escape, the question controls and shared labels were exercised. Desktop layouts at 1512 × 894 and 1280 × 720, the tall 616 × 1494 layout, and 390 × 844 and 320 × 740 phone layouts have no horizontal overflow; scrolling exposes the complete graph and caption above the controls. Motif and question survive reload, unknown values fall back to the original Network, and the no-query homepage and Scan still render with comparison controls hidden. A bounded live frame trace advanced through a complete nine-second sequence; temporary diagnostics were removed. Module syntax, local HTML asset references, unique IDs and whitespace passed; browser warning/error logs were empty. Reduced-motion and hidden/offscreen handling retain the existing lifecycle. Browser Back was not independently verified. No actual touch hardware or audience-comprehension testing was performed.

## Animated network and relative importance

Question, 23 September: can simpler individual crows, different card sizes and short exchanges make the network more expressive while keeping the homepage quiet? Open `?variant=network`. The preceding `?variant=flock` remains in the comparison bar.

The new study contains twelve cards using six original code-native SVG crow designs: reviews, conversations, context, incidents, control assessments and risk assessments. Their shared lemon circuit glasses, mint eyes and violet silhouettes connect them to the approved identity. Separate head, eye, wing and tail elements support small turns, blinks and feather movements. These are provisional companion glyphs, not a replacement for the approved master mascot.

Six authored routes run through a nine-second sequence each, visiting every crow. A crow notices a signal, bytes travel to a neighbour, another crow responds, and the group settles. Only two crows in the sequence move at once; hovering another can add a third head turn. The artwork retains 55% opacity while interaction labels remain legible at full opacity. The existing requestAnimationFrame loop drives the sequence. Pause, reduced-motion preference, page visibility and the offscreen observer control the same loop.

Hover or keyboard focus reveals a label and highlights adjacent connections. Click, Enter or Space pins that path; activating it again or pressing Escape clears the pin. The label distinguishes evidence sources, requirements, working or feasibility context, and assessments. A lemon corner marker distinguishes assessment cards at rest. Feasibility context connects to programme priorities rather than establishing control operation.

The review bar compares **Equal** and **Weighted** card sizes. Weighted uses predetermined relative emphasis values to change both card and crow dimensions. The transition is smooth during playback and immediate while paused. These values are illustrative design choices, not measured evidence weights, confidence, control effectiveness or a validated decision method. The network uses no actual PRs, resumes, conversations or incident records; source names are examples and do not claim available integrations. State is local to the page and resets on reload.

The implementation adds `crow-glyphs.js`, `network.js` and `network.css`. Glyphs and paths use native SVG elements; labels use `textContent`, and variant selection remains allowlisted. There are no new dependencies, remote requests, persistence or backend changes. The homepage copy, approved image files and no-query page remain available. The study is local and awaiting user review.

The final desktop composition also passed at 1280 × 720. Switching back to Flock and Scan restored their existing artwork and controls, and an unknown variant returned the baseline with the review bar hidden. Reloading Network restored its default weighted view.

Verified the 1511 × 735 desktop, tall 616 × 1494 layout, and 390 × 844 and 320 × 740 phone layouts. Narrow pages scroll to expose the complete graph, caption and footer above the comparison controls, with no horizontal overflow. All twelve Equal cards had identical measured widths; Weighted restored varied sizes. Screenshot and DOM comparisons confirmed complete stillness while paused and changing poses after playback resumed. Pointer selection, keyboard activation, Escape, labels and pinned connections passed. Local asset paths, unique IDs, module syntax and whitespace checks passed; browser warnings and errors were empty. Reduced-motion handling is inherited and was inspected without changing the operating system setting. Real touch hardware and a full accessibility audit were not tested.

## Flock comparison

Question, 23 September: does a network made of many small crows express Crowbo's identity better than the single portrait? The user specifically requested separate crows forming a network, rather than connections forming one large crow silhouette.

Open `?variant=flock` and use the existing comparison bar to return to Scan. Flock adds 22 individual crows in a fixed connected field. Fine paths and moving signal marks give it a terminal character. Hover or click a crow to highlight its neighbours; focus the artwork and press Enter or Space to advance through crows. Pause/Play and the existing reduced-motion, hidden-page and offscreen handling apply. On screens below 380px, the bar shows the current option with previous/next controls to keep all actions within the viewport.

This is a decorative brand study. The topology, relative sizes and path emphasis are authored visual choices, not customer data, measured evidence weights, an agent architecture or an implemented decision model. The approved crow source and crop are reused unchanged; some instances face inward through a canvas transform. Miniatures use a cached sprite-heavy blend so they remain recognisable at small sizes. The complete group retains 55% opacity. Paths and miniature artwork are cached, with one animation loop drawing moving signals and interaction highlights.

The current portrait, earlier motion alternatives, homepage copy and no-query page remain available. The Flock direction is awaiting user review.

Verified at 1511 × 735, the reported tall 616 × 1494 layout, and 390 × 844 and 320 × 740 phone sizes. The graph fits above the comparison bar on desktop; narrow layouts keep it below the copy, and scrolling exposes the full graph above the controls. The phone toolbar stays within the viewport. Browser screenshots confirmed stillness while paused, moving signals during playback, and connection highlighting through pointer movement, click and keyboard activation. Direct Scan/Flock selection, next-option wraparound, left-arrow navigation, reload and the unknown-variant baseline passed. JavaScript module syntax, local HTML asset paths, unique IDs and whitespace checks passed; browser warning/error logs were empty. Reduced-motion and visibility handling were inspected in the existing lifecycle, without changing the operating system preference. Touch hardware was not tested.

## Three original motion studies

Requested on 23 September after the first homepage review. The user prefers Scan and requested smoother motion. The refined Scan remains alongside the other options for review; no final homepage change has been committed. The no-query URL keeps the preceding homepage. The comparison uses the same page so the crow's motion and treatment are the only variables.

- `?variant=scan`: a soft upward sweep crosses a stable hex-character texture. The sweep follows the display refresh rate, with no abrupt character swaps, and travels beyond both image edges before repeating over an 11-second cycle.
- `?variant=stream`: staggered columns of binary and terminal characters travel upward through the silhouette.
- `?variant=rebuild`: small blocks refresh in sequence, briefly showing block and cursor glyphs as they are rewritten.

All three anchor the crow to the bottom right on desktop and crop the torso beyond the lower edge. Narrow layouts keep the crow below the text at its full aspect ratio, inside the page gutters so the crown and beak remain visible. Spare vertical space falls above the crow, keeping it near the footer on tall screens. A mask fades only the lower torso into the background. The source sprite contributes 30% and the terminal canvas 70%; the whole group has 55% opacity, meaning 45% transparency. This is a rendering blend, not a quantitative measure of perceived terminal style.

The review bar switches between the three options, with previous/next and left/right keys, shareable URL parameters, and Pause/Play. It only appears for a recognised variant. Reduced-motion preference starts the study paused. Scan caches its glyph texture once and composites a smooth alpha gradient on each animation frame. Stream and Rebuild retain their 12-frame-per-second cap. The loop stops while the page is hidden, the crow is offscreen, or the user pauses. No source image is edited and no selected brand rule changes.

Verified all three desktop renders, explicit option selection, next-option wraparound, arrow-key selection, Browser Back and reload. Screenshot comparisons confirmed that Pause holds the crow image stable and Play resumes visible changes. Phone checks at 390px and 320px kept the copy above the crow, the toolbar within the viewport and the page free of horizontal overflow. An unknown variant returned the original page with the study controls hidden and its crow button enabled. Local asset references, unique HTML IDs, JavaScript syntax and whitespace checks passed; browser warning/error logs were empty. Reduced-motion handling was inspected in code without changing the operating system setting.

The Scan refinement was checked with a temporary six-second scheduling probe against the actual script. With simulated 60 Hz callbacks, the previous loop painted 66 frames; the new loop painted all 360. At simulated 120 Hz it painted all 720. No glyphs are redrawn during Scan playback. This measures scheduling and drawing operations, not browser GPU performance. Pause and resume passed the probe and browser screenshot checks. Switching to Stream and back to Scan, desktop rendering at 1280 × 720, and the 390 × 844 phone layout also passed, with no browser warnings or errors. Asset URLs carry a fixed version so browser caching does not retain the preceding animation or selection style.

The narrow-layout correction was verified at the reported 616 × 1494 size, 390 × 844 and 320 × 740 phones, a 768 × 1024 tablet, both sides of the 800px breakpoint, and the 1280 × 720 desktop. The earlier 390px-high container clipped 42px from the top of its 532px-high crow. The responsive container now matches the portrait dimensions, leaves room beside the beak, and keeps the copy clear of the artwork. At 616 × 1494 the footer ends at y1364, above the review bar, instead of floating at y975. Shorter screens scroll naturally; scrolling the 320px phone brings the complete crow above the controls. Browser warnings and errors were empty, and the desktop composition retained its existing placement.

## Design

An oversized lowercase wordmark, the line "The decision engine for security teams", two short paragraphs, one contact link and the boxed feather network, with Modular Crow in the top-right corner of the masthead. Typography and open space carry the page. There are no product demonstrations, simulated metrics, feature panels, terminal commands or design-review controls in the visitor flow.

The [brand guide](../../../BRAND.md) owns approved identity elements. The Modular Crow artwork, feather sheets and favicon are used from the parent assets directory. Portrait studies and the no-JavaScript fallback use the full square character image with proportional containment; the earlier presentation-sheet crop no longer applies. Geist Pixel Square is local with its [OFL notice](../licenses/Geist-LICENSE.txt). Body copy uses the system's Georgia serif; the descriptor and links use system monospace.

Text selection uses warm oxide `#D18A66` with near-black background-token lettering `#0C1010`. Sage `#91AA9D` carries the positioning line and paths; chalk `#F5F3E8` carries the wordmark and copy. The new selection colours were checked through computed browser styles.

The feather network uses the existing animation loop for small movements and travelling bytes. Pause/Play, reduced-motion preference, page visibility and the offscreen observer control that loop. Hover or focus reveals an item's role; click or keyboard activation pins its connections, and Escape clears the pin. The comparison arrow shortcuts are disabled on the normal homepage. The company copy and fallback crow remain visible without JavaScript.

Copy follows [the foundation](../../../../docs/FOUNDATION.md). The 24 September revision leads with the broader company vision: helping security teams choose where to spend their effort, explain their choices and revisit them as their business changes. The short public introduction covers the audience and intended benefit without detailing a first workflow or the implementation. "We're building" describes the intended company contribution without claiming demonstrated results or available integrations. No third-party artwork, fonts or website code have been copied from the reference sites.

The revised positioning line, two paragraphs, title and description were checked in the browser at 1280 × 720 and 320 × 740. The copy remains legible without horizontal overflow, and the contact target remains `mailto:enquiries@crowbo.ai`.

The contact link opens the visitor's email application with the user-supplied address, `enquiries@crowbo.ai`. No email is sent by the page. No form, analytics, persistence, remote requests or backend is included.

## Initial homepage verification, 23 September

The direction was accepted on 23 September. These checks describe the initial portrait layout, before the approved 24 September copy and boxed feather homepage. All versions remain local design previews, not deployments.

Verified in the local browser at 1280 × 720, 768 × 1024, 390 × 844 and 320 × 740. The desktop layout fits one viewport. All sizes keep the company copy visible and avoid horizontal overflow; body copy stays at least 19px. Checked keyboard focus and Enter activation, click at phone width, hover-to-bytes, automatic sprite recovery and recovery on pointer leave. The contact target is `mailto:enquiries@crowbo.ai`; no message was sent or delivery tested.

JavaScript syntax, local HTML/CSS/document references, unique HTML IDs and whitespace checks passed. Browser warning/error logs were empty. Reduced-motion handling was inspected in code; the operating system setting was not changed. No-JavaScript content is present directly in HTML, with the decorative interaction initially disabled. These are bounded prototype checks, not a complete accessibility or production-readiness audit.
