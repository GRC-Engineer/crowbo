# Crowbo foundation

Status: product foundation, updated 29 September 2026 for the founder-selected portfolio: remediation tracking, access reviews, and issues and exceptions management. This supersedes the earlier access-only starting scope and proposed Access / Control Remediation / Risk framing. Investor deck v38 is a narrative reference; this update does not change the deck. [The backend brief](TECHNICAL-PLAN.md) owns implementation sequencing and distinguishes implemented behaviour from unqualified hypotheses.

## Product direction

Crowbo is infrastructure for security decision-making. Its purpose is to turn fragmented security evidence and organisational context into clear, reasoned guidance on what to do next across the security programme. It should help leaders across security domains choose and act using assessed evidence, business objectives, organisational capabilities, competing priorities, constraints and policy. The intended output is a useful set of options with consequences, uncertainty, conditions and next actions, supported by reasoning someone can inspect and challenge.

The founder confirmed that Crowbo should serve both security leaders accountable for the whole programme and leaders of individual security domains. Domain leaders need guidance for their area; programme leaders need to compare priorities, dependencies and resource choices across areas. Both should use the same assessed evidence and organisational context. The initial buyer is a Head of GRC or Security Assurance at a SaaS or AI company with an established programme, initially focusing on US companies after their first audit cycle. Customer commitment and willingness to pay remain to be established.

The initial portfolio comprises remediation tracking, access reviews, and issues and exceptions management. Bring relevant internal operational and business context into these existing jobs. GRC coordinates the work; an accountable owner authorises choices and a delivery team implements and verifies changes. A source assignee or GRC requester does not automatically hold authority over another team's access or capacity. The portfolio does not select a launch order, require three equally complete modules or establish the commercial entry point. The existing access experiment remains an implementation starting point.

The intended learning loop retains contextualised recommendations, accepted, revised or rejected choices, reasons, corrections and reported outcomes. Acceptance does not establish a good outcome; outcome claims need their own evidence. These records may inform reviewed improvements to retrieval, criteria, alternatives and reasoning, including evidence weights where justified. Automatic adaptation and validated learning are not current capabilities. Cross-customer learning requires appropriate rights and evaluation. Operational control assessment, business importance and delivery feasibility are separate judgments.

People using Crowbo and existing assistants should be able to use the same decision capability through a UI or tools such as an API or MCP. Each interaction should refer to the same evidence and recommendation versions within the caller's permissions. Every workflow needs its own domain facts, criteria and evaluation. Control testing and reassessment are possible later applications, not a fourth initial workflow.

The longer-term ambition is to power agents and autonomous security programmes within customer-defined authority. The initial application remains advisory and read-only with respect to source systems. Observable execution, outcome verification and enforceable authority are additional requirements, not consequences of exposing an MCP tool.

Third-party reassessment and vendor management are outside the initial scope. Crowbo is not being scoped as a TPRM product. Software upgrades can be cases within remediation or exception treatment. Investment, staffing and programme changes remain possible later applications, not a build list.

The intended evidence includes operational observations, business commitments, team capacity and stated capabilities, ownership, dependencies, company-specific rationale and prior decisions. Ingest the permitted sources needed for a useful decision first. Expand coverage as real questions require it. Information absent from source systems may require an attributed answer from an accountable person.

### Narrative and long-term ambition

Crowbo is the decision engine for security. It brings evidence from the company's tools together with business context to guide what to fix, fund, build or drop. The long-term ambition is to codify good security judgement so people and agents can apply it across security, at scale and in real time.

The founder's thesis is that GRC should connect risk, controls and business priorities to security decisions. Much of its tooling has concentrated on streamlining audit- and compliance-adjacent workflows. Crowbo starts with GRC to deliver that broader decision-making role. GRC provides a buyer, an existing budget and a view across security domains. The security-wide purpose defines Crowbo from the outset.

The first purchase should address a concrete question: which security improvements deserve the team's time next, and why? The initial workflows below supply the evidence and decision loop. Crowbo should explain what the evidence establishes, compare feasible responses, identify displaced work and revisit the recommendation as evidence, commitments or capacity change. Describing this only as recurring control reviews understates the job the product performs.

