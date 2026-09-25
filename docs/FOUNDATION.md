# Crowbo foundation

Status: foundation established 21 September 2026; narrative, initial application and ambition to codify security judgement clarified through 25 September 2026. This document owns the enduring product direction and the status of its first experiments. Architecture proposals and evaluation expectations remain provisional where marked.

## Product direction

Crowbo is infrastructure for security decision-making. Its purpose is to turn fragmented security evidence and organisational context into clear, reasoned guidance on what to do next across the security programme. It should help leaders across security domains choose and act using assessed evidence, business objectives, organisational capabilities, competing priorities, constraints and policy. The intended output is a useful set of options with consequences, uncertainty, conditions and next actions, supported by reasoning someone can inspect and challenge.

The founder confirmed that Crowbo should serve both security leaders accountable for the whole programme and leaders of individual security domains. Domain leaders need guidance for their area; programme leaders need to compare priorities, dependencies and resource choices across areas. Both should use the same assessed evidence and organisational context. The initial buyer is a Head of GRC or Security Assurance at a SaaS or AI company with an established programme, initially focusing on US companies after their first audit cycle. Customer commitment and willingness to pay remain to be established.

### Narrative and long-term ambition

Crowbo is the decision engine for security. It brings evidence from the company's tools together with business context to guide what to fix, fund, build or drop. The long-term ambition is to codify good security judgement so people and agents can apply it across security, at scale and in real time.

The founder's thesis is that GRC should connect risk, controls and business priorities to security decisions. Much of its tooling has concentrated on streamlining audit- and compliance-adjacent workflows. Crowbo starts with GRC to deliver that broader decision-making role. GRC provides a buyer, an existing budget and a view across security domains. The security-wide purpose defines Crowbo from the outset.

The first purchase should address a concrete question: which security improvements deserve the team's time next, and why? Contextual control assessment supplies the initial evidence and decision loop. Crowbo should explain what the evidence establishes, compare feasible responses, identify displaced work and revisit the recommendation as evidence, commitments or capacity change. Describing this only as recurring control reviews understates the job the product performs.

Codifying judgement means making expert criteria, evidence assessment and decision reasoning reusable in software, while adapting their application to the organisation and the decision. Security leaders contribute and challenge that expertise. Crowbo makes it available throughout their programmes and workflows, including to agents. A later startup offering could guide the customer's own people using the same engine.

On 25 September 2026, the founder replaced the brief "AI CISO" framing with this ambition. The role label risks implying executive replacement or commoditisation and obscuring Crowbo's relationship with its buyers. Keep the security decision engine as the company definition. "In real time" describes the ambition to apply current context when a decision is needed and revisit guidance as relevant facts change. Latency, source freshness and decision quality remain to be measured.

The narrative should follow this order:

1. Security teams have more tools and information, while deciding where to spend time and money still requires assembling the programme's context.
2. Crowbo assesses and weighs that evidence, applies business priorities and constraints, and recommends the next action with reasons.
3. GRC and Security Assurance teams are the entry point. Control assessment and prioritisation make the first application concrete.
4. Retained decisions, reviewed outcomes and customer-approved corrections inform subsequent guidance.
5. The same engine extends to investment, capacity and other decisions across security, serving both people and agents.

The commercial story must connect the existing work and budget to customer acquisition, software delivery, recurring value and expansion. An annual subscription describes the revenue model; the business also depends on solving a recurring decision problem through a shared product. Founder expertise shapes the criteria and early onboarding. Customer teams should receive useful recommendations without requiring bespoke founder analysis on every cycle. Exact pricing, personal relationships and fundraising discussions remain in the private deck materials.

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

The investor narrative connects **tool sprawl and context sprawl** to the product promise: **turn security evidence into clear programme direction.** Security decision infrastructure is the reusable method behind that promise. Contextual control assessment and prioritisation are the preferred first application. The prevalence and cost of the decision gap, Crowbo's advantage over a capable model or skill, and customers' willingness to pay remain hypotheses to test under [the evaluation contract](EVALUATION.md).

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

Beyond the preferred control-assessment application, possible uses include investment, staffing and capacity, tooling, programme changes, vendor or data use, exceptions and treatment. They are possibilities, not a build list.

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
| Preferred first customer application: contextual control testing and the resulting action decision | Founder interview, 23 September 2026 | Select one control and complete assessment, response and reassessment. The earlier tool-versus-capacity example remains development material; the exact first control is open. |
| Services may accompany the software where useful | Founder clarification, 23 September 2026 | Explore bounded delivery support without assuming service revenue proves repeatable software. |
| Initial work uses synthetic or suitable public material | Public repository and bounded proof | No persistent customer access or private evidence is needed. |

## First proof

Tool purchase versus remediation capacity was selected on 21 September and illustrates the method in investor deck v12. On 23 September, the founder favoured contextual control testing as the initial customer workflow, following his concern about the long feedback cycle of investment outcomes. The next case should establish what the evidence supports about one control, compare feasible responses and reassess after a material change. The exact control, customer and pilot scope are still open. Offboarding and production change approval are assistant-proposed examples, not founder-selected controls. This direction does not authorise live access or production actions.

The existing investment example remains useful development material: given a security programme's objectives, current protection, vulnerability workflow and available budget, should the next investment go into another tool, remediation capacity, an improvement using existing resources, or further investigation? The [evaluation contract](EVALUATION.md) retains its synthetic facts. It is no longer the only candidate application or a requirement to build before evaluating the control workflow.

