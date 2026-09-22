# Command Room, terminal prototype

This second design pass answers: can Crowbo feel like a terminal you can explore while still explaining the security decision product? It follows the user's preference for Command Room and their request for byte effects, useful interaction and a less generic presentation.

Preview from the existing parent artifact server at `/terminal-prototype/`. Or serve `design/homepage-mockups/2026-09-21/` with `python3 -m http.server 0 --bind 127.0.0.1`, then open the printed address followed by `/terminal-prototype/`. The prototype depends on the parent's existing local `assets/` and `licenses/` directories. No installation is needed.

## Direction and sketches considered

| Sketch | Structure | Assessment |
| --- | --- | --- |
| Command-only | Prompt, output history, ASCII familiar, all navigation through commands | Strong terminal character, but hides the product explanation and makes touch exploration harder. |
| Full TUI workspace | File tree, persistent inspector, evidence and trace panes filling the viewport | Strong product demonstration, but reads as the app rather than a public homepage. |
| Terminal homepage with a working lab | Compact monospace introduction, byte-rendered crow, file-based lab, persistent optional prompt | Selected for this prototype. Gives the identity room while making the terminal behaviour useful. |

The selected Command Room direction is refined here. These layout sketches remain exploration notes; this prototype implements the third structure. The earlier three-way comparison retains its layouts and uses the current selected mascot.

## References inspected on 21 September 2026

Six live homepages were opened and visually inspected. These are design observations, not claims about their products or an exhaustive survey of terminal websites.

| Reference | Observed design | Applied principle |
| --- | --- | --- |
| [Turbopuffer](https://turbopuffer.com/) | Monospace density, ASCII architecture diagram, useful calculator, ruled layout | Treat the interface as structured information. Build an interactive example into the page. |
| [OpenCode](https://opencode.ai/) | Pixel identity, monospace, quiet dividing rules, command installation tabs | Few shapes, strong type, practical controls. |
| [Terminal](https://www.terminal.shop/) | Numbered editor lines, file-like navigation, SSH command as the main action | Command vocabulary should organise the experience. |
| [Ghostty](https://ghostty.org/) | A character represented as character art inside a terminal frame | Give the crow a live character rendering. |
| [Modal](https://modal.com/) | Green accents, generous spacing, technical demos and interactive workload choices | Useful product interaction and clear hierarchy. Its current soft, rounded visual style is not this direction. |
| [Charm](https://charm.land/) | Expressive mascots, playful copy and colourful product identity | Retain personality in an engineering product. Its gradients and expansive hero are not adopted. |

No third-party artwork, screenshots, source code or fonts were copied from these sites. The reference desk links to the originals.

## Identity and behaviour

- The approved lowercase wordmark uses Geist Pixel Square, weight 400, tracking -0.04em. No glow or shadows.
- Departure Mono is the interface and body font. The existing crow ink, midnight, mint, lemon and ivory palette is retained.
- The favicon is the [Circuit Frames V3 head derivative](../../../BRAND.md#favicon). Its framing and accents were simplified for browser-tab sizes; [favicon-preview.html](favicon-preview.html) shows it at 16, 32, 48 and 128 pixels on dark and light surfaces.
- Links and selected labels scramble through hexadecimal characters on hover or focus, then resolve. Stable accessible text remains available and label width is held during the effect.
- The [selected Archivist, Circuit Frames V3](../../../BRAND.md) starts in sprite view. With effects enabled, hovering reveals coloured hexadecimal characters and leaving restores the sprite. The sprite/bytes controls can select either view, and clicking or the `peck` command briefly scatters the bytes. The served PNG is an unchanged copy of the refined V3 source, with wearable circuit spectacles and more expressive mint eyes. Both views show the same rectangle (x 100, y 160, width 1000, height 950) to exclude its presentation caption.
- The prompt recognises a small fixed command vocabulary. `/` focuses it, `?` opens help, arrows recall command history and Tab completes an unambiguous prefix. Mouse and touch controls expose the same core actions.
- The lab lets people inspect fact provenance, compare alternatives, change a hypothetical throughput and retain up to six assessment revisions. No owner decision or execution is simulated by merely clicking reassess.
- Motion starts disabled for `prefers-reduced-motion`, and the visible effects control can pause it. The crow loop only runs during interaction while visible. Hidden-page animation work is cancelled.

## Product boundaries

Inputs derive from the public fictional case in `docs/EVALUATION.md`: USD 120k annual budget, 12 incoming and 8 completed findings per week, 32 overdue, USD 60k tool and USD 90k capacity options. Coverage and capacity variations remain explicitly fictional and their recommendations are assistant-authored candidates.

The queue chart performs simple steady-rate arithmetic: `max(0, 32 + week * (12 - assumed_completions))`. Clearance is `32 / (assumed_completions - 12)` only if the denominator is positive. Raising a slider does not establish achievable capacity or lower risk. The unresolved bottleneck scenario therefore keeps asking for the cause even if the hypothetical throughput is raised. The capacity case challenges any proposed rate at or below incoming demand. Actual decision quality is not evaluated by this prototype.

All state is temporary. The command prompt dispatches fixed functions; it never runs a shell, model, network request or remote action. Input length and histories are capped. DOM output uses `createElement`, `replaceChildren` and `textContent`. Runtime assets are local and the Content Security Policy blocks remote connections and form submissions. Existing font licences remain in the parent `licenses/` directory.

## Review status

Verified in the Codex browser on 22 September 2026 at 1280px desktop, 768px tablet and 390px phone widths. The page had no horizontal overflow and both local fonts loaded. JavaScript syntax validation passed and the browser reported no warnings or errors.

The review exercised scenario changes, source inspection, all three file views, the capacity slider by keyboard, reassessment, a capacity plan that cannot clear incoming work, and the six-record trace limit. The prompt accepted commands and autocomplete, rejected an out-of-range value without changing capacity, and displayed HTML-like input as literal text with no injected image element. Help, command output dismissal, sprite/bytes switching, the peck effect and the visible effects pause were checked. Focus-triggered scrambling retained its stable accessible label. Reduced-motion preference handling is implemented; the runtime check used the explicit effects toggle rather than changing the operating system preference.

Browser inspection found and fixed responsive line-break spacing, temporary label widths and a canvas pulse that could remain visually disturbed after expiry. These checks cover this local mockup, not decision quality or a complete accessibility audit.

After the mascot selection on 22 September, verified the Archivist in sprite and byte views at 1280px and 390px widths, with no horizontal overflow. The left mint edge and full silhouette fit the shared crop without the concept caption. Clicking the mascot triggered the byte effect, the effects toggle returned it to the still sprite, and `whoami` reported the Archivist. The browser reported no warnings or errors. JavaScript syntax validation passed, and the served PNG hash matched the selected source. CSS and script URLs include a fixed version query so an older cached crop cannot be paired with the new artwork.

This remains a local design prototype. The next design decision is whether this terminal structure and interaction intensity should become Crowbo's main website direction.

Circuit Frames V3 verification on 22 September 2026: the refined source displayed in sprite and byte views at 1280px and 390px widths without page overflow or the presentation caption. Hover changed SPRITE to HEX and leaving restored SPRITE. Explicit view controls, click-to-peck and effects-off were exercised. The favicon preview showed the new derivative at 16, 32, 48 and 128 pixels on dark and light surfaces; at 16 pixels the silhouette and colour accents carry recognition, not the individual gate details. No browser warnings or errors were observed. JavaScript syntax, local links and byte identity between both runtime copies and their masters passed.
