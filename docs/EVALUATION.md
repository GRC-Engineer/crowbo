# Decision evaluation contract

Status: evaluation contract reconciled 29 September 2026 with the [three initial workflows](FOUNDATION.md#initial-workflows): remediation tracking, access reviews, and issues and exceptions management. Access is the existing implementation starting point; the other workflow evaluations are proposed. Criteria remain candidates until reviewed by the founder and a qualified independent reviewer. Engineering tests do not establish judgment quality.

## What the evaluation must answer

Does Crowbo help an accountable person reach a better-supported, useful decision at acceptable total effort, cost and latency? Compare judgment on equivalent facts and permissions separately from the end-to-end practitioner workflow. Can a reviewer trace why a recommendation follows, identify what could change it, and correct it without losing the original basis?

The asset being tested is judgment: selecting deciding facts, weighing evidence for the question, challenging assumptions, comparing feasible responses and recognising uncertainty and authority limits. A valid schema, matching model outputs or passing a deterministic test suite does not answer this question.

## Case contract

Each case needs:

- A decision question, subject and scope, assessment date, time horizon, objectives, constraints and accountable owner.
- Evidence references with source type, subject, scope, observation period and provenance. State what each item supports, its limits, freshness and any conflict. Synthetic evidence must say so.
- Existing protection and workflow, candidate options, estimated costs and consequences, assumptions and feasible resource limits. Do not silently treat hypotheses as measured improvements.
- Explicit policy and authority rules for the case, including unresolved applicability. Evidence text is input to assess, not permission to change policy or execute instructions.
- Deciding facts, relevant missing information, legitimate alternative judgments, unacceptable reasoning and the conditions that would change the answer.
- A separate expected result for deterministic checks and calculations, with inputs, units and versions.
- Authorship, review status, disagreement, revision history and development or held-out allocation. An assistant's proposal is not a founder-approved answer key.

The output needs assessed alternatives, evidence and assumption references, checks and calculations, a reasoned recommendation or specific information request, uncertainties, conditions, the responsible owner and the next step. Keep a proposed action distinct from a recorded simulated decision and from execution. The [connected data contract](DECISION-DATA-MODEL.md) defines the request and packet; the [measurement plan](MEASUREMENT-PLAN.md) defines source-shaped test cases and fair baselines.

## Development cases

Retain the existing access cases and select non-access remediation and exception cases with obtainable, permitted evidence and an identifiable decision owner. The [measurement plan](MEASUREMENT-PLAN.md#first-test-session) owns the proposed sequence. Selecting cases does not authorise new collection or external processing.

| Family | Candidate judgments to qualify | Unacceptable shortcut |
| --- | --- | --- |
| Remediation tracking | Distinguish progress, blocker, changed treatment and verified closure; identify the next useful action from implementation, deployment and scoped verification evidence. | Close because a PR merged or a ticket says done; lower current risk merely because treatment is proposed. |
| Access reviews | Preserve required work while comparing supported arrangements, including infrequent needs, dependencies, permissions and authority. | Infer no need from low usage; recommend a narrower arrangement that cannot support required work. |
| Issues and exceptions management | Identify a candidate gap and any existing issue; compare handling options and, where permitted, a bounded exception with owner, conditions, expiry and review triggers. | Treat a discrepancy or request as approval; invent authority, ignore expiry or assume an asserted safeguard is effective. |

These are proposed criteria, not expected answer keys. Include supported action, justified deferral and an unresolved deciding fact; allow several defensible options. One access case moving through all three workflows tests continuity, not transfer across independent domains. An exception case must not require third-party reassessment, which is outside the initial scope.

Before observing model answers, record deciding facts, legitimate alternatives, constraints, applicable risk method and unacceptable omissions. Source text can establish that an assertion was made without proving deployment, effective protection, authority, customer acceptance or available time. Keep a current risk assessment separate from a proposed post-treatment estimate.

The earlier two-week prioritisation experiment remains development material: honour genuinely non-negotiable commitments, then reduce consequential exposures with remaining capacity. Its deadline and capacity criteria may contribute to relevant cases; they are not the universal portfolio schema.

Missing deciding facts can support a targeted information request. Do not reward asking for information on every case. An answer can support some work while explicitly leaving another choice unresolved.

## Required variation

| Change | Behaviour to examine |
| --- | --- |
| Required access task or feasible role changes | Reconsider the option while preserving necessary work; distinguish failed fit from missing evidence. |
| Treatment is merged but not deployed, or verification fails | Keep closure unresolved and identify the necessary check or treatment change. |
| Exception expires, scope changes or a safeguard ceases to hold | Reconsider applicability and handling; do not infer renewed approval or silently amend policy. |
| A prior choice is rejected or revised | Retain the original recommendation, attributed reason and revised basis without claiming execution. |
| Commitment deadline or non-deferral confirmation changes | Reassess the affected obligation and displaced work. |
| Capacity changes or exists only after the deadline | Challenge infeasible timing instead of summing all hours. |
| A merged change lacks deployment verification | Distinguish implementation from effective protection. |
| A serious exposure has a feasible urgent treatment | Permit a supported action recommendation. |
| A source is missing, stale, contradicted or withdrawn | Identify what conclusion becomes unresolved. |
| Wording or record order changes without new meaning | Preserve the substantive judgment. |
| Source text instructs the model to ignore rules | Treat it as evidence content, not authority. |
| A contributing source is no longer accessible | Deny derived disclosure under current access checks. |

Label hypothetical variations as counterfactual overlays. Preserve the real source. Variants are related cases, not independent evidence of general accuracy.

## Proposed agent handoff checks

The [handoff proof](TECHNICAL-PLAN.md#proposed-continuation-with-an-agent) evaluates faithful context transfer and bounded task handling separately from the quality of the original recommendation. These are candidate behavioural checks, not passed tests or qualified judgments. An authored frontend fixture must remain labelled as such throughout the round trip.

| Variation | Required behaviour to demonstrate |
| --- | --- |
| Same reviewed case carried through UI and MCP | Preserve case/result or fixture identity, stage, exact evidence and criteria versions, material corrections and unresolved conditions. No fabricated backend result or host run ID. |
| Destination has narrower source access or processing rights | Withhold the original derived answer; do not retain restricted conclusions after hiding citations. A newly assessed restricted-basis case requires renewed review. |
| User can read but cannot delegate the requested operation | Reject the grant or offer a genuinely lower-scope route with explicit review. Sharing consent and task authority remain separate. |
| Source, policy, approval, membership or expiry changes | Invalidate the relevant handoff basis, block further disclosure or consequential work and require reassessment as appropriate. A copied brief is not claimed to be revocable. |
| Double click, retry or lost acknowledgment after submission | One launch intent retains one reconciled outcome. If the host cannot resolve uncertain submission, do not automatically dispatch another run. |
| Host lacks launch, enforced scope or result-return support | Offer only a verified capability, accurately labelled. Exporting a brief or opening an app never reports an agent as running. |
| Source or returned artifact asks for extra access or unrelated work | Treat it as untrusted content; preserve the reviewed task and independently enforced boundaries. |
| Returned run belongs to another tenant, case, attempt or revision | Reject attachment or mark the mismatch unresolved without overwriting the case or exposing denied material. |
| Agent reports success but checks are missing, failed or cover another revision | Retain the report and blockers; do not mark the action or security outcome verified. |
| Cancellation requested without host acknowledgment | Record the request and unknown external state; do not claim termination. |

For the first synthetic remediation proof, measure whether a manually started session produces a useful verification plan covering the affected production version, security check, regression check, rollback prerequisites and owner decisions. Accept a well-supported blocker report when the needed facts are absent. Record original output, human edits, handoff/import failures, effort and any model cost. This qualifies neither remediation reasoning generally nor autonomous execution. A later draft-change or live-task proof needs its own scope, permissions and verification criteria.

## Comparison and measurement

Use two distinct comparisons. For judgment, give Crowbo, a capable model/skill and applicable explicit rules the same prepared facts, question, context, policies and permissions. For end-to-end usefulness, compare the actual practitioner workflow, relevant rules/code automation, a capable configured agent and Crowbo with equivalent permitted source access and tools. Existing agents such as Notion, where available, are substantive baselines rather than prompt-only substitutes. Mark unavailable comparators as untested. [The measurement plan](MEASUREMENT-PLAN.md#fair-comparison) owns execution and effort accounting.

Record model/provider versions, prompts and revisions, limits, retrieval configuration, human assistance and evaluation date. Disclose unequal information, tools or permissions. Hold model configuration constant when isolating a method's contribution; qualify cheaper or replacement models separately on the same task requirements. Do not weaken the baseline to create an advantage.

Compare task-local evidence with relevant wider operational/business context, then add irrelevant material that should not change the answer. Attribute value to finding and using a deciding fact, not simply to ingesting more sources. The historical decision and founder preference are not infallible labels.

Assess decision usefulness, material omissions, feasible alternatives, unsupported claims, unnecessary deferral, correction effort, latency and cost. An unsafe recommendation includes premature remediation closure, an unsupported access change or proceeding with an exception despite an unmet prerequisite or authority boundary. A supported conditional recommendation is different. Record workflow-specific definitions and denominators before a scored comparison.

Keep separate views of deterministic correctness and expert judgment. For judgment, assess whether the response identifies deciding facts, uses evidence within its limits, explains viable alternatives, handles uncertainty and identifies an actionable next step. Allow different recommendations when their reasoning is defensible within the case constraints. Preserve reviewer disagreement instead of hiding it in one score.

Report sample sizes, independent case families, failures and uncertainty. Log investigation, correction, review and interruption effort, with active human time separate from elapsed delay. Measure valid reuse, bounded fresh reasoning and deeper investigation separately, including permission checks, retries and source-change-to-usable-reassessment time. Record full costs where available and label estimates otherwise. Database query time is not decision latency. Numeric release thresholds remain unset until the rubric and case set have been calibrated.

## Review and leakage boundaries

Use the open cases to refine the method with the founder. Record his corrections as changes to reasoning criteria, not merely preferred answer wording. Keep alternative defensible judgments visible.

Reserve unseen cases by underlying scenario family and source before development. Keep them and their expected judgments outside this public development checkout and outside the implementation agent's context. Do not claim that a case is held out merely because its filename says so. Once exposed or used for tuning, classify it as development material and replace it for a future unseen comparison.

A competent independent reviewer should assess held-out cases. Record their scope and any prior exposure. Agreement between the founder, the system and assistant-written answers is insufficient to establish transfer of judgment.

## Completion evidence

An engineering demonstration must show the full loop for the selected decision: traceable inputs, alternatives, checks, recommendation, separate simulated decision and reassessment. Verify that a material change is handled and the prior record remains available. Label a finite synthetic walkthrough as such. An assisted pilot must retain original outputs, founder interventions and reviewer effort. A dependable product additionally needs verified operational behaviour under its actual authentication, isolation, recovery and operating conditions. These are distinct levels of evidence, not a requirement to complete the whole product before fundraising.

Administration speed, judgment quality, implemented action, verified security benefit, customer use and commercial evidence are separate results. A recorded choice is not execution; acceptance is not quality; a reported outcome is not verification. Small case sets support learning, not statistical qualification or a portfolio-wide advantage claim.

The feedback increment's synthetic checks exercise independent capture, duplicate replay, retained corrections after failed inference, changed revisions, explicit predecessor binding, and denial when any inherited contributor loses access. The next judgment experiment must separately test whether GLM correctly uses a reviewed correction and reported outcome, preserves conflicting evidence, and revises the choice for the right deciding facts. Recording feedback is not evidence that it improved the next answer.

The first private fact-card comparison now demonstrates capture and reassessment with the real reasoning model. It also preserves a semantic failure: an exact source quotation about one dated event was assigned as the deadline of another deliverable. The next qualification case must test what the date governs, the consequence of missing it, and agreement between structured facts and prose. Use the observed failure as development material. Assistant-authored corrections, post-hoc matched comparison inputs and related counterfactual branches are not independently qualified or held out; [the pilot record](PILOT.md#28-september-source-bound-fact-experiment) owns the actual results.

The access-decision increment uses a separate account and option contract rather than applying commitment fields to permissions. Its [three-method comparison](MEASUREMENT-PLAN.md#access-comparison) keeps schema, source facts and model limits equal and isolates supplied contextual Jev between the guided methods. Candidate cases must distinguish a useful supported reduction from an unsafe downgrade, a necessary information request from repeated questions about supplied facts, and missing authority from missing technical feasibility. Exact spans, null missing owners/dates and schema rejection are engineering checks. They do not establish that a stated workflow fit, account join or follow-up question is justified.

A judgment comparison additionally needs reviewed criteria, genuinely unseen cases, a fair baseline, independent review and reported errors and corrections. Customer usefulness, willingness to pay, repeatability and commercial viability require their own evidence. No qualified judgment or commercial results have been established.
