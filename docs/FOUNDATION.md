# Crowbo foundation

Status: product foundation, updated 29 September 2026 for the founder-selected portfolio: remediation tracking, access reviews, and issues and exceptions management. This supersedes the earlier access-only starting scope and proposed Access / Control Remediation / Risk framing. Investor deck v38 is a narrative reference; this update does not change the deck. [The backend brief](TECHNICAL-PLAN.md) owns implementation sequencing and distinguishes implemented behaviour from unqualified hypotheses.

## Product direction

Crowbo is reusable software for security decision-making. It should help security leaders and their programmes choose and act using evidence, business objectives, constraints and policy. The intended output is a useful set of options with consequences, uncertainty, conditions and next actions, supported by reasoning someone can inspect and challenge.

The initial buyer is a Head of GRC or Security Assurance at a SaaS or AI company with an established programme, initially US companies after their first audit cycle. The initial portfolio comprises remediation tracking, access reviews, and issues and exceptions management. Bring relevant internal operational and business context into these existing jobs. GRC coordinates the work; an accountable owner authorises choices and a delivery team implements and verifies changes. A source assignee or GRC requester does not automatically hold authority over another team's access or capacity. The portfolio does not select a launch order, require three equally complete modules or establish the commercial entry point. The existing access experiment remains an implementation starting point.

The intended learning loop retains contextualised recommendations, accepted, revised or rejected choices, reasons, corrections and reported outcomes. Acceptance does not establish a good outcome; outcome claims need their own evidence. These records may inform reviewed improvements to retrieval, criteria, alternatives and reasoning, including evidence weights where justified. Automatic adaptation and validated learning are not current capabilities. Cross-customer learning requires appropriate rights and evaluation. Operational control assessment, business importance and delivery feasibility are separate judgments.

People using Crowbo and existing assistants should be able to use the same decision capability through a UI or tools such as an API or MCP. Each interaction should refer to the same evidence and recommendation versions within the caller's permissions. Every workflow needs its own domain facts, criteria and evaluation. Control testing and reassessment are possible later applications, not a fourth initial workflow.

The longer-term ambition is to power agents and autonomous security programmes within customer-defined authority. The initial application remains advisory and read-only with respect to source systems. Observable execution, outcome verification and enforceable authority are additional requirements, not consequences of exposing an MCP tool.

The founder's judgment across governance, risk, compliance and security programmes is a central input to the evaluation set. Capture how he finds deciding facts, challenges assumptions, weighs evidence, considers alternatives and recognises when an accountable owner must decide.

Third-party reassessment and vendor management are outside the initial scope. Crowbo is not being scoped as a TPRM product. Software upgrades can be cases within remediation or exception treatment. Investment, staffing and programme changes remain possible later applications, not a build list.

The intended evidence includes operational observations, business commitments, team capacity and stated capabilities, ownership, dependencies, company-specific rationale and prior decisions. Ingest the permitted sources needed for a useful decision first. Expand coverage as real questions require it. Information absent from source systems may require an attributed answer from an accountable person.

Historical Épreuve work remains unchanged. Its audit-service model and roadmap are not inherited by Crowbo. Reuse needs a concrete question, inspected material and suitable rights. Do not migrate its note corpus by default.

## Decisions made

| Decision | Basis | Consequence |
| --- | --- | --- |
| Crowbo is the name and new working home | Founder direction, 21 September 2026 | Work in the existing Crowbo checkout and its GitHub repository. |
| Security decision infrastructure is the working descriptor | Founder direction | Build reusable software and domain concepts for decisions. |
| Initial portfolio: remediation tracking, access reviews, and issues and exceptions management | Founder-approved shared workflow brief, 29 September 2026 | Reuse one decision capability with workflow-specific criteria; launch order and commercial entry point remain open. |
| Preserve the access experiment as a starting point | Existing bounded implementation | Extend only where reviewed cases require it; three workflow names do not justify a rewrite or separate services. |
| Earlier experiment: prioritise the next two working weeks | Founder-selected workload | Retain its rule and evidence as an earlier decision case, not the current first application. |
| Connected evidence and decision backend is the next build target | Founder requested source indexing, Jev enrichment and model comparisons | Build one complete decision and reassessment loop using the contracts in the backend brief. |
| Public development uses synthetic or suitable public material | Public repository | Keep any later approved source data and private evaluations outside the checkout. |

## Initial workflows

