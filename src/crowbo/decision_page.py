"""A private, static view of access-checked decisions. No browser inference or writes."""

import json
import os
from html import escape

from .runtime import CrowboError, outside_checkout

STYLE = """
:root{color-scheme:dark;--bg:#10101b;--panel:#1b1929;--line:#393448;--text:#f3e9d5;
--muted:#bdb7c8;--accent:#d18a66;--mint:#a4edc3}*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,sans-serif}
a{color:var(--mint)}header{padding:20px 5%;border-bottom:1px solid var(--line);display:flex;
align-items:center;gap:32px;position:sticky;top:0;background:var(--bg);z-index:1}
.brand{font:700 27px monospace;letter-spacing:-1.5px;color:var(--text)}nav{display:flex;gap:24px;flex-wrap:wrap}
nav a{text-decoration:none}main{max-width:1180px;margin:auto;padding:32px 28px 80px}
h1{font-size:36px;line-height:1.2;max-width:900px}h2{font-size:25px}h3{font-size:19px}
p{margin:10px 0}.eyebrow,.meta{color:var(--muted);font-size:13px}.eyebrow{letter-spacing:.1em;text-transform:uppercase}
.notice{border-left:3px solid var(--accent);padding:12px 18px;background:#28202a}
.hero{border-top:4px solid var(--accent);background:var(--panel);padding:26px;border-radius:8px;margin:24px 0}
.recommendation{font-size:22px;line-height:1.5}.grid{display:grid;grid-template-columns:1.6fr 1fr;gap:24px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:20px;margin:16px 0}
section{scroll-margin-top:100px;margin-top:40px}.tag{font-size:12px;padding:4px 9px;border:1px solid var(--accent);border-radius:20px;color:#ecc5ae}
details{border-top:1px solid var(--line);padding:13px 0}summary{cursor:pointer;font-weight:600}
blockquote{border-left:2px solid var(--accent);margin:12px 0;padding:0 16px;white-space:pre-wrap}
dl{display:grid;grid-template-columns:130px 1fr;gap:10px 16px}dt{color:var(--muted)}dd{margin:0}
pre{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:10px}
.muted{color:var(--muted)}li{margin:8px 0}.timeline{border-left:2px solid var(--accent);padding-left:22px}
:target{outline:1px solid var(--mint);outline-offset:8px}footer{margin-top:50px;color:var(--muted);font-size:13px}
@media(max-width:760px){header{position:static;display:block}nav{gap:16px;margin-top:12px}.grid{display:block}
h1{font-size:29px}main{padding:24px 18px}dl{grid-template-columns:95px 1fr}table{font-size:12px}}
"""


def html_text(value):
    return escape(str(value), quote=True)


def items(values):
    return "<ul>" + "".join(f"<li>{html_text(v)}</li>" for v in values) + "</ul>"


def access_markup(facts):
    pieces = [
        '<article class="card"><h3>Account and scope</h3>',
        f"<pre>{html_text(json.dumps(facts['subject'], indent=2))}</pre><dl>",
    ]
    for name in ("identity", "required_work", "current_access", "dependencies", "period"):
        fact = facts[name]
        pieces.append(
            f"<dt>{html_text(name.replace('_', ' '))}</dt><dd>{html_text(fact['value'] or 'Unknown')} · {html_text(fact['state'])}"
        )
        for citation in fact["citations"]:
            pieces.append(f"<blockquote>{html_text(citation['quote'])}</blockquote>")
        pieces.append("</dd>")
    pieces.append("</dl></article><h3>Options for this account</h3>")
    for option in facts["options"]:
        chosen = " · Recommended" if option["kind"] == facts["selected_option"] else ""
        pieces.append(
            f'<article class="card"><h3>{html_text(option["description"])}{chosen}</h3><p>Workflow fit: {html_text(option["workflow_fit"])}</p>'
        )
        for name in ("exposure_change", "operational_cost", "reverses_when"):
            pieces.append(f"<p>{html_text(name.replace('_', ' '))}: {html_text(option[name])}</p>")
        pieces.append(items(option["conditions"]))
        for citation in option["basis"]["citations"]:
            pieces.append(f"<blockquote>{html_text(citation['quote'])}</blockquote>")
        pieces.append("</article>")
    for name in ("custodian", "approval_authority"):
        person = facts.get(name)
        pieces.append(
            f"<p>{html_text(name.replace('_', ' '))}: {html_text(person['identifier'] if person else 'Unresolved')}</p>"
        )
    deadline = facts.get("deadline")
    pieces.append(f"<p>Deadline: {html_text(deadline['date'] if deadline else 'Unresolved')}</p>")
    if check := facts.get("next_check"):
        pieces.append(
            f"<h3>Deciding check</h3><p>{html_text(check['question'])}</p><p>{html_text(check['changes_choice_if'])}</p>"
        )
    return "".join(pieces)


