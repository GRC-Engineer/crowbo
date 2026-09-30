import { CrowboError } from "../domain/errors";
import { micros } from "../domain/time";
import { STYLE } from "./decision-page-style";

/** A private, static view of access-checked decisions. No browser inference or writes. */

/** Python `html.escape(str(value), quote=True)`. */
export function htmlText(value: unknown): string {
  const text = value === null || value === undefined ? "None" : typeof value === "boolean" ? (value ? "True" : "False") : String(value);
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

const items = (values: Iterable<unknown>) => `<ul>${[...values].map((v) => `<li>${htmlText(v)}</li>`).join("")}</ul>`;
const words = (name: string) => name.replaceAll("_", " ");

/** Python `json.dumps(value)` with its default separators and key order. */
function pythonJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(", ")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${pythonJson(v)}`).join(", ")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return value === undefined ? "null" : JSON.stringify(value);
}

function accessMarkup(facts: Record<string, any>): string {
  const pieces = ['<article class="card"><h3>Account and scope</h3>', `<pre>${htmlText(JSON.stringify(facts.subject, null, 2))}</pre><dl>`];
  for (const name of ["identity", "required_work", "current_access", "dependencies", "period"]) {
    const fact = facts[name];
    pieces.push(`<dt>${htmlText(words(name))}</dt><dd>${htmlText(fact.value || "Unknown")} · ${htmlText(fact.state)}`);
    for (const citation of fact.citations) pieces.push(`<blockquote>${htmlText(citation.quote)}</blockquote>`);
    pieces.push("</dd>");
  }
  pieces.push("</dl></article><h3>Options for this account</h3>");
  for (const option of facts.options) {
    const chosen = option.kind === facts.selected_option ? " · Recommended" : "";
    pieces.push(`<article class="card"><h3>${htmlText(option.description)}${chosen}</h3><p>Workflow fit: ${htmlText(option.workflow_fit)}</p>`);
    for (const name of ["exposure_change", "operational_cost", "reverses_when"]) pieces.push(`<p>${htmlText(words(name))}: ${htmlText(option[name])}</p>`);
    pieces.push(items(option.conditions));
    for (const citation of option.basis.citations) pieces.push(`<blockquote>${htmlText(citation.quote)}</blockquote>`);
    pieces.push("</article>");
  }
  for (const name of ["custodian", "approval_authority"]) {
    const person = facts[name];
    pieces.push(`<p>${htmlText(words(name))}: ${htmlText(person ? person.identifier : "Unresolved")}</p>`);
  }
  const deadline = facts.deadline;
  pieces.push(`<p>Deadline: ${htmlText(deadline ? deadline.date : "Unresolved")}</p>`);
  const check = facts.next_check;
  if (check) pieces.push(`<h3>Deciding check</h3><p>${htmlText(check.question)}</p><p>${htmlText(check.changes_choice_if)}</p>`);
  return pieces.join("");
}

export function renderDecisionPage(results: Record<string, any>[], feedback: Record<string, any>[]): string {
  const latest = results.at(-1)!;
  const request = latest.decision.request;
  const answer = latest.answer;
  const last = results.length - 1;
  const facts = latest.decision.deciding_facts ?? {};
  const cards: any[] = facts.deliverables ?? [];
  const access = latest.decision.access_facts;
  const pieces = [
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">",
    `<title>Crowbo | ${htmlText(request.subject)}</title><style>${STYLE}</style>`,
    '<header><span class="brand">crowbo</span><nav aria-label="Case navigation"><a href="#nest">Nest</a><a href="#flock">Flock</a><a href="#feathers">Feathers</a><a href="#flight-log">Flight log</a></nav></header><main>',
    '<p class="notice">Private snapshot · Simulated advice · Read only. Access was checked when exported. This file cannot enforce later permission changes.</p>',
    '<section id="nest"><p class="eyebrow">Nest / Decision workspace</p>',
    `<h1>${htmlText(request.subject)}</h1><p>${htmlText(request.question)}</p>`,
    `<p class="meta">${htmlText(request.window_start)} to ${htmlText(request.window_end)} · ${htmlText(request.scope)}</p>`,
    '<div class="hero"><span class="tag">Proposed next step</span>',
    `<p class="recommendation">${htmlText(answer.recommendation)}</p>`,
    `<p class="meta">Version ${htmlText(request.case_version)} · Created ${htmlText(latest.created_at)}</p></div>`,
    `<div class="grid"><div><h2>Why this step</h2><p>${htmlText(answer.rationale)}</p><h3>Alternatives</h3>${items(answer.alternatives)}</div>`,
    `<aside class="card"><h3>What remains unresolved</h3>${items(answer.uncertainties)}<p class="meta">A recommendation does not allocate capacity, approve work or record customer acceptance.</p></aside></div>`,
    "<h2>Deciding facts</h2><p class=\"muted\">Quotes match their stored sources. The model’s interpretation and its association with this decision still need review.</p>",
  ];
  for (const card of cards) {
    pieces.push(`<article class="card"><h3>${htmlText(card.title)}</h3><dl>`);
    for (const [name, fact] of Object.entries<any>(card.facts)) {
      pieces.push(`<dt>${htmlText(name.charAt(0).toUpperCase() + name.slice(1).toLowerCase())}</dt><dd>${htmlText(fact.value || "Unknown")} <span class="meta">${htmlText(fact.state)}</span>`);
      for (const citation of fact.citations) {
        const label = citation.evidence_id;
        pieces.push(
          `<details><summary>Read ${htmlText(label)} excerpt</summary><blockquote>${htmlText(citation.quote)}</blockquote><a href="#v${last}-${htmlText(label)}">Open source and revision</a></details>`,
        );
      }
      pieces.push("</dd>");
    }
    pieces.push("</dl></article>");
  }
  if (access) pieces.push(accessMarkup(access));
  if (!cards.length && !access) pieces.push("<p>No structured facts were produced for this version.</p>");
  pieces.push(
    '</section><section id="flock"><p class="eyebrow">Flock / People and agents</p><h2>Who is involved?</h2>',
    `<p>Accountable owner supplied for this case: ${htmlText(request.accountable_owner || "Unconfirmed")}.</p>`,
    '<p class="muted">Source participation and model attribution do not establish decision authority or spare capacity.</p>',
  );
  for (const card of cards) pieces.push(`<p><strong>${htmlText(card.title)}</strong>: ${htmlText(card.facts.owner.value || "Owner unresolved")}.</p>`);
  pieces.push("<p>Crowbo proposes advice. The configured operator records feedback. An accountable person must confirm resource decisions separately.</p></section>");
  pieces.push(
    '<section id="feathers"><p class="eyebrow">Feathers / Cited evidence</p><h2>Inspect the basis</h2><p class="muted">Selected records only. Open a source to read the exact text retained with that recommendation.</p>',
  );
  results.forEach((result, index) => {
    pieces.push(`<h3>Version ${htmlText(result.decision.request.case_version)}</h3>`);
    for (const entry of result.evidence) {
      const source = entry.source;
      pieces.push(`<details id="v${index}-${htmlText(entry.id)}"><summary>${htmlText(entry.id)} · ${htmlText(source.title)}</summary>`);
      const binding = result.decision.bindings.find((b: any) => b.source_id === entry.source_id);
      pieces.push(`<p class="meta">Revision ${htmlText(binding.revision_id)}<br>Content checked ${htmlText(entry.last_checked_at || source.observed_at)}</p>`);
      pieces.push(`<a href="${htmlText(source.source_url)}" rel="noreferrer noopener" target="_blank">Open original source</a><pre>${htmlText(source.text)}</pre></details>`);
    }
  });
  const rows: any[] = facts.jev ?? [];
  if (rows.length) {
    pieces.push(
      "<details><summary>Jev interpretations used by this answer</summary><p>These values are read directly from the cited assessment. They are not event probabilities or a priority score.</p><table><tr><th>Source</th><th>Question</th><th>Stored answer</th></tr>",
    );
    for (const row of rows) pieces.push(`<tr><td>${htmlText(row.evidence_id)}</td><td>${htmlText(row.question_id)}</td><td>${htmlText(pythonJson(row.answer))}</td></tr>`);
    pieces.push("</table></details>");
  }
  pieces.push('</section><section id="flight-log"><p class="eyebrow">Flight log / Decision history</p><h2>What changed?</h2><div class="timeline">');
  const applied = new Set(results.map((r) => r.decision.request.prior_feedback_id));
  for (const result of results) {
    pieces.push(`<article class="card"><h3>Recommendation ${htmlText(result.decision.request.case_version)}</h3><p>${htmlText(result.answer.recommendation)}</p>`);
    pieces.push(`<p class="meta">Retained result ${htmlText(result.id)} · ${htmlText(result.created_at)}</p>`);
    pieces.push(`<details><summary>Read rationale and alternatives</summary><p>${htmlText(result.answer.rationale)}</p>${items(result.answer.alternatives)}</details></article>`);
    for (const note of feedback) {
      if (note.request.result_id !== result.id) continue;
      const state = applied.has(note.id) ? "Included in the displayed reassessment" : "Saved; not used in the displayed versions";
      pieces.push(`<article class="card"><span class="tag">Correction saved</span><h3>${state}</h3><p>${htmlText(note.request.rationale)}</p>`);
      pieces.push(items(note.request.corrections.map((c: any) => c.statement)));
      pieces.push('<p class="meta">Attributed feedback. No verified authority, outcome or automatic learning.</p></article>');
    }
  }
  pieces.push("</div></section><footer>This prototype reads saved backend results. It cannot edit sources, save feedback, rerun reasoning or execute recommendations.</footer></main></html>");
  return pieces.join("");
}

/** Validate a set of versions for export: one case only, ordered by creation time. */
export function exportableVersions(results: Record<string, any>[]) {
  if (!results.length || new Set(results.map((r) => r.decision.request.case_id)).size !== 1) {
    throw new CrowboError("Export requires saved versions of one decision case");
  }
  return [...results].sort((a, b) => (micros(a.created_at) < micros(b.created_at) ? -1 : micros(a.created_at) > micros(b.created_at) ? 1 : 0));
}