Codifying judgement means making expert criteria, evidence assessment and decision reasoning reusable in software, while adapting their application to the organisation and the decision. Security leaders contribute and challenge that expertise. Crowbo makes it available throughout their programmes and workflows, including to agents. A later startup offering could guide the customer's own people using the same engine.

The long-term company ambition is the decision infrastructure that powers the security programme. The same engine could eventually direct agents and headless security tools, enabling autonomous security work within the customer's explicit policies and authority. That requires observable execution and outcome checks as well as sound recommendations. This extends the vision beyond guidance while leaving the initial read-only application and simulated proof unchanged. Orchestration and autonomous programmes are future capabilities to build and evaluate.

On 25 September 2026, the founder replaced the brief "AI CISO" framing with this ambition. The role label risks implying executive replacement or commoditisation and obscuring Crowbo's relationship with its buyers. Keep the security decision engine as the company definition. "In real time" describes the ambition to apply current context when a decision is needed and revisit guidance as relevant facts change. Latency, source freshness and decision quality remain to be measured.

The narrative should follow this order:

1. Security teams have more tools and information, while deciding where to spend time and money still requires assembling the programme's context.
2. Crowbo assesses and weighs that evidence, applies business priorities and constraints, and recommends the next action with reasons.
3. GRC and Security Assurance teams are the entry point. Remediation tracking, access reviews, and issues and exceptions management make the initial applications concrete.
4. Retained decisions, reviewed outcomes and customer-approved corrections inform subsequent guidance.
5. The same engine extends to investment, capacity and other decisions across security, serving both people and agents.

The commercial story must connect the existing work and budget to customer acquisition, software delivery, recurring value and expansion. An annual subscription describes the revenue model; the business also depends on solving a recurring decision problem through a shared product. Founder expertise shapes the criteria and early onboarding. Customer teams should receive useful recommendations without requiring bespoke founder analysis on every cycle. Exact pricing, personal relationships and fundraising discussions remain in the private deck materials.

The proposed acquisition strategy is to land with GRC leaders through the founder's practitioner network, prove useful control priorities from fresh source evidence, and expand through the value those leaders bring to their CISOs. Start with the systems customers already use and narrowly scoped, authorised read-only access. Familiar source systems do not transfer another product's credentials or permissions to Crowbo. The decision method, evidence weights and business context should provide the additional depth. Existing GRC platforms can remain systems of record while Crowbo earns a recurring role in programme decisions. Stronger GRC insights should create demand from CISOs and other security teams for their own use. This is a proposed adoption path, not an observed sales funnel or demonstrated customer result.

State the thesis, chosen direction and ambition with conviction. Keep the status of product capabilities and measured outcomes clear in the appropriate place. The [evaluation contract](EVALUATION.md) governs whether codified expertise produces useful, supported decisions and how that result compares with capable alternatives.

