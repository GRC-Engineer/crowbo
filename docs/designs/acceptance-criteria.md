# Acceptance criteria: what a first paid pilot buys

This page defines what Crowbo must do in a first paid pilot's first two months, roughly to mid-December. Each criterion is a check a reviewer can run. Each failing one comes with a build spec, so work can start the day the backend build is approved.

Every criterion carries one of three labels:
- **True on fixtures:** passes today, on the demo company.
- **Failing until built:** written now, and failing on purpose.
- **Decided:** a design choice, not a test.

A criterion with a part that is already true keeps the label of the part that is not. The true part is listed under regression, so it stays true.

The checks are in [`backend/test/acceptance/criteria.test.ts`](../../backend/test/acceptance/criteria.test.ts). To run them:

```bash
cd backend && bunx vitest run test/acceptance
```

A failing criterion is written as an `it.fails` test, so the suite stays green. It calls the operation or module the work will add, and fails on the behaviour it asserts, never on a missing name. When the work lands, that test starts passing and vitest reports it as an error. The label then has to change here and in the test. All checks use fixtures only, with no third-party data.

Architecture: [ENGINE.md](../ENGINE.md). The decision rule: [ADR 0002](../adr/0002-deterministic-risk-arithmetic-decides.md). Judgment quality: [EVALUATION.md](../EVALUATION.md).

## The pilot in one line

A security lead gets a weekly fix-or-drop list in their own Slack. It is built from their knowledge base and three of their tools. Each move carries its evidence, a named decider and a date. Their corrections make the next week's list better.

## Pilot criteria for mid-December

| ID | Criterion | Label |
| --- | --- | --- |
| P1 | A knowledge-base export produces a first company profile within a day | True on fixtures (a synthetic export) |
| P1.1 | PDF and DOCX files in the export are read: a PDF with known text yields a quoted fact | Failing until built |
| P1.2 | An export produces first next moves from the profile's own defaults, with no pre-authored scenarios or actions | Failing until built: needs the register |
| P2 | Three real connectors, read-only, feed the weekly fix-or-drop list | Failing until built |
| P2.1 | Prose from real sources is extracted live by Clef, with precision at 0.8 and recall measured on 50 labelled sentences | Failing until built |
| P3 | A mention in Slack answers with the card: citations, a named decider and a date, with no assistant needed | True on fixtures |
| P3.1 | The card and the weekly list are delivered to a workspace: a signed event gets a threaded reply, and the weekly post goes out on schedule | Failing until built |
| P4 | A call recorded where the pilot works changes the next answer, and the answer cites it | Failing until built: P4.1 and P4.2. The engine part is R8 |
| P4.1 | A call recorded from a Slack thread keeps the thread's permalink as provenance | Failing until built |
| P4.2 | Repeated corrections yield a weight proposal; accepting it is recorded and recomputes the ranking | Failing until built |
| P5 | The weekly brief reaches the security lead in plain words: moves with sources, deciders and dates, hours back, evidence not used | Failing until built: delivery is P3.1. The format is R9 |

### Build specs

**P1. From export to first profile.** Split in review: P1 is the profile; P1.2 is the first moves.
- **Input:** a folder or archive of the customer's policies, risk register and last audit report (PDF, DOCX, Markdown, CSV).
- **Build:** an import operation that registers each file as a prose or typed record, extracts quoted facts through the evaluation gate, and registers the subjects it finds.
- **Output:** a first next-moves list on default weights, plus a profile: the systems, owners, controls and stale entries it found.
- **Check:** on a synthetic export it returns a profile (systems with owners, controls with assignees, stale entries) in one run.
- **Size:** about 3–4 days.
- **Built:** `engine_import_knowledge_base`, over [`kb.ts`](../../backend/src/engine/kb.ts).
  - Markdown and text are read as prose, and their facts must quote the file.
  - A CSV is typed only when the person importing it maps it: `triples` for subject, field and value columns, or `columns` with a subject column. Unmapped CSV is prose.
  - Typed rows may state only predicates the engine declares importable, never one it derives (such as unused counts). Their facts are kind `imported`, never mistaken for a connector's.
  - The export is one more source, `kb`, weighted 3 with a 180-day limit until the company sets its own. That default is kept in memory as a weight change with its reason, the first time a file is read. Each file's edit date drives freshness.
  - Re-importing an unchanged export writes nothing. Memory keeps a digest of each file, never its text, and the declaration that the export is synthetic.
  - Only a synthetic export is accepted, checked at the operation and again in the engine, until the founders clear real exports.
  - The profile keeps the current Scenario and Action shapes. The register is meant to replace `kbProfile`, not the import.