| Workflow | Decision to support | Intended useful output |
| --- | --- | --- |
| Remediation tracking | Is an agreed treatment progressing and effective, and what should happen next? | Continue, unblock, request verification, change treatment, escalate, wait or propose closure, supported by tickets, changes, deployments, verification and relevant constraints. |
| Access reviews | Which feasible access arrangement supports the account's required work with less unnecessary exposure? | Compare supported retention, narrowing, removal or temporary access options, or identify a specific deciding check. |
| Issues and exceptions management | Is there a gap that needs recording, and how should it be handled? | Candidate issue identification and triage, treatment alternatives, or a bounded exception recommendation with conditions, owner, expiry and reassessment triggers. |

Issues and exceptions management establishes the meaning and handling of a problem. Remediation tracking follows the chosen treatment toward verified completion. Keep a common case identity and linked records as it moves between these workflows. Detection, an exception request, authorised acceptance, executed safeguards and verified outcomes remain separate. Changed conditions or an expired exception should prompt reconsideration; automatic monitoring is not implied.

Use the customer's existing risk method initially. Preserve current and proposed assessments separately: a proposed treatment does not lower current residual risk. Preferences cannot override binding constraints. A case can draw relevant context from several departments while its decision remains narrow. Broad ingestion, campaign administration, ticket management and autonomous execution are not prerequisites.

One access case moving through all three workflows demonstrates lifecycle continuity. It does not establish transfer to different decision domains; evaluation also needs non-access remediation and exception cases.

### Access implementation starting point

What access does this account need to perform its required work, and which feasible arrangement best meets that objective while reducing unnecessary exposure?

Identify the account, system, required work, current permissions, dependencies, review period and accountable owner. Compare supported options and their operational consequences, conditions and remaining exposure. A narrower role, temporary grant or replacement credential is an option only when the case supports its availability and usefulness. Missing evidence may make a specific deciding check the next action.

The private pilot remains advisory and simulated. It saves the question, selected evidence, alternatives, uncertainties and recommendation. Reviewers should be able to challenge a fact or assumption, supply new context or adjust an explicitly permitted preference, then see what changes and why. A preference cannot override a mandatory constraint or grant authority. Preserve the earlier basis and link the reassessment to it. An accountable person's choice and execution remain separate.

### Earlier prioritisation experiment

The earlier question asked what GRC and security engineering should prioritise over the next two working weeks. Its rule remains: honour genuinely non-negotiable commitments, then use remaining capacity to reduce the most consequential security exposures. A commitment needs evidence of its obligation, deadline, consequence and accountable owner's confirmation that it cannot be deferred within the window. Other teams' work depends on confirmed capacity. This remains a prior case for the broader method.

### Connected implementation direction

The architecture starts from one small Python backend, Turbopuffer with native Voyage embeddings, Jev through Cloudflare, and a reasoning model. Existing historical experiments are not design inputs. The [backend brief](TECHNICAL-PLAN.md) records why each dependency remains.

The source preparation and retrieval path is implemented. The new review operation accepts explicit evidence IDs and a model configuration; its engineering tests do not qualify the recommendation's professional judgment. No recurring schedule, hosted service or production authentication is selected.

## Domain and technology hypotheses

The conceptual model should connect objectives and constraints, actors and authority, systems and data dependencies, claims and evidence, requirements, risk scenarios and protection, options, decisions and outcomes. These relationships are candidates to test against cases. A vocabulary alone does not establish causal effects, and each concept does not need its own service.

Separate model interpretation from deterministic checks and calculations. Both may support a recommendation; neither grants decision or execution authority. Evidence quality is relative to a question, subject, scope and period. Preserve contradictions and unknowns instead of averaging them into a credibility score.

| Candidate | Possible job | Evidence needed before adoption |
| --- | --- | --- |
| Jev | Versioned classification and assessment of permitted evidence | Compare usefulness and cost with enrichment disabled; a stored score needs defined criteria and is not universal decision priority. |
| turbopuffer | Primary evidence storage and retrieval for the connected experiment | Prove the record, recovery, access and retrieval requirements in the storage comparison. |
| Policy-as-code, potentially OPA or Cedar | Evaluate explicitly defined constraints or authority rules | Policy semantics, uncertainty handling and a reason a simpler evaluator is insufficient. "PolicyScore" was a dictation error, not a selected engine. |
| FAIR or FAIR-CAM | Structure a suitable risk analysis with explicit assumptions and uncertainty | A justified scenario, input basis, calibration and transparent calculation. Retrieved documents are not a risk engine. |
| GRCX concepts | Inform a challengeable model of the programme and its relationships | Selective review of authoritative current material when a specific design question requires it. An older snapshot is not current authority. |
| Decision science or COM-B | Explore adoption, capability, capacity, authority, incentives and timing | Testable explanations tied to the case. Do not infer private mental states or profile employees. |

