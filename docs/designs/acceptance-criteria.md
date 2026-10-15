# Acceptance criteria: what a first paid pilot buys

This page defines what Crowbo must do in a first paid pilot's first two months, roughly to mid-December. Each criterion is a check a reviewer can run. Each failing one comes with a build spec, so work can start the day the backend build is approved.

Every criterion carries one of three labels:
- **True on fixtures:** passes today, on the demo company.
- **Failing until built:** written now, and failing on purpose.
- **Decided:** a design choice, not a test.

The checks are in [`backend/test/acceptance/criteria.test.ts`](../../backend/test/acceptance/criteria.test.ts). To run them:

```bash
cd backend && bunx vitest run test/acceptance
```

A failing criterion is written as an `it.fails` test, so the suite stays green. When the work lands, that test starts passing and vitest reports it as an error. The label then has to change here and in the test. All checks use fixtures only, with no third-party data.

Architecture: [ENGINE.md](../ENGINE.md). The decision rule: [ADR 0002](../adr/0002-deterministic-risk-arithmetic-decides.md). Judgment quality: [EVALUATION.md](../EVALUATION.md).

## The pilot in one line

A security lead gets a weekly fix-or-drop list in their own Slack. It is built from their knowledge base and three of their tools. Each move carries its evidence, a named decider and a date. Their corrections make the next week's list better.

## Pilot criteria for mid-December

| ID | Criterion | Label |
| --- | --- | --- |
| P1 | A knowledge-base export produces a first company profile and first next moves within a day | True on a synthetic export |
| P1.1 | PDF and DOCX files in the export are read | Failing until built |
| P2 | Three real connectors, read-only, feed the weekly fix-or-drop list | Failing until built |
| P2.1 | Prose from real sources is extracted live by Clef, with precision at 0.8 and recall measured on 50 labelled sentences | Failing until built |
| P3 | The list arrives in the customer's Slack with citations, a named decider and a date, with no assistant needed | Failing until built |
| P4 | A recorded call changes the next answer, and the answer cites it | True on fixtures (engine part) |
| P4.1 | A call recorded from a Slack thread keeps the thread's permalink as provenance | Failing until built |
| P4.2 | Repeated corrections yield a weight proposal; accepting it is recorded and recomputes the ranking | Failing until built |
| P5 | The weekly brief reads in plain words: moves with sources, deciders and dates, hours back, evidence not used | True on fixtures (format part) |
| P5.1 | A CISO at the pilot forwards the brief to their leadership without editing it | Reviewed, not tested |

### Build specs

**P1. From export to first profile.**
- **Input:** a folder or archive of the customer's policies, risk register and last audit report (PDF, DOCX, Markdown, CSV).
- **Build:** an import operation that registers each file as a prose or typed record, extracts quoted facts through the evaluation gate, and registers the subjects it finds.
- **Output:** a first next-moves list on default weights, plus a profile: the systems, owners, controls and stale entries it found.
- **Check:** on a synthetic export it returns a profile and a list in one run.
- **Size:** about 3–4 days.
- **Built:** `engine_import_knowledge_base`, over [`kb.ts`](../../backend/src/engine/kb.ts).
  - Markdown and text are read as prose. A CSV is typed only with a `subject,field,value` header or an explicit column mapping; otherwise it is read as prose and nothing is typed.
  - The export is one more source, `kb`, weighted 3 with a 180-day limit until the company sets its own. Each file's edit date drives freshness.
  - Re-importing an unchanged file changes nothing. Memory keeps a digest of each file, never its text.
  - The operation requires `synthetic: true` until counsel clears third-party data and Ayoub gives a written go.
  - The profile keeps the current Scenario and Action shapes. The register is meant to replace `kbProfile`, not the import.

**P1.1. PDF and DOCX.**
- **Today:** listed as not read, with the reason.
- **Build:** read their text in the Worker, or take text the harness already extracted.
- **Check:** no file in the synthetic export is left unread.
- **Size:** about 1 day.

**P2. Three real connectors.**
- **Build:** pick the three that the pilot's first case needs, likely the identity provider, the ticketing tool and the incumbent compliance platform.
  - Each connector is the existing mapping code, pointed at the real API by configuration.
  - Each has read-only scopes, a sync schedule and stores no credentials in the repo.