**P1.2. First moves from an export.**
- **Today:** the moves in P1's profile come from the demo company's pre-authored scenarios and actions. With none authored, an export yields a profile and no moves.
- **Build:** default scenarios and actions that the profile proposes from what it found. This is the register, awaiting sign-off.
- **Check:** with no pre-authored scenarios or actions, the move list is empty before the import and not empty after.

**P1.1. PDF and DOCX.**
- **Today:** listed as not read, with the reason.
- **Build:** read their text in the Worker, or take text the harness already extracted.
- **Check:** a PDF with known text, imported through the operation, is read as prose and yields a fact quoting that text.
- **Size:** about 1 day.

**P2. Three real connectors.**
- **Build:** pick the three that the pilot's first case needs, likely the identity provider, the ticketing tool and the incumbent compliance platform.
  - Each connector is the existing mapping code, pointed at the real API by configuration.
  - Each has read-only scopes, a sync schedule and stores no credentials in the repo.
- **Check:** at least three connectors each read a recorded response from the real API (`backend/test/fixtures/recorded/`) into records.
- **Size:** 1–2 days each.

**P2.1. Clef live.**
- **Build:** run the Clef extractor through the Workers AI binding on the pilot's prose sources. Write and label 50 sentences, and report precision at the 0.8 threshold and recall.
- **Check:** the labelled sample and a results file exist, and the report states both numbers.
- **Size:** about 1 day, plus the labelling.

**P3. The list in Slack.**
- **Build:** a Slack app, as a surface over the same engine operations.
  - It posts the weekly list to one channel.
  - A mention in a thread answers with the card: numbered sources, the move, decider and date.
  - It works where no AI assistant is deployed.
  - It never posts unprompted except the weekly list, and never sends on anyone's behalf.
- **Check:** on fixtures, a scripted mention returns the card with numbered citations, the decider and a date.
- **Size:** about 3–4 days.
- **Built:** [`surfaces/slack.ts`](../../backend/src/surfaces/slack.ts), over the same operations as MCP.
  - A mention answers with the card: the question, the case and method version, the next action, the trade-off and what it was ranked against, the status (decider, deliverer, due date, last outcome), numbered sources with weight and freshness, unresolved evidence, and the result ID.
  - "brief" returns the weekly list. A direct message carrying an export runs the P1 import and replies with the first profile.
  - Without a model, the card is the computed answer alone. With one, the model only routes the question and phrases a summary checked against the sources; the ranking is the same either way.
  - Text from questions, sources and models is escaped, so it cannot become a link, a mention or a broadcast.

**P3.1. Delivered to a workspace.**
- **Build:** the events endpoint that verifies Slack's signature and replay window, replies in the thread, and posts the weekly list to one configured channel on a schedule. Plus the app manifest and setup steps.
- **Check:** a signed `app_mention` event, with a fake Slack API, produces one threaded reply carrying the card.
- **Size:** about 1–2 days.

**P4.1. Corrections from Slack.**
- **Build:** "record this" in a thread writes the call. The thread's permalink becomes the call's provenance.
- **Check:** a call recorded with a thread permalink keeps it as provenance, and the next answer cites it.
- **Size:** about 1 day, on top of P3.

**P4.2. From correction to weight.**
- **Build:** an accept-proposal operation.
  - It applies the proposed weight.
  - It records the acceptance against the proposal.
  - It recomputes the decision and reports why the ranking moved.
- **Check:** after two disputes of one source, accepting the proposal changes the weight, the memory links the change to the proposal, and the decision diff names that source.
- **Size:** about 1 day.

**Reviewed, not tested.** One more outcome is judged by the pilot, not by a test: a CISO at the pilot forwards the brief to their leadership without editing it. The brief should open with what the security lead did not already know that week.

Build order, riskiest first: P1, P3, P2, P2.1, P4.1, P4.2. That totals about 3 weeks of focused work. P1 and P3 are built. P3.1 delivers P3 to a workspace. P1.1 follows when a pilot's export needs it, and P1.2 follows the register.

## Regression: already true on fixtures