Keep providers replaceable. Model training, a universal data lake, persistent customer access and a services architecture are not prerequisites. The aim is useful risk-informed reasoning without requiring customers to adopt CRQ terminology.

The intended durable advantage is the decision method, domain criteria, permitted organisational context and a history of reviewed decisions, corrections and evidenced outcomes, tested through qualified evaluations. A particular model or database does not establish that advantage. A cheaper or replacement model must meet the quality requirements for its assigned decisions.

The founder's economic hypothesis is that cheaper, faster contextual judgment will make it useful in more existing workflows and agents. Measure useful decisions and human review effort alongside cost, latency and quality. Distinguish reuse of a still-valid assessment, a bounded fresh assessment and a new investigation. Changed evidence, policy or permissions can invalidate reuse. Subsecond decisions and economical operation on cheaper models are targets to test, not demonstrated guarantees. [The Jev enrichment proposal](JEV-ENRICHMENT.md) owns the candidate reuse and model-comparison details.

Incomplete quantitative data should not prevent useful comparisons. The product may propose ranges from available evidence, reference data and explicit provisional assumptions. Distinguish observations, expert estimates, reference data and model assumptions; expose their basis and focus review on assumptions that could reverse the choice or materially alter the downside. Exact point estimates are not a product prerequisite. The current calculation's narrower implementation and the remaining evaluation work belong in the backend brief.

## Current work package

The implemented access-decision experiment remains useful within the agreed portfolio. [The backend brief](TECHNICAL-PLAN.md#portfolio-reconciliation-29-september-2026) owns the smallest proposed contract changes and next verifiable units; [the evaluation contract](EVALUATION.md) owns qualification. This documentation reconciliation does not implement the other workflows or authorise new data transfers. Reuse only permitted evidence within its existing processing scope. Synthetic records support public regression tests and manufactured failure cases; private records remain outside the public checkout. Apply the required security analysis before code.

Test the recommendation, alternatives, unresolved inputs and reassessment against reviewed deciding facts. The application now records an attributed simulated choice, correction or reported outcome separately from the recommendation, and links it to an explicit reassessment. This is operator attribution, not authenticated owner approval or verified outcome evidence. Compare the same cases with a capable raw model and a skill using equivalent facts and permissions. Keep behavioural correctness, judgment quality and commercial validation as separate results.

The [measurement plan](MEASUREMENT-PLAN.md#workload-study-proposal) owns the proposed study of recurring GRC work, manual effort and incremental value from judgment and wider context. Comparative demand, build order, commercial entry point, qualified criteria and performance thresholds remain open. Separate a finite demonstration, an assisted real-data pilot and a dependable product. Founder interventions and customer interest must not be reported as reproducible software judgment or paid demand. None of these open questions justifies a broader framework or corpus before a useful complete decision loop.

## Positioning and source context

The desired identity is a playful pixel corvid with terminal and retro-game influences and serious engineering presentation. Logo, colours and final brand assets remain open. Do not copy existing game character art. No trademark clearance, domain acquisition, incorporation or handle reservation has been established here.

Founder relationships, practitioner standing and audience are starting advantages. They do not establish paid demand, organisational endorsement, customer acceptance or viable economics. Founder observations about incumbent quality and CRQ adoption remain market judgments to test.

The handoff identified these Simon Eskildsen/turbopuffer discussions as research pointers:

- [AI Engineer / Pragmatic Engineer discussion](https://turbopuffer.com/blog/video-ai-engineer-pragmatic-engineer)
- [Additional interview](https://www.youtube.com/watch?v=bWyOyyrVIXk)
- [PMF Show publisher transcript](https://turbopuffer.com/blog/podcast-pmf-show-he-built-new-database-bedroom-now-powers-cursor-notion-anthropic)

The transferred lessons are to start with a valuable workload, choose a small set of reusable concepts, preserve simple invariants and measure behaviour. The handoff reports reviewing relevant transcript sections, not every audiovisual minute. This setup has not independently reviewed those sources. They do not validate Crowbo's demand or economics; do not add full transcripts to this repository.