- **Check:** three connectors are marked live, and each one's mapping test passes on a recorded response.
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
- **Check:** the surface exists. On fixtures, a scripted mention returns the card with citations, decider and date.
- **Size:** about 3–4 days.

**P4.1. Corrections from Slack.**
- **Build:** "record this" in a thread writes the call. The thread's permalink becomes the call's provenance.
- **Check:** the recorded call carries the permalink, and the next answer cites it.
- **Size:** about 1 day, on top of P3.

**P4.2. From correction to weight.**
- **Build:** an accept-proposal operation.
  - It applies the proposed weight.
  - It records the acceptance against the proposal.
  - It recomputes the decision and reports why the ranking moved.
- **Check:** after two disputes of one source, accepting the proposal changes the weight, the memory links the change to the proposal, and the decision diff names that source.
- **Size:** about 1 day.

**P5.1** is judged by the pilot, not by a test. The brief should open with what the security lead did not already know that week.

Build order, riskiest first: P1, P3, P2, P2.1, P4.1, P4.2. That totals about 3 weeks of focused work. P1 is built; P1.1 follows when a pilot's export needs it.

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

## Appendix: diligence questions

An investor asked twelve questions. The answers below come from the criteria above.

| # | Question | Answer, in brief | Criteria |
| --- | --- | --- | --- |
| 1 | MVP scope per pilot: connectors and decision kinds? | One decision kind per pilot (the partner's first case). Knowledge-base export, plus three read-only connectors. | P1, P2 |
| 2 | What beats a good prompt with generic connectors? Where is the moat? | Decisions computed in code over quoted facts and visible weights; reproducible, cited and kept. The moat is decision memory and outcomes. Quality against a prompt is measured, not claimed. | R1, R2, R6, L2 |
| 3 | How is business context captured, by whom, and kept fresh? | From the tools the business already uses, on each tool's schedule. Every fact keeps its date and source. Stale facts are shown and not used. People add context by recording calls. | P1, P2, R5, P4 |
| 4 | A unified model mapped to ISO 27001, SOC 2, DORA, NIS2? | No, by design. Crowbo reads the platform that holds the mapping. | D1 |
| 5 | What is a decision, how is it counted, how is it made opposable? | A record addressed by its inputs. Kept once in hash-chained memory: countable, exportable and checkable by recomputation. | R6, R2, D2 |
| 6 | Which harnesses? Fallback when IT restricts assistants? | Any MCP harness (Claude Code, Claude, Cursor, Codex, Gemini). Slack is the fallback. | R7, P3 |
| 7 | Onboarding effort, and who acts on the customer side? | The security lead exports the knowledge base, and an admin grants read-only access to three tools. | P1, P2 |
| 8 | Where does "Priya decides, Alex delivers" come from? | Relationships between tools: the system's owner decides, the control's assignee delivers, and the earliest dependent launch sets the date. | R4 |
| 9 | Prompt injection through untrusted tickets, issues and pages? | Text is data. Prose goes only to the extraction model, quotes must match, typed fields come only from connectors, and calls assert only allowlisted facts. | R3 |
| 10 | Measuring quality; contradicting or incomplete sources? | Reviewed cases, not self-grading. Conflicts are shown, not settled. Missing evidence defers the move with an information request. | R5, P2.1, L1 |
| 11 | Same question twice, same decision? Auditor-usable traces? | Yes: same inputs, same ID. The trace is the hash-chained memory, with every source cited by revision. | R1, R2 |
| 12 | Learning from accepted or rejected decisions; cross-customer with consent? | Within a customer: calls change the next answer, and corrections become weight proposals a person accepts. Across customers: nothing without consent. | P4, P4.2, L3 |

### Later criteria

| ID | Criterion | Label |
| --- | --- | --- |
| L1 | Thirty two-reviewer evaluation cases per question kind, scored by `eval/score.ts`, held outside the repo | Failing until built |
| L2 | A head-to-head against a capable model with generic connectors, on held-out cases | Failing until built |
| L3 | Cross-customer learning only with recorded rights and consent per tenant | Failing until built |

### Decided

- **D1. No framework mapping in Crowbo.** It reads the platform that already holds the mapping to ISO 27001, SOC 2, DORA and NIS2, and its evidence. A second copy would go stale and compete with the system the auditor uses.
- **D2. No billing per decision.** Crowbo charges a platform fee. Decisions are reported, not billed, so asking more costs the customer nothing extra.