These must stay true while the pilot work is built.

| ID | Criterion |
| --- | --- |
| R1 | The same inputs give the same decision ID, and the same question twice gives the same answer |
| R2 | Decision memory is hash chained; editing any entry breaks the chain |
| R3 | Text in an untrusted source changes no number, owner or date (the 31-to-30 regression) |
| R4 | Who decides, who delivers and by when come from graph edges, each with its source revisions; the due date cites the ticketing tool |
| R5 | Stale or conflicting evidence stays unresolved and uncited; missing evidence defers the move and names the missing fact (an information request) |
| R6 | A decision is an input-addressed record with a defined field list, countable and exportable |
| R7 | The engine is served over MCP, so any MCP client lists and calls the same tools |
| R8 | A recorded call changes the next answer, and the answer cites decision memory (the engine part of P4) |
| R9 | The weekly brief reads in plain words: moves with sources, deciders and dates, hours back, evidence not used (the format part of P5) |

## Appendix: diligence questions

An investor asked twelve questions. The answers below come from the criteria above.

| # | Question | Answer, in brief | Criteria |
| --- | --- | --- | --- |
| 1 | MVP scope per pilot: connectors and decision kinds? | One decision kind per pilot (the partner's first case). Knowledge-base export, plus three read-only connectors. | P1, P2 |
| 2 | What beats a good prompt with generic connectors? Where is the moat? | Decisions computed in code over quoted facts and visible weights; reproducible, cited and kept. The moat is decision memory and outcomes. Quality against a prompt is measured, not claimed. | R1, R2, R6, L2 |
| 3 | How is business context captured, by whom, and kept fresh? | From the tools the business already uses, on each tool's schedule. Every fact keeps its date and source. Stale facts are shown and not used. People add context by recording calls. | P1, P2, R5, R8, P4.1 |
| 4 | A unified model mapped to ISO 27001, SOC 2, DORA, NIS2? | No, by design. Crowbo reads the platform that holds the mapping. | D1 |
| 5 | What is a decision, how is it counted, how is it made opposable? | A record addressed by its inputs. Kept once in hash-chained memory: countable, exportable and checkable by recomputation. | R6, R2, D2 |
| 6 | Which harnesses? Fallback when IT restricts assistants? | Any MCP harness (Claude Code, Claude, Cursor, Codex, Gemini). Slack is the fallback. | R7, P3 |
| 7 | Onboarding effort, and who acts on the customer side? | The security lead exports the knowledge base, and an admin grants read-only access to three tools. | P1, P2 |
| 8 | Where does "Priya decides, Alex delivers" come from? | Relationships between tools: the system's owner decides, the control's assignee delivers, and the earliest dependent launch sets the date. | R4 |
| 9 | Prompt injection through untrusted tickets, issues and pages? | Text is data. Prose goes only to the extraction model and quotes must match. Typed fields come only from connectors and from export files a person mapped, limited to importable predicates and labelled as imported. Calls assert only allowlisted facts. | R3 |
| 10 | Measuring quality; contradicting or incomplete sources? | Reviewed cases, not self-grading. Conflicts are shown, not settled. Missing evidence defers the move with an information request. | R5, P2.1, L1 |
| 11 | Same question twice, same decision? Auditor-usable traces? | Yes: same inputs, same ID. The trace is the hash-chained memory, with every source cited by revision. | R1, R2 |
| 12 | Learning from accepted or rejected decisions; cross-customer with consent? | Within a customer: calls change the next answer, and corrections become weight proposals a person accepts. Across customers: nothing without consent. | R8, P4.2, L3 |

### Later criteria

| ID | Criterion | Label |
| --- | --- | --- |
| L1 | Thirty two-reviewer evaluation cases per question kind, scored by `eval/score.ts`, held outside the repo | Failing until built |
| L2 | A head-to-head against a capable model with generic connectors, on held-out cases | Failing until built |
| L3 | Cross-customer learning only with recorded rights and consent per tenant | Failing until built |

### Decided

- **D1. No framework mapping in Crowbo.** It reads the platform that already holds the mapping to ISO 27001, SOC 2, DORA and NIS2, and its evidence. A second copy would go stale and compete with the system the auditor uses.
- **D2. No billing per decision.** Crowbo charges a platform fee. Decisions are reported, not billed, so asking more costs the customer nothing extra.