The proof must make the deciding facts visible. More detections do not automatically mean better protection; adding capacity does not automatically fix prioritisation, ownership or deployment constraints. An urgent coverage gap can make another tool the better option. Missing or contradictory evidence can make a specific information request the right next step.

### One complete loop

1. State the decision owner, question or control claim, objectives, scope, time horizon, constraints and available authority.
2. Inspect operating evidence, applicable requirements and relevant programme context. Establish what the evidence supports, contradicts or leaves unresolved about the claim. Keep sources, coverage and assumptions visible.
3. Compare feasible responses, including improving an existing control or process, gathering deciding evidence, changing capacity or investment, and deferring work. Explain why an option is feasible or excluded.
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
| Jev or another classifier | Interpret narrow evidence characteristics against expert-defined criteria for use by explicit rules and the reasoning LLM | Compare with a capable LLM or skill using equivalent evidence and criteria. Model confidence, evidence strength and decision quality must be evaluated separately. |
| turbopuffer | Indexing and retrieval for a demonstrated workload | Current documentation and a workload comparison against simpler storage or direct context. Retrieval performance is separate from decision quality. |
| Policy-as-code, potentially OPA or Cedar | Evaluate explicitly defined constraints or authority rules | Policy semantics, uncertainty handling and a reason a simpler evaluator is insufficient. "PolicyScore" was a dictation error, not a selected engine. |
| FAIR or FAIR-CAM | Quantify a suitable risk scenario using ranges and explicit assumptions, including where direct data is incomplete | A justified scenario, input basis, calibration and transparent calculation. Retrieved documents are not a risk engine. |
| GRCX concepts | Inform a challengeable model of the programme and its relationships | Selective review of authoritative current material when a specific design question requires it. An older snapshot is not current authority. |
| Decision science or COM-B | Explore adoption, capability, capacity, authority, incentives and timing | Testable explanations tied to the case. Do not infer private mental states or profile employees. |

Keep providers replaceable. Model training, a universal data lake, persistent customer access and a services architecture are not prerequisites. The aim is useful risk-informed reasoning without requiring customers to adopt CRQ terminology.

Start with the decision and choose analytical methods that help resolve it. CRQ is an analytical input where justified estimates improve the choice, not the product's organising proposition. On 22 September 2026, the founder rejected SAFE as a positioning exemplar for Crowbo; do not use it as that comparison. The founder's views about CRQ adoption and the absence of a category winner remain market judgments, not established industry-wide facts.

The founder clarified that incomplete data should not prevent useful quantitative decision support. Use ranges and explicit assumptions to approximate costs, benefits and risk where an appropriate scenario and estimation basis can be established. Leaders should see the assumptions underlying the comparison and retain responsibility for the decision. Exact inputs and point estimates are not prerequisites.

The founder confirmed that Crowbo may propose missing ranges using available evidence, relevant reference data and explicit assumptions. Keep provisional estimates identifiable and their basis visible. Focus expert review on assumptions that could reverse the recommendation or materially change the downside, rather than requiring experts to supply every estimate before analysis begins. This is a product-design decision; the estimation method and review triggers still require evaluation.

The working design interpretation is to distinguish observations, expert estimates, reference data and provisional model-generated assumptions. Record the basis and meaning of each range and show which assumptions materially affect the preferred option. A range represents uncertainty; its existence alone does not establish accuracy or a good decision. The rule for choosing when plausible assumptions favour different options remains an open design question.

## First work package

The next bounded build supports the founder priority above: make the selected local decision loop concrete for customer and investor conversations, governed by [the evaluation contract](EVALUATION.md). Start with its open development case, refine the deciding facts and candidate judgments, choose the smallest data contract, then apply the required security analysis before code. Run those conversations alongside the build and use their findings to refine the first application.

Demonstrate a baseline recommendation, a supported alternative, an unresolved case, a simulated owner decision and reassessment after a material change. Compare the same cases with a capable raw model and a skill using equivalent facts and permissions. Keep behavioural correctness, judgment quality and commercial validation as separate results.

Open items are the exact first control case, data contract, implementation stack, evidence-weighting method, specific policy and calculation semantics, reviewed expected judgments, hidden evaluation cases and numeric release thresholds. Resolve these against the underlying vision without restarting broad product discovery.

## Positioning and source context

The selected identity is owned by [the Crowbo brand guide](../design/BRAND.md): the pixel corvid, the lowercase wordmark and the specified palette. Preserve its serious engineering presentation and do not copy existing game character art. No trademark clearance, domain acquisition, incorporation or handle reservation has been established here.

Founder relationships, practitioner standing and audience are starting advantages. They do not establish paid demand, organisational endorsement, customer acceptance or viable economics. Founder observations about incumbent quality and CRQ adoption remain market judgments to test.

The handoff identified these Simon Eskildsen/turbopuffer discussions as research pointers:

- [AI Engineer / Pragmatic Engineer discussion](https://turbopuffer.com/blog/video-ai-engineer-pragmatic-engineer)
- [Additional interview](https://www.youtube.com/watch?v=bWyOyyrVIXk)
- [PMF Show publisher transcript](https://turbopuffer.com/blog/podcast-pmf-show-he-built-new-database-bedroom-now-powers-cursor-notion-anthropic)

The transferred lessons are to start with a valuable workload, choose a small set of reusable concepts, preserve simple invariants and measure behaviour. The handoff reports reviewing relevant transcript sections, not every audiovisual minute. This setup has not independently reviewed those sources. They do not validate Crowbo's demand or economics; do not add full transcripts to this repository.
