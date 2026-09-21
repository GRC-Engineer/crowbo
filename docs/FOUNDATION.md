# Crowbo foundation

Status: initial foundation, 21 September 2026. The founder's current direction and selected first proof govern this document. Architecture proposals and evaluation expectations remain provisional where marked.

## Product direction

Crowbo is reusable software for security decision-making. It should help security leaders and their programmes choose and act using evidence, business objectives, constraints and policy. The intended output is a useful set of options with consequences, uncertainty, conditions and next actions, supported by reasoning someone can inspect and challenge.

The founder's judgment across governance, risk, compliance and security programmes is a central input to the evaluation set. Capture how he finds deciding facts, challenges assumptions, weighs evidence, considers alternatives and recognises when an accountable owner must decide.

Potential applications include investment, staffing and capacity, tooling, programme changes, vendor or data use, exceptions and treatment. They are possibilities, not a build list. Assessment and assurance may eventually consume the same capabilities.

Historical Épreuve work remains unchanged. Its audit-service model and roadmap are not inherited by Crowbo. Reuse needs a concrete question, inspected material and suitable rights. Do not migrate its note corpus by default.

## Decisions made

| Decision | Basis | Consequence |
| --- | --- | --- |
| Crowbo is the name and new working home | Founder direction, 21 September 2026 | Work in the existing Crowbo checkout and its GitHub repository. |
| Security decision infrastructure is the working descriptor | Founder direction | Build reusable software and domain concepts for decisions. |
| First proof: tool purchase versus remediation capacity | Explicit founder selection in the Crowbo steering task, 21 September 2026 | Make this one decision complete before expanding the application set. |
| Initial work uses synthetic or suitable public material | Public repository and bounded proof | No persistent customer access or private evidence is needed. |

## First proof

The question is: given a security programme's objectives, current protection, vulnerability workflow and available budget, should the next investment go into another tool, remediation capacity, an improvement using existing resources, or further investigation?

The proof must make the deciding facts visible. More detections do not automatically mean better protection; adding capacity does not automatically fix prioritisation, ownership or deployment constraints. An urgent coverage gap can make another tool the better option. Missing or contradictory evidence can make a specific information request the right next step.

### One complete loop

1. State the decision owner, objectives, scope, time horizon, budget and available authority.
2. Inspect evidence about existing coverage, relevant assets and attack paths, actionable demand, remediation throughput, overdue work and actual workflow bottlenecks. Keep sources and assumptions visible.
3. Compare feasible alternatives, including current tools or process changes, a bounded pilot, capacity changes, a purchase and deferral. Explain why an option is feasible or excluded.
4. Apply explicit policy constraints and any justified calculations. Expose inputs, units, uncertainty and versions. Do not turn finding counts into a universal risk score or invented loss estimates.
5. Recommend an option or request deciding information. Explain the trade-offs, remaining uncertainty, conditions, accountable owner and next action.
6. Record a simulated decision separately from the recommendation. Preserve the human's choice and rationale, including legitimate disagreement.
7. Change a material fact and reassess. Link the new assessment to the original basis; retain the original record. Rewording alone should not change the substantive outcome.

The proof ends at simulated decision and reassessment. It does not buy software, allocate staff, grant an exception or change a production system.

### Candidate implementation shape

A local, inspectable implementation is sufficient for the first proof. A small Python CLI is a candidate, compatible with learning through the terminal; it is not yet a stack decision. A UI, vector database, hosted backend or connector is not required to establish the loop.

Keep one explicit input record, traceable evidence and assumption references, option assessments, checks and calculations, a recommendation, and a separate simulated decision record. A reassessment needs its new basis and its relationship to the prior version. Choose concrete data structures from the first cases before adding abstractions.

## Domain and technology hypotheses

The conceptual model should connect objectives and constraints, actors and authority, systems and data dependencies, claims and evidence, requirements, risk scenarios and protection, options, decisions and outcomes. These relationships are candidates to test against cases. A vocabulary alone does not establish causal effects, and each concept does not need its own service.

Separate model interpretation from deterministic checks and calculations. Both may support a recommendation; neither grants decision or execution authority. Evidence quality is relative to a question, subject, scope and period. Preserve contradictions and unknowns instead of averaging them into a credibility score.

| Candidate | Possible job | Evidence needed before adoption |
| --- | --- | --- |
| Jev and turbopuffer | Retrieval or data access for a demonstrated workload; assign each a distinct job | Current documentation and a workload comparison against simpler storage or direct context. Retrieval performance is separate from decision quality. |
| Policy-as-code, potentially OPA or Cedar | Evaluate explicitly defined constraints or authority rules | Policy semantics, uncertainty handling and a reason a simpler evaluator is insufficient. "PolicyScore" was a dictation error, not a selected engine. |
| FAIR or FAIR-CAM | Structure a suitable risk analysis with explicit assumptions and uncertainty | A justified scenario, input basis, calibration and transparent calculation. Retrieved documents are not a risk engine. |
| GRCX concepts | Inform a challengeable model of the programme and its relationships | Selective review of authoritative current material when a specific design question requires it. An older snapshot is not current authority. |
| Decision science or COM-B | Explore adoption, capability, capacity, authority, incentives and timing | Testable explanations tied to the case. Do not infer private mental states or profile employees. |

Keep providers replaceable. Model training, a universal data lake, persistent customer access and a services architecture are not prerequisites. The aim is useful risk-informed reasoning without requiring customers to adopt CRQ terminology.

## First work package

The next bounded build is the selected local decision loop, governed by [the evaluation contract](EVALUATION.md). Start with its open development case, refine the deciding facts and candidate judgments, choose the smallest data contract, then apply the required security analysis before code.

Demonstrate a baseline recommendation, a supported alternative, an unresolved case, a simulated owner decision and reassessment after a material change. Compare the same cases with a capable raw model and a skill using equivalent facts and permissions. Keep behavioural correctness, judgment quality and commercial validation as separate results.

Open items are the data contract, implementation stack, specific policy and calculation semantics, reviewed expected judgments, hidden evaluation cases and numeric release thresholds. The first workflow itself is selected and does not need another broad discovery interview.

## Positioning and source context

The desired identity is a playful pixel corvid with terminal and retro-game influences and serious engineering presentation. Logo, colours and final brand assets remain open. Do not copy existing game character art. No trademark clearance, domain acquisition, incorporation or handle reservation has been established here.

Founder relationships, practitioner standing and audience are starting advantages. They do not establish paid demand, organisational endorsement, customer acceptance or viable economics. Founder observations about incumbent quality and CRQ adoption remain market judgments to test.

The handoff identified these Simon Eskildsen/turbopuffer discussions as research pointers:

- [AI Engineer / Pragmatic Engineer discussion](https://turbopuffer.com/blog/video-ai-engineer-pragmatic-engineer)
- [Additional interview](https://www.youtube.com/watch?v=bWyOyyrVIXk)
- [PMF Show publisher transcript](https://turbopuffer.com/blog/podcast-pmf-show-he-built-new-database-bedroom-now-powers-cursor-notion-anthropic)

The transferred lessons are to start with a valuable workload, choose a small set of reusable concepts, preserve simple invariants and measure behaviour. The handoff reports reviewing relevant transcript sections, not every audiovisual minute. This setup has not independently reviewed those sources. They do not validate Crowbo's demand or economics; do not add full transcripts to this repository.