def render_decision_page(results, feedback):
    latest = results[-1]
    request, answer = latest["decision"]["request"], latest["answer"]
    last = len(results) - 1
    facts = latest["decision"].get("deciding_facts", {})
    cards = facts.get("deliverables", [])
    access = latest["decision"].get("access_facts")
    pieces = [
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">",
        f"<title>Crowbo | {html_text(request['subject'])}</title><style>{STYLE}</style>",
        '<header><span class="brand">crowbo</span><nav aria-label="Case navigation"><a href="#nest">Nest</a><a href="#flock">Flock</a><a href="#feathers">Feathers</a><a href="#flight-log">Flight log</a></nav></header><main>',
        '<p class="notice">Private snapshot · Simulated advice · Read only. Access was checked when exported. This file cannot enforce later permission changes.</p>',
        '<section id="nest"><p class="eyebrow">Nest / Decision workspace</p>',
        f"<h1>{html_text(request['subject'])}</h1><p>{html_text(request['question'])}</p>",
        f'<p class="meta">{html_text(request["window_start"])} to {html_text(request["window_end"])} · {html_text(request["scope"])}</p>',
        '<div class="hero"><span class="tag">Proposed next step</span>',
        f'<p class="recommendation">{html_text(answer["recommendation"])}</p>',
        f'<p class="meta">Version {html_text(request["case_version"])} · Created {html_text(latest["created_at"])}</p></div>',
        f'<div class="grid"><div><h2>Why this step</h2><p>{html_text(answer["rationale"])}</p><h3>Alternatives</h3>{items(answer["alternatives"])}</div>',
        f'<aside class="card"><h3>What remains unresolved</h3>{items(answer["uncertainties"])}<p class="meta">A recommendation does not allocate capacity, approve work or record customer acceptance.</p></aside></div>',
        '<h2>Deciding facts</h2><p class="muted">Quotes match their stored sources. The model’s interpretation and its association with this decision still need review.</p>',
    ]
    for card in cards:
        pieces.append(f'<article class="card"><h3>{html_text(card["title"])}</h3><dl>')
        for name, fact in card["facts"].items():
            pieces.append(
                f'<dt>{html_text(name.capitalize())}</dt><dd>{html_text(fact["value"] or "Unknown")} <span class="meta">{html_text(fact["state"])}</span>'
            )
            for citation in fact["citations"]:
                label = citation["evidence_id"]
                pieces.append(
                    f'<details><summary>Read {html_text(label)} excerpt</summary><blockquote>{html_text(citation["quote"])}</blockquote><a href="#v{last}-{html_text(label)}">Open source and revision</a></details>'
                )
            pieces.append("</dd>")
        pieces.append("</dl></article>")
    if access:
        pieces.append(access_markup(access))
    if not cards and not access:
        pieces.append("<p>No structured facts were produced for this version.</p>")
    pieces.extend(
        [
            '</section><section id="flock"><p class="eyebrow">Flock / People and agents</p><h2>Who is involved?</h2>',
            f"<p>Accountable owner supplied for this case: {html_text(request.get('accountable_owner') or 'Unconfirmed')}.</p>",
            '<p class="muted">Source participation and model attribution do not establish decision authority or spare capacity.</p>',
        ]
    )
    for card in cards:
        owner = card["facts"]["owner"]
        pieces.append(
            f"<p><strong>{html_text(card['title'])}</strong>: {html_text(owner['value'] or 'Owner unresolved')}.</p>"
        )
    pieces.append(
        "<p>Crowbo proposes advice. The configured operator records feedback. An accountable person must confirm resource decisions separately.</p></section>"
    )
    pieces.append(
        '<section id="feathers"><p class="eyebrow">Feathers / Cited evidence</p><h2>Inspect the basis</h2><p class="muted">Selected records only. Open a source to read the exact text retained with that recommendation.</p>'
    )
    for index, result in enumerate(results):
        pieces.append(f"<h3>Version {html_text(result['decision']['request']['case_version'])}</h3>")
        for entry in result["evidence"]:
            source = entry["source"]
            pieces.append(
                f'<details id="v{index}-{html_text(entry["id"])}"><summary>{html_text(entry["id"])} · {html_text(source["title"])}</summary>'
            )
            pieces.append(
                f'<p class="meta">Revision {html_text(next(b["revision_id"] for b in result["decision"]["bindings"] if b["source_id"] == entry["source_id"]))}<br>Content checked {html_text(entry.get("last_checked_at") or source["observed_at"])}</p>'
            )
            pieces.append(
                f'<a href="{html_text(source["source_url"])}" rel="noreferrer noopener" target="_blank">Open original source</a><pre>{html_text(source["text"])}</pre></details>'
            )
    rows = facts.get("jev", [])
    if rows:
        pieces.append(
            "<details><summary>Jev interpretations used by this answer</summary><p>These values are read directly from the cited assessment. They are not event probabilities or a priority score.</p><table><tr><th>Source</th><th>Question</th><th>Stored answer</th></tr>"
        )
        for row in rows:
            pieces.append(
                f"<tr><td>{html_text(row['evidence_id'])}</td><td>{html_text(row['question_id'])}</td><td>{html_text(json.dumps(row['answer']))}</td></tr>"
            )
        pieces.append("</table></details>")
    pieces.append(
        '</section><section id="flight-log"><p class="eyebrow">Flight log / Decision history</p><h2>What changed?</h2><div class="timeline">'
    )
    applied = {r["decision"]["request"].get("prior_feedback_id") for r in results}
    for result in results:
        version = result["decision"]["request"]["case_version"]
        pieces.append(
            f'<article class="card"><h3>Recommendation {html_text(version)}</h3><p>{html_text(result["answer"]["recommendation"])}</p>'
        )
        pieces.append(
            f'<p class="meta">Retained result {html_text(result["id"])} · {html_text(result["created_at"])}</p>'
        )
        pieces.append(
            f"<details><summary>Read rationale and alternatives</summary><p>{html_text(result['answer']['rationale'])}</p>{items(result['answer']['alternatives'])}</details></article>"
        )
        for note in feedback:
            if note["request"]["result_id"] != result["id"]:
                continue
            state = (
                "Included in the displayed reassessment"
                if note["id"] in applied
                else "Saved; not used in the displayed versions"
            )
            pieces.append(
                f'<article class="card"><span class="tag">Correction saved</span><h3>{state}</h3><p>{html_text(note["request"]["rationale"])}</p>'
            )
            pieces.append(items(c["statement"] for c in note["request"]["corrections"]))
            pieces.append(
                '<p class="meta">Attributed feedback. No verified authority, outcome or automatic learning.</p></article>'
            )
    pieces.extend(
        [
            "</div></section><footer>This prototype reads saved backend results. It cannot edit sources, save feedback, rerun reasoning or execute recommendations.</footer></main></html>"
        ]
    )
    return "".join(pieces)


def export_decision_page(path, results, feedback):
    path = outside_checkout(path)
    if not results or len({r["decision"]["request"]["case_id"] for r in results}) != 1:
        raise CrowboError("Export requires saved versions of one decision case")
    markup = render_decision_page(sorted(results, key=lambda r: r["created_at"]), feedback)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(markup)
    return path