Two public founder analyses support the GRC entry strategy: [GRC Market Evolution, April 2025](https://ventureinsecurity.net/p/grc-market-evolution-how-the-automation) distinguishes buyers by operating needs and integration constraints; [The AI-Era GRC Market, September 2026](https://www.returnonsecurity.com/p/ai-era-grc-market) explains the gap between administrative automation and consequential security decisions. Use their market reasoning alongside customer evidence rather than treating the essays as proof of Crowbo demand.

### Founding narrative

The founder's thesis, clarified on 22 September 2026, is that security's information supply has grown faster than its ability to turn that information into good decisions. More tools generate more telemetry and findings, and can add noise without a corresponding improvement in useful signal or clarity about how to steer the programme. Tool sprawl has been joined by context sprawl: evidence and assumptions are distributed across products, tickets, documents, conversations and agent sessions. Bringing those records together helps, but the team still needs to decide which evidence matters, what it supports and which action deserves scarce time and money. This is a founder market thesis to test, not a measured industry-wide signal-to-noise result.

The founder identifies a current source of buying urgency: leaders face more security tooling choices, especially around AI security, while still struggling to judge which investments would improve their organisation's security posture. In his account, AI has not yet provided the decision support these leaders need. This is a market observation to investigate, not a universal claim about AI's usefulness. Crowbo should help compare buying, building, improving existing capabilities and deferring work against the organisation's actual exposure and constraints. AI security illustrates the urgency; the company purpose remains programme-wide decision infrastructure.

The founder also describes leaders relying on a small set of trusted security vendors for programme advice. Those vendors have a commercial interest in customers adopting and implementing their solutions. He wants to provide the judgment leaders seek from those relationships. Crowbo's proposed role is a trusted source of guidance grounded in the customer's programme, using evidence and context across vendors and domains. This is the founder's account of an existing behaviour and the intended alternative, not a finding that vendor advice is uniformly unreliable. Source interests belong in the assessment of a claim alongside its supporting evidence. A claim of independence alone does not establish decision quality.

Crowbo's intended contribution is to turn security data into context-aware programme guidance at scale. Classification, evidence weighting and contextual reasoning serve that purpose. Signal is relative to a decision: an observation matters because of what it establishes about a relevant system, control or risk scenario, and how it affects the available actions. Programme guidance should make clear which controls need attention, where limited capacity should go, what information is worth obtaining and when an earlier priority should change.

The founder describes a gap between operational evidence, the GRC records built from it, and the decisions a security leader needs to make. GRC data often describes or assesses work and data in live systems. A shared data model can connect those records and support automation, while the CISO still has to assemble their programme implications through meetings, ticket reviews and presentations from domain leaders. Crowbo should use risk management as a common basis for interpreting that evidence across security domains, comparing priorities and directing the programme. Its guidance should connect back to the underlying systems and incorporate the organisational context supplied by people. This is the founder's observation and intended product contribution, not a claim that all GRC data is indirect or that source-system data alone determines the right decision.

In the founder's examples, tooling and build-versus-buy decisions fail through underestimated opportunity cost, onboarding and integration effort, difficulty making the capability useful, and weak follow-through on benefits. An installed tool can also influence which work the team chooses simply because the tool exists. Crowbo should compare what each option would change in practice against its full costs, displaced work and feasible alternatives. Benefits need an explicit outcome and time horizon, including which decisions or actions would improve. Tool adoption or additional findings alone do not establish return on investment. These examples clarify the problem; they do not change the selected first-proof scope.

Practitioner judgment and capable model reasoning are essential inputs. Crowbo should make the method around them explicit: the objective, feasible alternatives, evidence quality, expected consequences, uncertainty, constraints and conditions that would change the answer. The problem is not that practitioners lack expertise or that language models cannot reason. It is that a recommendation can sound convincing while leaving its deciding assumptions untested and its trade-offs implicit.

Advancing AI cyber capability increases the urgency of revisiting those assumptions. In a controlled evaluation, [the UK AI Security Institute reported](https://www.aisi.gov.uk/blog/our-evaluation-of-claude-mythos-previews-cyber-capabilities) that Claude Mythos Preview completed a 32-step simulated corporate network attack in 3 of 10 attempts. The range lacked active defenders and defensive tooling; this is not evidence of success against well-defended production systems. Crowbo's inference is that material capability changes should prompt teams to reassess the basis for their security priorities. Basic controls remain valuable.

The opportunity is to put decision science into recurring security work. Existing methods already connect risk priorities, enterprise objectives and response options, as [NIST IR 8286B](https://csrc.nist.gov/pubs/ir/8286/b/upd1/final) illustrates. Crowbo should connect that discipline to current evidence, expert criteria, model reasoning and a retained record of decisions and outcomes. It should help a team choose an action, identify the information worth obtaining before choosing, and recognise when an earlier choice needs to change.

The investor narrative connects **tool sprawl and context sprawl** to the product promise: **turn security evidence into clear programme direction.** Security decision infrastructure is the reusable method behind that promise. Contextual control assessment was the preferred first application in the September founding interviews; the 29 September portfolio below governs the current scope. The prevalence and cost of the decision gap, Crowbo's advantage over a capable model or skill, and customers' willingness to pay remain hypotheses to test under [the evaluation contract](EVALUATION.md).

Lead the narrative with the security decision gap and Crowbo's purpose above. Evidence assessment, decision methods, the organisation graph, comparable decision data and the harness explain how Crowbo could deliver that purpose. Their value as models improve belongs in the supporting argument about defensibility. Individual applications illustrate the broader vision. Keep this hierarchy stable as interview answers refine particular parts of the pitch.

### Underlying vision

The long-term goal is to index the security team's data across its authorised sources and make that knowledge usable for decisions. This includes the programme's evidence, policies, system records, assessments and working context. Each record should retain where it came from, what it concerns and when it applies.

The organisational context is part of the evidence used to reason about a decision. The founder's build-versus-buy examples include available time, team composition, current projects and their relative priority, bandwidth, and relevant engineering skills evidenced by past pull requests and resumes. These are illustrative, non-exhaustive inputs. The same approach should apply across network, identity, endpoint, cloud, application, SaaS, governance and other security domains. Each decision and organisation determine which inputs matter and how they should be assessed and weighted; a tooling decision is one illustration of the shared capability.

Evidence of experience should remain specific to the work under consideration. Preserve the distinction between claimed experience, observed contributions and current availability when interpreting authorised work records. The intended use is to understand whether an option is feasible for the organisation, with source limitations and uncertain assumptions visible.

Experts define how evidence should be assessed and weighted, including the significance of its source. A classifier such as Jev may help interpret evidence against those criteria. Explicit rules apply the expert-defined logic. An LLM receives the relevant evidence, its assessed weight and limitations, and the business context to reason about the best course of action.

The intended shared loop has these functional layers. They describe responsibilities; implementation boundaries and the exact classification scheme remain open.

| Layer | Contribution to programme guidance |
| --- | --- |
| Index | Connect authorised sources and retain subject, scope, period and provenance so records can be traced and selected for a question. |
| Classify | Identify what a record is and what claim it supports. Illustrative types include observed behaviour, policy requirements, assertions and model inferences. |
| Weigh | Apply expert-defined criteria to evidence strength for the claim, including source, relevance, directness, freshness, coverage and contradictions. Preserve why the evidence carries weight. |
| Contextualise | Relate the assessed evidence to business objectives, relevant systems and risk scenarios, existing controls, capacity, constraints and decision authority. |
| Guide | Use model reasoning with explicit rules and calculations to compare feasible actions, recommend priorities, and identify missing information that could change the choice. |
| Reassess | Retain the recommendation and separate owner decision; use changed facts, reviewed corrections and observed outcomes to revisit the guidance. |

The system should learn from expert corrections and observed success or failure. Capture which facts mattered, what was missing, why a recommendation changed and whether the chosen action achieved its intended result. Improvements to criteria and evaluations should be explicit and versioned. A favourable outcome alone does not establish that the reasoning was sound.

On 25 September 2026, the founder clarified the proposed learning loop. Continued indexing should connect the context behind a recommendation to the human or agent decision actually observed or recorded, then to later feedback and available outcomes. Acceptance, manual changes, reversals and satisfaction can inform that review. Crowbo should suggest adjustments to evidence weights; customers can accept the proposal, edit the weights manually or leave them unchanged. Automatic weight changes were not selected. An agent requesting guidance does not establish which action it executed. Keep changes in evidence credibility distinct from changes in business priorities, feasibility and mandatory policy constraints. This retained decision history and the customer's reviewed corrections are intended to improve future recommendations; the learning mechanism and its effect on decision quality remain to be evaluated.

The working design interpretation is to assess evidence for a particular claim. Source provenance is one dimension alongside relevance, directness, freshness, coverage and contradictions. Repeated reports derived from one underlying observation should not count as independent corroboration. Deterministic rules, model predictions and model confidence have distinct roles. Their combination, numeric weights and calibration are still design questions to test. The LLM should retain access to supporting records and unresolved conflicts alongside any summary scores.

Broad indexing is the long-term ambition. A bounded first experiment can use a few representative sources to test the complete method. Every initial workflow should exercise this shared evidence-and-decision loop; its narrow scope should not become the definition of Crowbo.

On 23 September, the founder described testing a single control in its wider context as the preferred first customer application. Relevant context may include applicable policies, commits and reviews, recent work, recorded explanations and dependencies, relevant experience, capacity, the programme's top risks, business model and customer commitments. These are candidate inputs selected for the question, not a mandatory ingestion list. The intended result combines a supported assessment with guidance about what to investigate, improve or prioritise next. Faster and cheaper testing, better decisions and explainable reasoning are intended benefits to measure, not established outcomes.

The proposed proprietary method should distinguish evidence strength, business significance and the feasibility of an action. A policy states a requirement; operational records can support or contradict a claim that it was met. Relevant experience may inform who could deliver a response, while commercial commitments may affect its urgency. Neither establishes that a control operated effectively. Use work records for task-relevant facts and dependencies rather than inferring general employee quality from communication style. Customer-adjustable priorities and assumptions remain a design hypothesis; keep their changes reviewable and separate from the underlying observations and evidence limits. An unexplained universal score would obscure the reasoning the product is meant to expose.

The founder sees recurring use in control hardening, investment and tooling choices, capacity and hiring needs, coordination between teams, risk prioritisation, incoming requests and vulnerability management. He proposes starting with one control, expanding to other controls, then connecting their implications to programme capacity and priorities. This describes a potential adoption path, not a commitment to build all applications at once. Guidance for agents is part of the vision; model recommendations still require a separate source of decision and execution authority.

The preferred commercial form remains software with recurring access to programme-specific guidance. The founder permits services alongside it where useful, such as setup, expert review or a completed assessment. The balance of product and service delivery, billing unit and price remain hypotheses. This does not change the previously stated startup-use-case boundary: Crowbo guides the startup's own people. Record exact pricing discussions and customer-validation notes in the private fundraising brief, outside this public repository.

Scale means applying a consistent method across many sources and recurring decisions while preserving each programme's context and the ability to review exceptions. Demonstrating it requires useful guidance, retention of material facts and manageable review and correction effort. Collecting more records or suppressing more alerts alone does not establish that result.

The founder's experience helping GRC leaders steer their programmes is a starting asset for the decision method and initial cases. Capture how he finds deciding facts, challenges assumptions, weighs evidence, considers alternatives and recognises when an accountable owner must decide. Practitioner contributions can extend and challenge those cases. Preserve the distinction between recalled experience, documented decisions and verified outcomes. Founder-authored criteria and cases still need review under the evaluation contract; experience does not by itself establish a validated dataset or product advantage.


Historical Épreuve work remains unchanged. Its audit-service model and roadmap are not inherited by Crowbo. Reuse needs a concrete question, inspected material and suitable rights. Do not migrate its note corpus by default.

### Supporting argument: model progress and defensibility

In response to the question of what keeps Crowbo valuable as models improve, the founder identified a decision system with explicit evidence weights, a custom graph of the organisation, a dataset of decisions at comparable companies, and a harness that supports the decision process over time. These are supporting capabilities and proposed sources of advantage within the overarching security decision infrastructure vision. Better models should improve reasoning within that system. Its value should not depend on a particular model limitation persisting.

| Proposed asset | Contribution |
| --- | --- |
| Decision system | Apply expert-defined criteria, evidence weights, constraints and calculations to a decision. Preserve their rationale and versions, and test them against reviewed cases. |
| Organisation graph | Connect evidence with the systems, controls, people, priorities and constraints it concerns. Retrieve the relationships relevant to the decision, including their source and time. A Crowbo-specific graph is the proposed design direction; implementation, retrieval speed and any unique advantage remain to be demonstrated. |
| Comparable decision dataset | Show how companies with relevant risk posture and circumstances approached a decision, why they chose an option and what outcomes are known. The intended asset includes context and reasoning alongside the choice. Its coverage, quality and advantage must be established. |
| Security decision harness | Coordinate retrieval, model reasoning, explicit checks and review. Retain the evidence basis and decision history across sessions, and trigger reassessment when relevant conditions change. Models and orchestration details should remain replaceable. |

Company similarity is specific to the decision. Risk posture, business objectives, exposure, controls, available capabilities and constraints are possible comparison dimensions, not an exhaustive list or one universal peer score. A popular peer choice is a reference point, not evidence that the same choice is right here. Distinguish expected benefits from observed outcomes, preserve missing follow-up and check whether an outcome can reasonably be attributed to the decision. These comparisons should inform the method without overwhelming stronger evidence about the organisation itself.

Use cases only with rights for their intended use, including any learning or comparison across companies. A customer's private organisational graph and a shared comparison dataset have different access boundaries. The founder's experience and permissioned practitioner contributions can seed the method; no access to a cross-company dataset, customer permission or measured data advantage has been established. Keep public development fixtures synthetic or appropriately licensed.

The technical case should describe measurable failure modes rather than claim that next-token prediction prevents reasoning. [Liu et al.'s 2024 study](https://aclanthology.org/2024.tacl-1.9/) found sensitivity to the position of relevant information in the long-context tasks and models it tested. That motivates evidence-order and retrieval evaluations for Crowbo; it does not establish a permanent limitation of every current or future model. [Anthropic's April 2026 harness account](https://www.anthropic.com/engineering/managed-agents) describes model improvements making an earlier context-reset workaround unnecessary. Keep the domain method, source records and decision history while testing and removing orchestration that no longer helps.

The pitch should describe these as proposed sources of advantage. A graph, a harness or explicit weights alone do not establish defensibility or decision quality. The claim to test is whether their combination with reviewed security knowledge and relevant decision history produces useful guidance that is difficult to reproduce with a capable model or skill on equivalent information.

### Near-term founder priority

On 22 September 2026, the founder clarified that he wants to pursue venture funding and reach the market soon, with limited building before those conversations. Funding should enable him to work on Crowbo full-time and accelerate delivery. Customer discovery and fundraising preparation should proceed alongside a small demonstration of the underlying method. The long-term infrastructure vision guides the company; early work should make a specific buyer's problem, the proposed improvement and the reason to build Crowbo concrete.

Choose bounded work that helps a prospective buyer or investor assess the proposition: a clear company narrative, a demonstrable decision workflow, evidence of customer commitment and a funding plan tied to the next product and commercial milestones. The current preparation target is an investor slide deck using [the selected Crowbo identity](../design/BRAND.md). Scope the first demonstration to a short, explicit timebox. Its exact duration, control case, financing target and transition date remain open. Describe demonstrations, reviewed judgments and customer outcomes at their actual level of maturity, using [the evaluation contract](EVALUATION.md).

Keep the pitch and current grilling at the company-vision level. Lead with the common decision method across security domains and its ability to account for the organisation's reality. Use individual decisions and criteria to make the vision concrete. Detailed scoring rules and individual build-versus-buy trade-offs can be resolved through later case work.

## Decisions made

| Decision | Basis | Consequence |
| --- | --- | --- |
| Crowbo is the name and new working home | Founder direction, 21 September 2026 | Work in the existing Crowbo checkout and its GitHub repository. |
| Security decision infrastructure is the working descriptor | Founder direction | Build reusable software and domain concepts for decisions. |
| Codify good security judgement for application across security, at scale and in real time | Founder refinement, 25 September 2026, superseding the brief AI-CISO framing | Keep the security decision engine as the company definition. Extend practitioners' expertise to people and agents, starting with GRC and Security Assurance teams and contextual control decisions. |
| Shared core: indexed security-team knowledge, expert-defined evidence assessment, and LLM reasoning | Founder clarification, 22 September 2026 | Keep the underlying vision above independent of the first application; providers and weighting methods remain candidates. |
| Intended buyers include both programme-wide security leaders and individual security domain leaders | Explicit founder clarification, 22 September 2026 | Support decisions within a domain and across the programme using the shared method and organisational context. |
| Vendor commissions and paid recommendation placement are ruled out for now | Explicit founder confirmation, 22 September 2026 | Exclude referral commissions and paid placement involving vendors Crowbo evaluates. Keep the revenue plan customer-funded. |
| Value should persist as models improve through the decision method, organisation graph, comparable decision data and harness | Founder clarification, 22 September 2026 | Treat these as sources of advantage to build and evaluate; keep model providers replaceable and the first proof bounded. |
| Earlier direction: contextual control testing and the resulting action decision | Founder interview, 23 September 2026 | Historical scope, superseded by the 29 September portfolio below. Retain the assessment, response and reassessment method. |
| Services may accompany the software where useful | Founder clarification, 23 September 2026 | Explore bounded delivery support without assuming service revenue proves repeatable software. |
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

### One complete loop

1. State the decision owner, question or control claim, objectives, scope, time horizon, constraints and available authority.
2. Inspect operating evidence, applicable requirements and relevant programme context. Establish what the evidence supports, contradicts or leaves unresolved about the claim. Keep sources, coverage and assumptions visible.
3. Compare feasible responses, including improving an existing control or process, gathering deciding evidence, changing capacity or investment, and deferring work. Explain why an option is feasible or excluded.
4. Apply explicit policy constraints and any justified calculations. Expose inputs, units, uncertainty and versions. Do not turn finding counts into a universal risk score or invented loss estimates.
5. Recommend an option or request deciding information. Explain the trade-offs, remaining uncertainty, conditions, accountable owner and next action.
6. Record a simulated decision separately from the recommendation. Preserve the human's choice and rationale, including legitimate disagreement.
7. Change a material fact and reassess. Link the new assessment to the original basis; retain the original record. Rewording alone should not change the substantive outcome.

### Earlier prioritisation experiment

The earlier question asked what GRC and security engineering should prioritise over the next two working weeks. Its rule remains: honour genuinely non-negotiable commitments, then use remaining capacity to reduce the most consequential security exposures. A commitment needs evidence of its obligation, deadline, consequence and accountable owner's confirmation that it cannot be deferred within the window. Other teams' work depends on confirmed capacity. This remains a prior case for the broader method.

### Connected implementation direction

The architecture is one small TypeScript backend on Cloudflare Workers with one EU Durable Object per tenant as the system of record, Turbopuffer with native Voyage embeddings as the search index, Jev through Cloudflare, and a reasoning model ([ADR 0001](adr/0001-typescript-on-workers-with-tenant-durable-objects.md)). Existing historical experiments are not design inputs. The [backend brief](TECHNICAL-PLAN.md) records why each dependency remains.

The source preparation and retrieval path is implemented. The new review operation accepts explicit evidence IDs and a model configuration; its engineering tests do not qualify the recommendation's professional judgment. No recurring schedule, hosted service or production authentication is selected.

## Domain and technology hypotheses

The conceptual model should connect objectives and constraints, actors and authority, systems and data dependencies, claims and evidence, requirements, risk scenarios and protection, options, decisions and outcomes. These relationships are candidates to test against cases. A vocabulary alone does not establish causal effects, and each concept does not need its own service.

Separate model interpretation from deterministic checks and calculations. Both may support a recommendation; neither grants decision or execution authority. Evidence quality is relative to a question, subject, scope and period. Preserve contradictions and unknowns instead of averaging them into a credibility score.

| Candidate | Possible job | Evidence needed before adoption |
| --- | --- | --- |
| Jev | Versioned classification and assessment of permitted evidence | Compare usefulness and cost with enrichment disabled; a stored score needs defined criteria and is not universal decision priority. |
| turbopuffer | Primary evidence storage and retrieval for the connected experiment | Prove the record, recovery, access and retrieval requirements in the storage comparison. |
| Policy-as-code, potentially OPA or Cedar | Evaluate explicitly defined constraints or authority rules | Policy semantics, uncertainty handling and a reason a simpler evaluator is insufficient. "PolicyScore" was a dictation error, not a selected engine. |
| FAIR or FAIR-CAM | Quantify a suitable risk scenario using ranges and explicit assumptions, including where direct data is incomplete | A justified scenario, input basis, calibration and transparent calculation. Retrieved documents are not a risk engine. |
| GRCX concepts | Inform a challengeable model of the programme and its relationships | Selective review of authoritative current material when a specific design question requires it. An older snapshot is not current authority. |
| Decision science or COM-B | Explore adoption, capability, capacity, authority, incentives and timing | Testable explanations tied to the case. Do not infer private mental states or profile employees. |

Keep providers replaceable. Model training, a universal data lake, persistent customer access and a services architecture are not prerequisites. The aim is useful risk-informed reasoning without requiring customers to adopt CRQ terminology.

Start with the decision and choose analytical methods that help resolve it. CRQ is an analytical input where justified estimates improve the choice, not the product's organising proposition. On 22 September 2026, the founder rejected SAFE as a positioning exemplar for Crowbo; do not use it as that comparison. The founder's views about CRQ adoption and the absence of a category winner remain market judgments, not established industry-wide facts.

The founder clarified that incomplete data should not prevent useful quantitative decision support. Use ranges and explicit assumptions to approximate costs, benefits and risk where an appropriate scenario and estimation basis can be established. Leaders should see the assumptions underlying the comparison and retain responsibility for the decision. Exact inputs and point estimates are not prerequisites.

The founder confirmed that Crowbo may propose missing ranges using available evidence, relevant reference data and explicit assumptions. Keep provisional estimates identifiable and their basis visible. Focus expert review on assumptions that could reverse the recommendation or materially change the downside, rather than requiring experts to supply every estimate before analysis begins. This is a product-design decision; the estimation method and review triggers still require evaluation.

The working design interpretation is to distinguish observations, expert estimates, reference data and provisional model-generated assumptions. Record the basis and meaning of each range and show which assumptions materially affect the preferred option. A range represents uncertainty; its existence alone does not establish accuracy or a good decision. The rule for choosing when plausible assumptions favour different options remains an open design question.

The intended durable advantage is the decision method, domain criteria, permitted organisational context and a history of reviewed decisions, corrections and evidenced outcomes, tested through qualified evaluations. A particular model or database does not establish that advantage. A cheaper or replacement model must meet the quality requirements for its assigned decisions.

The founder's economic hypothesis is that cheaper, faster contextual judgment will make it useful in more existing workflows and agents. Measure useful decisions and human review effort alongside cost, latency and quality. Distinguish reuse of a still-valid assessment, a bounded fresh assessment and a new investigation. Changed evidence, policy or permissions can invalidate reuse. Subsecond decisions and economical operation on cheaper models are targets to test, not demonstrated guarantees. [The Jev enrichment proposal](JEV-ENRICHMENT.md) owns the candidate reuse and model-comparison details.

The current calculation's narrower implementation and the remaining evaluation work belong in [the backend brief](TECHNICAL-PLAN.md).

## Current work package

The implemented access-decision experiment remains useful within the agreed portfolio. [The backend brief](TECHNICAL-PLAN.md#portfolio-reconciliation-29-september-2026) owns the smallest proposed contract changes and next verifiable units; [the evaluation contract](EVALUATION.md) owns qualification. This documentation reconciliation does not implement the other workflows or authorise new data transfers. Reuse only permitted evidence within its existing processing scope. Synthetic records support public regression tests and manufactured failure cases; private records remain outside the public checkout. Plan the change and its security considerations before code.

Test the recommendation, alternatives, unresolved inputs and reassessment against reviewed deciding facts. The application now records an attributed simulated choice, correction or reported outcome separately from the recommendation, and links it to an explicit reassessment. This is operator attribution, not authenticated owner approval or verified outcome evidence. Compare the same cases with a capable raw model and a skill using equivalent facts and permissions. Keep behavioural correctness, judgment quality and commercial validation as separate results.

The [measurement plan](MEASUREMENT-PLAN.md#workload-study-proposal) owns the proposed study of recurring GRC work, manual effort and incremental value from judgment and wider context. Comparative demand, build order, commercial entry point, qualified criteria and performance thresholds remain open. Separate a finite demonstration, an assisted real-data pilot and a dependable product. Founder interventions and customer interest must not be reported as reproducible software judgment or paid demand. None of these open questions justifies a broader framework or corpus before a useful complete decision loop.

## Positioning and source context

The selected identity is owned by [the Crowbo brand guide](../design/BRAND.md): the pixel corvid, the lowercase wordmark and the specified palette. Preserve its serious engineering presentation and do not copy existing game character art. The founder confirmed purchasing crowbo.ai. Its public Command Room prototype was verified live on 29 September 2026 and replaced the same day by the Decision Studio build, which now lives at `/demo/` alongside the approved company landing page at `/`; no sign-in exists yet. Trademark clearance, incorporation and handle reservations are not established by that deployment.

Founder relationships, practitioner standing and audience are starting advantages. They do not establish paid demand, organisational endorsement, customer acceptance or viable economics. Founder observations about incumbent quality and CRQ adoption remain market judgments to test.

The handoff identified these Simon Eskildsen/turbopuffer discussions as research pointers:

- [AI Engineer / Pragmatic Engineer discussion](https://turbopuffer.com/blog/video-ai-engineer-pragmatic-engineer)
- [Additional interview](https://www.youtube.com/watch?v=bWyOyyrVIXk)
- [PMF Show publisher transcript](https://turbopuffer.com/blog/podcast-pmf-show-he-built-new-database-bedroom-now-powers-cursor-notion-anthropic)

The transferred lessons are to start with a valuable workload, choose a small set of reusable concepts, preserve simple invariants and measure behaviour. The handoff reports reviewing relevant transcript sections, not every audiovisual minute. This setup has not independently reviewed those sources. They do not validate Crowbo's demand or economics; do not add full transcripts to this repository.
