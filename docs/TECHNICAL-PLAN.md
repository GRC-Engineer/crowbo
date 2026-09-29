# Connected backend

Updated 29 September 2026. The existing implementation uses one backend, Turbopuffer with native Voyage embeddings, Jev through Cloudflare, and a reasoning model. The three-workflow portfolio below changes planned domain coverage, not this stack or its qualification status. Historical experiments provide no architecture, policy or implementation requirements. No connected module imports them.

[Foundation](FOUNDATION.md) owns the objective. [Data contract](DECISION-DATA-MODEL.md) owns record meaning. [Storage design](ARCHITECTURE-COMPARISON.md) owns layout. [Evaluation](EVALUATION.md) owns judgment qualification.

## One application, two paths

Preparation stores a permitted source revision in Turbopuffer, asks Jev the configured questions and writes text for native Voyage embedding. Assessment and indexing have independent completion states. Either can retry without losing the source.

A review accepts a question, operator context, explicit source IDs and one model configuration. Python reads the permitted source versions and stored assessments, checks all inference grants, makes one reasoning request, checks response structure and citation IDs, rechecks the basis and saves the result in Turbopuffer.

The evidence bundle is ordinary JSON inside that operation. There is no packet service, agent framework or company ontology. Source selection is explicit for this first test; search helps discovery but cannot establish complete constraint coverage.

The first source synchronisation loop reconciles up to five configured Slack threads per command. A direct reader checks the configured Slack account and fetches every page; a private MCP-capture adapter supports the access available in this pilot. The source fingerprint excludes capture bookkeeping. Unchanged refreshes preserve Jev assessments and vectors, while permission changes patch index metadata. Changed content produces a new assessment and reuses vectors only for identical chunk text under the fixed embedding configuration.

Turbopuffer stores the sync checkpoint, selected-source coverage hash, next poll time and freshness deadline. A pending, failed or overdue scope blocks new reasoning. Saved reviews retain their scope hash and become outdated when coverage or a contributing source changes. No model reruns automatically. This is a one-shot polling command, not an installed scheduler or event receiver. [The pilot guide](PILOT.md#slack-synchronisation) owns configuration and commands.

## Dependency audit

The scenario increment adds one direct dependency, the official MCP SDK. Versions are pinned in the lockfile.

| Dependency | Concrete responsibility | Decision |
| --- | --- | --- |
| turbopuffer 1.21.0 | Official database write/query client, native embeddings, provider errors and receipts | Keep; avoid maintaining a replacement database client. |
| httpx 0.28.1 | Cloudflare/Slack REST and restricted provider transports, timeouts and response bounds | Keep; no separate OpenAI, Slack or TypeSafe SDK. |
| pydantic 2.13.5 | Boundary checks for private imports, permissions, settings and native model answers; JSON serialization | Keep. The database SDK already requires it; handwritten substitutes would keep the dependency and add code. |
| mcp 2.2.0 | Official protocol negotiation, stdio framing, tool schemas and client interoperability | Add for the requested MCP interface; avoid handwritten JSON-RPC. |
| pytest | Behaviour and integration-boundary tests | Development only. |
| ruff | Static checks and formatting | Development only. |

The remaining packages are dependencies of these clients. HTTPX uses anyio, certifi, httpcore, h11, idna and typing-extensions. Pydantic uses annotated-types, pydantic-core and typing-inspection. Turbopuffer additionally uses aiohttp, aiohappyeyeballs, aiosignal, frozenlist, attrs, multidict, propcache, yarl, distro, orjson, pybase64 and sniffio. Some serve the SDK's asynchronous interface although Crowbo uses synchronous calls. This trade-off is accepted for the official SDK. Pinning is not a vulnerability assessment.

SQLite is part of Python's standard library. Its local ledger holds request receipts and immutable experiment allocations. A reservation commits before a call, preserving the allowance across failure or restart. It stores no source corpus and performs no search. A separate file lock serializes the local worker. This ledger is not required by Jev or Turbopuffer; it keeps bounded experiments accountable without resetting earlier usage. [The pilot guide](PILOT.md#experiment-allowances) owns setup and legacy compatibility.

The MCP SDK also installs its standard transport/authentication dependencies, including HTTP and cryptography packages. Crowbo runs only stdio and exposes no listening port. The SDK's broader dependency set is accepted for protocol compatibility. No additional database, embedding client, broker or model framework is selected. The risk arithmetic uses Python's standard-library `Decimal`.

## Evidence-bound scenarios and MCP

One `DecisionRequest` describes a case, question, selected source IDs, planning window, objectives and attributed context. Optional expected revision IDs pin a replay to its original evidence. Each run saves the exact request and source/criteria bindings inside the existing immutable review. Case files and expectations remain private; they are data, not a new server-side workflow engine.

Before GLM reasoning, every selected source must have current permissions, completed indexing and a content check within 24 hours. Commitment decisions also require a matching ingestion Jev assessment. Access decisions use the account-specific assessment described below when Jev is enabled. Selected sync scopes apply their tighter freshness rule. Checks, calculation and reasoning use one evidence snapshot. The backend rechecks it before dispatch, persistence and return. History remains subject to current access and reports whether its basis is still current.

Jev answers stay attached to their named questions. They are not averaged into priority or converted into event probabilities. The private experiment adds protection-state, capacity, exposure and dependency questions to the existing commitment criteria. These describe what a source asserts; a deployment claim is not an independent deployment check.

The default decision response now includes up to three deliverable cards, generated in the same GLM call as the recommendation. Each deciding fact is stated, unknown or conflicting. Code binds exact quotations to source revisions and resolves Jev references to their actual stored answers. The [fact contract](DECISION-DATA-MODEL.md#source-bound-deciding-facts) distinguishes these origin checks from semantic correctness. A separate extraction model, graph service and new dependencies were rejected for this increment.

For commitment decisions, the `plain` method gives GLM the same raw source text and policy with Jev assessments omitted and the original prose answer format. This compares the combined Crowbo assistance against raw reasoning, not Jev in isolation. Both methods use GLM high effort with the same 8,192-token completion limit. The prior 4,096-token limit truncated the first live structured response; the unsuccessful receipt is retained.

An optional `access` subject selects [account-specific facts and alternatives](DECISION-DATA-MODEL.md#access-decisions) in that same reasoning call. Its three methods share the access response schema and source input: `plain`, guided `crowbo_without_jev`, and guided `crowbo`. The guided pair uses an identical prompt; only `crowbo` receives contextual Jev answers. All methods omit the general ingestion assessments. The [measurement plan](MEASUREMENT-PLAN.md#access-comparison) owns comparison requirements.

For access decisions, Jev assesses each selected source against the exact requested account, system and scope. The cache key includes source revision, question version/fingerprint and a fixed provider contract. Cached answers retain their model label, timestamp and usage. A checksum detects accidental cache corruption; it is not a signature against a privileged writer. Provider aliases do not identify an immutable deployed model revision. Cache reuse rechecks current reader and Jev processing permission. It never replaces the general source head or mixes one account's assessments into another's. A changed contextual criteria version or provider contract marks historical decisions as requiring reassessment while retaining their original accessible basis.

The first quantitative operation is conditional expected annual loss: events/year multiplied by mean loss/event in one stated currency. Inputs require provenance; missing inputs remain missing. Optional low/high bounds show sensitivity, not percentiles. Counterfactuals stay labelled beside the real evidence. No loss distribution, calibrated forecast, treatment efficacy or independent capacity schedule is claimed.

`mcp_server.py` exposes six bounded tools: `search_evidence`, `inspect_evidence`, `run_decision`, `inspect_result`, `record_feedback` and `inspect_feedback`. Tenant, reader, settings and providers are bound at startup. Each call opens and closes its resources in its execution thread and shares the existing locked allowance ledger. The interface offers no source ingestion, arbitrary file/URL access, shell, authorisation or execution tool. It does not inherit the host's other connectors.

Feedback records a simulated choice, correction or reported outcome without inference. A new case version references it explicitly for reassessment. The [feedback contract](DECISION-DATA-MODEL.md#reported-feedback-and-reassessment) defines immutable retries, attribution and contributor closure. The design comparison selected bounded source-set inheritance over recursive history traversal, then retained independent feedback capture so a failed model call cannot lose a correction. No dependency or provider changed. The result summary exposes `feasibility_checked: false` beside evidence readiness.

The design comparison selected explicit case/revision binding and pure arithmetic, then retained the existing review persistence path. A server-side case registry and Monte Carlo were omitted because neither is necessary for this bounded experiment. The official SDK supports the [2026-07-28 protocol](https://modelcontextprotocol.io/specification/2026-07-28); tests also exercise legacy initialization. [The pilot guide](PILOT.md#scenario-loop-and-local-mcp) owns commands and observed results.

## Model configuration

| Job | Model and route |
| --- | --- |
| Structured judgments | `typesafe/jev`, Cloudflare account REST, native Noul/Choice/Score answers |
| Reasoning, current pilot selection | `@cf/zai-org/glm-5.3-flash`, Cloudflare Chat Completions |
| Reasoning, available comparison | `openai/gpt-6-luna`, Cloudflare Chat Completions |
| Embeddings | `voyage/voyage-4-large`, 1024 dimensions, Turbopuffer native embedding |

Each review chooses one model, an explicit supported effort and a bounded completion budget. The tested Luna route accepts none/low/medium/high/xhigh and rejects max. GLM accepts low/high/max. Unsupported combinations fail locally. DeepSeek V4.1 Flash has no verified configured route and cannot be silently substituted. Model IDs are allowlisted. Source grants and request processing permissions must explicitly permit the selected route.

The request disables gateway payload logging and caching; reasoning sets `store: false`. Record requested/returned model and usage. Provider settings do not independently prove retention behaviour. Documentation, account access, execution and model quality are separate evidence.

Review reads batch the selected IDs using [strongly consistent database queries](https://turbopuffer.com/docs/query). Every inference, persistence and historical-access boundary reads fresh source heads. Each source and assessment keeps its own identity and permission checks. Optional startup group membership is an expiring local assertion, rechecked at these boundaries; it is not refreshed from an identity provider. The [permissions model](PERMISSIONS.md) owns user/group filtering, expiry, source-grant refresh, derived-context rules and the production authentication boundary.

References: [Jev](https://developers.cloudflare.com/ai/models/typesafe/jev/), [Luna](https://developers.cloudflare.com/ai/models/openai/gpt-6-luna/), [GLM](https://developers.cloudflare.com/workers-ai/models/glm-5.3-flash/), [native embeddings](https://turbopuffer.com/docs/embedding).

## Audit changes

- Moved the commitment questions out of provider code. A private versioned question set can configure native Jev judgments without changing storage contracts.
- Replaced commitment-specific answer fields with keyed native answers. Preserve stored source/assessment IDs and question definitions; mark whether an assessment matches current criteria. New criteria trigger assessment, not re-embedding.
- Added one bounded review operation and historical inspection. The result is advisory and simulated. Current access applies to derived history even after it is saved.
- Removed historical proof schemas and design arguments from active documents and corrected stale implementation claims.
- Retained source revision binding, customer/source scope checks, independent retries and the API ledger because they prevent specific failures.

## Module ownership

| File | Responsibility |
| --- | --- |
| `contracts.py` | Source/grant and native answer boundary shapes |
| `questions.py` | Question meaning/version and answer-to-question matching |
| `evidence.py` | Current revisions, access, preparation, recovery and retrieval |
| `providers.py` | Turbopuffer/Jev calls, native embedding and shared transport controls |
| `slack.py` | Account-bound Slack reads, bounded pagination and trusted capture validation |
| `sync.py` | One reconciliation, durable progress/backoff and scope freshness |
| `review.py` | Single reasoning call, citations, retained evidence and historical access |
| `decision.py` | Evidence-bound scenario readiness, attributed calculation and shared review execution |
| `deciding_facts.py` | Exact quotation bindings and deterministic Jev reference resolution |
| `access.py` | Account-specific interpreted facts, option constraints and contextual Jev assessments |
| `decision_page.py` | Private static decision, evidence and history export |
| `feedback.py` | Immutable attributed feedback, historical choice binding and bounded reassessment context |
| `mcp_server.py` | Local protocol adapter with startup-bound configuration and per-call resources |
| `runtime.py` | Private configuration, credentials, allowance and reports |
| `cli.py` | Operator commands |

## Verification and remaining work

### Portfolio reconciliation, 29 September 2026

[Foundation](FOUNDATION.md#initial-workflows) owns the agreed remediation tracking, access reviews, and issues and exceptions management portfolio. Access remains the implemented starting point. Launch order, commercial entry point and depth per workflow are not selected. Third-party reassessment/vendor management is excluded; control testing is a possible later expansion.

Keep the evidence, permissions, immutable review, feedback and explicit reassessment path. [Proposed contract extensions](DECISION-DATA-MODEL.md#proposed-portfolio-extensions) own the missing workflow facts and lifecycle semantics. In particular, today's non-access route uses commitment facts, its window is at most 31 days, and its choices lack an explicit rejection disposition. Passing arbitrary remediation or exception prose into that route is not implementation of the new workflows.

The smallest proposed next units are:

1. Specify one non-access remediation case and one non-access issue/exception case, retaining the existing access case. Identify the next decision, exact required facts, legitimate alternatives, closure/validity conditions and missing authority before output is seen. Confirm evidence rights separately; no new transfer is authorised here.
2. Use those cases to finalise only the workflow-specific contract gaps: case links and criterion selection, implementation/deployment/verification distinctions, exception conditions/expiry, and explicit reviewed-choice meaning. Keep case identity and source contributors intact across transitions. Choose lifecycle dates separately from the short assessment window.
3. After the required pre-code analysis and a bounded implementation scope, exercise one complete new decision loop through the existing CLI/MCP path. Verify saved feedback, revised recommendations, denied access, changed evidence and relevant lifecycle boundaries. No new service, dependency, connector or execution tool is selected by this plan.
4. Apply the [portfolio comparison](MEASUREMENT-PLAN.md#first-test-session). Report engineering behaviour, judgment, customer effort, cost/latency and commercial evidence separately before choosing further build order.

These are proposed verifiable units, not authorisation to implement the portfolio now. Use the customer's current risk method; the existing optional annual-loss calculation is not a mandatory decision layer. Current and proposed risk assessments must remain distinguishable. Candidate expiry or follow-up triggers do not imply an installed scheduler, sent message or automatically reopened issue.

### Security workflow mapping for Decision Studio, 29 September 2026

The founder requested a concrete mapping between the demo and the three agreed security workflows. Keep operational and business context when it changes a security decision. Each prepared question must identify the security problem, the choice being made and what would establish a useful outcome. A general upgrade or launch question does not demonstrate remediation tracking without an identified security finding, treatment and closure basis.

The published `/demo/` and `/demo/?view=workspace` were inspected through the browser on 29 September. The opening journey offers two prepared questions: support access and service upgrade. The access answer compares broad administration with a proposed support role and preserves owner review and permissions testing. It is a security case, though its entry wording emphasises quarter-end reporting. The upgrade answer recommends sign-in and rollback tests before a customer launch; its own sources leave vulnerability exposure and the security impact of delay unresolved. There is no prepared issues/exception question. The workspace opens on support access. All of this is a scripted synthetic walkthrough, not a backend run.

The existing frontend source confirms the gap: `CaseId` in `design/decision-studio/src/question-demo-model.ts` contains only `access` and `upgrade`, and the influence labels are authored fixture values. That frontend file is maintained in the frontend checkout. The mapping below is a candidate development specification, not a new data contract, a qualified answer key or a claim that the backend already supports all three workflows.

| Workflow and proposed opening question | Security evidence and relevant business context | Decision the demo should make inspectable | Backend reuse and missing behaviour |
| --- | --- | --- | --- |
| **Remediation tracking:** "The gateway security fix is merged. What should happen next, and can we close the finding?" | A fictional authentication finding with affected service/version and exposure; agreed treatment and owner; patch review; production version; scoped verification; previous sign-in regression; confirmed change constraints. | Compare supported rollout or interim treatment options. Explain what remains exposed, what the regression changes, who owns the next action and which closure condition is unproved. A later deployment and scoped verification can support proposed closure; a merged PR alone cannot. | Reuse evidence revisions, saved recommendations and reassessment. Add reviewed remediation facts and criteria distinguishing implementation, deployment and verification. The current commitment route does not supply these semantics. |
| **Access reviews:** "Can we remove this support account's standing administrator access without breaking its approved work?" | Exact account and system; current rights to customer data; scoped activity; role catalogue; required exports and infrequent recovery work; owner evidence and access requirements. | Compare supported narrower, retained or temporary arrangements. Explain unnecessary exposure and operational consequences. Introduce a recovery requirement that changes the feasible options, then explicitly reassess. Neither low usage nor a role's name establishes that removal is safe. | Reuse `AccessSubject`, source-bound `AccessFacts`, options, deciding checks and feedback. The backend currently evaluates one account. The UI's existing 12-person scope must become one selected account or explicitly identify account-level results; no cohort-wide approval or aggregation is implemented. |
| **Issues and exceptions management:** "A production service is missing required admin audit logs. Should we remediate now or request a time-limited exception?" | Applicable logging requirement and scope; observed coverage gap; existing issue reference; remediation effort and confirmed constraints; proposed safeguards and their test evidence; exception authority, conditions and validity. | Identify the candidate issue and compare remediation, a supported interim arrangement or a bounded exception request. Explain the consequence of the logging gap. Keep requested acceptance separate from approval. A failed safeguard or expired approval changes the recommendation. | Reuse source interpretation, alternatives, saved feedback and reassessment. Add issue/exception facts and criteria, including authority evidence and separate validity dates. No exception approval, expiry scheduler or automatic reopening exists. |

Use fictional development records for these stories. A safeguard, narrower role or alternative treatment is feasible only when the scenario provides evidence for it. Keep the customer launch, reporting deadline, earlier regression and available engineering time where relevant; a deadline is not automatically a non-negotiable obligation, and claimed availability is not delivery approval. Risk assessments use the customer's method with an identified basis. Do not invent a combined Jev score or a measured risk reduction for the presentation.

#### Source depth through the workflow

The founder confirmed that each story needs depth across the relevant sources and systems as the work progresses. Build that depth around the facts that determine a choice. The same document may support one assertion and leave another unresolved. The source families below are illustrative fixture inputs, not claims of installed connectors or permission to collect new records.

| Source family and example system | Contribution to the decision | Important limit |
| --- | --- | --- |
| Finding or review record, such as a scanner or Vanta | Trigger, affected subject, review scope, finding reference and reported status. | A finding label or completed review is not proof of exposure, effective treatment or authorised acceptance. |
| People directory and identity provider, such as HiBob and Okta | Account-to-person or custodian relationship, current team and relevant role changes. | Names are insufficient joins. Employment status alone does not establish application permissions or whether an account supports automation. |
| Application or cloud permissions | Actual role assignments, inheritance, resource scope and available access arrangements. | The identity provider's group list or a role catalogue does not necessarily describe effective permissions in the target system. |
| Application activity, audit logs and monitoring | Observed use, affected traffic, recording coverage and the observation period. | No matching events may mean no activity, incomplete coverage or failed collection. Preserve the distinction. |
| GitHub, build records, software inventory or SBOM | Proposed fix, changed component, artifact/version relationships and test scope. | Component presence does not prove exploitability; a merged change does not identify what is running in production. |
| Deployment records and scoped verification | Deployed artifact, environment, affected instances, observed behaviour and remaining failed checks. | A successful deployment or one passing test establishes only its stated scope. |
| Policy, runbook and exception register, such as Notion | Applicable requirement, rare required work, approval authority, existing conditions and validity dates. | A runbook describes intended work; an exception request is not evidence of approval or effective safeguards. |
| Linear or another work tracker | Treatment owner, dependencies, blockers, target dates and links to implementation work. | Ticket state and assignee do not establish verification or authority over another team's work. |
| Earlier incidents, reviews and decisions | A previous regression, rationale for access, rejected alternatives and reported outcomes. | Similarity is a reason to investigate the relevant failure path, not proof it will recur. |
| Attributed owner discussions and business records, such as Slack or a commitment record | Why work is needed, confirmed constraints, consequence of delay and delivery feasibility. | A requested launch date, sales opportunity or reported availability is not automatically a binding obligation, approved window or confirmed capacity. |

For every selected record, specify the question it answers, the exact subject and scope it applies to, its version and observation period, what it can establish and what remains unknown. Tie records together with explicit account, system, finding, issue, change and artifact identities. Preserve unresolved joins and competing assertions. Two tools repeating the same original claim do not provide two independent confirmations. An author or owner field does not establish decision authority.

Use the following candidate progressions to prepare the source-shaped development fixtures. These specify evidence relationships and changes to examine, not qualified expected model answers.

- **Remediation:** begin with a fictional authentication finding, a ticket reported complete and a merged patch. Bind a deployment record to the still-affected production artifact. Add the previous sign-in regression, scoped test results and the owner's change constraints. Compare supported treatment options and explain the next deciding check. Then introduce a deployment receipt without adequate verification, followed by a verification receipt for the affected scope. Include a separate failed-test or rollback variation. The UI should show exactly why each new source does or does not support proposed closure, retaining the earlier recommendation.
- **Access:** bind one target account to its owner or custodian, actual application rights, activity period, required tasks and relevant policy. Add the owner's reporting need and an infrequent recovery runbook that the activity window misses. Distinguish a candidate narrower role from tested permissions. In later versions, supply a scoped test of the required work and, only where evidenced, a workable temporary recovery arrangement. Include a failed-fit and an unresolved-identity variation. A reported choice is followed separately by observed permission changes and a workflow check; none of those later records is implied by accepting the recommendation.
- **Issues and exceptions:** join a specific logging requirement to an observed production coverage gap and an existing issue where one exists. Compare remediation with any supported interim safeguards, using effort, delivery constraints and owner input. Keep a proposed exception's scope, authority, conditions and expiry explicit. Introduce a safeguard test and a separate attributed approval record in later versions; then examine expired validity, a stopped log feed or expanded service scope. A manual reassessment should expose which prerequisite ceased to hold. It must not silently renew approval, treat the request as acceptance or claim the residual exposure disappeared.

Each walkthrough should show the initial question, the evidence used, feasible options, recommendation, attributed challenge, explicit reassessment, recorded choice and any later implementation or outcome evidence. Opening a source should explain why it matters to the current decision. Following a linked issue or change should preserve case identity and show where the available evidence stops. Source-shaped fixtures may illustrate those links before live collection exists, but the UI must label that simulation.

Prepare at least one materially conflicting assertion, one missing deciding fact, one relevant wider-context input and one irrelevant-context variation for each case family. Preserve the actual source record when applying a hypothetical variation. A changed source, lost permission or failed check must be visible in the decision's usability and basis; it does not authorize automatic execution. Stop retrieving once the deciding questions are adequately supported or a precise unresolved fact requires an owner response. More records alone are not greater depth.

Keep each first development packet within the current 15-source limit, including inherited feedback contributors. That implementation bound does not establish complete coverage of the company. Do not silently truncate material evidence to fit it or describe multi-hop investigation as implemented. If a case needs more contributors, make that a specific contract change to assess. Use the [fair comparison](MEASUREMENT-PLAN.md#fair-comparison) to test whether the wider context changes the decision for a defensible reason, rather than rewarding additional retrieval.

#### One interaction and backend contract

Preserve the existing question, source inspection, recommendation, alternatives, challenge and history interactions. Label the three examples by their actual workflow. A recommendation card should expose the security issue, recommended move, why this option, what must hold, accountable owner or missing authority, and the next action. Workflow-specific status remains visible: remediation completion stages, access feasibility, or exception conditions and expiry. The frontend interaction model owns layout and wording; [the data model](DECISION-DATA-MODEL.md#proposed-portfolio-extensions) owns contract extensions.

| UI interaction | Existing backend operation | Integration condition |
| --- | --- | --- |
| Find and inspect the evidence | `search_evidence`, then `inspect_evidence` | Preserve source IDs, exact revisions, scope, period, freshness and limitations. Search is partial coverage. A source read does not establish that the described safeguard works. |
| Show a recommendation and its alternatives | `run_decision`, then `inspect_result` | Carry deliberate case identity, case version, selected source bindings and the result ID. Use access criteria today; remediation and exception criteria remain to be implemented. Display unavailable or changed evidence as unresolved. |
| Challenge a fact or record a simulated choice | `record_feedback`, then `inspect_feedback` | Keep attributed corrections, rationale and reported outcomes separate from source facts and authenticated approval. A successful save does not mean that the advice changed. Explicit rejection semantics remain a contract gap. |
| Reassess and compare versions | New `run_decision` with `prior_feedback_id`, then `inspect_result` | Retain the predecessor and changed evidence. Display the reason for the changed advice without overwriting the earlier basis. Derived disclosure remains subject to current permissions for every contributor. |

These are local MCP operations, not browser HTTP endpoints. The public demo currently calls none of them. Keep it synthetic and static. A later private UI connection needs its own authenticated, permission-scoped boundary; never place provider keys or private evidence in the published site. No bridge service is selected by this mapping.

For demonstration parity, the target is one versioned synthetic case specification per workflow, used by backend development runs and frontend examples. Once a case can run, use a rights-cleared result snapshot with its case, result, source and criteria versions as the frontend replay basis. Preserve the original output and any editorial changes. Until then, label authored answers and source influence as illustrative. Do not suggest that a source-network animation or manually sized feather is measured model reasoning. Snapshot export and replay mapping remain to be implemented; no additional registry or generation framework is justified yet.

#### Completion checks for the mapped stories

Apply the [evaluation contract](EVALUATION.md#development-cases) before judging results. Proposed expectations require founder and independent qualification; the public stories remain development material.

- A reviewer can identify the security problem and workflow from the initial question, before opening the source drawer.
- Each story shows a concrete exposure or requirement, feasible alternatives, relevant organisational context, deciding evidence and a next action with its owner or unresolved authority.
- Remediation stays open when only the PR is merged. Scoped deployment and successful verification can change the closure recommendation; a regression or failed verification changes the next action.
- The access case preserves an evidenced infrequent task. It can support narrowing when the alternative is tested, and asks a targeted question when that deciding evidence is absent.
- The exception case distinguishes a request from approval and an asserted safeguard from an effective one. Changed conditions or expired validity are handled on explicit reassessment.
- All stories preserve the initial recommendation, attributed challenge, explicit reassessment and later result. Irrelevant context or wording changes should not change the substantive choice.
- UI replay and backend comparison use the same case and evidence versions. Record scripted behaviour, actual backend output, qualified judgment and customer outcomes as separate receipts.

The next backend unit is to prepare the two non-access case specifications and qualify their candidate expectations, then implement only the missing workflow semantics in the existing decision path. In parallel ownership, the frontend can present these three clearly labelled synthetic stories using its existing components. This mapping changes no runtime behaviour, data processing scope or website deployment. The separate homepage feedback about a right-hand element following scroll belongs to frontend layout work and is not a backend requirement.

### Historical deck alignment, 28 September 2026

The comparison inspected all eleven slides and speaker notes in investor deck v35, the rendered product slides, the scripted product concept, and the 28 September positioning review. V35 changes the closing ambition; the positioning review is a subsequent analysis, not another shipped deck revision. The concept's restore-versus-access-cleanup case is synthetic. This comparison changes no slides and does not establish customer acceptance.

| Product requirement | Functional implication | Scope decision |
| --- | --- | --- |
| Retain reviewed choices, corrections and outcomes; slides 5, 6 and 11 | Link attributed feedback and a later reassessment to the immutable recommendation | Implemented locally through CLI and MCP; current access applies to every contributing source. Outcome quality and learning remain unqualified. |
| Prioritise control improvements with GRC, accountable owners and delivery teams; slides 4, 6, 8 and 9 | Distinguish assessed control claims, business priority, owner authority and feasible delivery | Keep capacity unresolved; next cases must qualify explicit options, roles and displaced work. |
| Compare under incomplete quantitative data; current foundation | Accept attributed ranges without demanding point estimates, then examine assumptions that reverse a choice | Separate increment after defining an option comparison with consistent units and horizon. Current expected-loss arithmetic still requires point values. |
| Improve the method using reviewed outcomes; slides 5 and 11 | Retain corrections before evaluating proposed criterion/weight changes | No automatic Jev weight updates or claim of learned judgment. |
| Support agents and eventual autonomous programmes; slide 11 | Reuse the decision interface, later add independently enforceable authority and observable execution | Existing local MCP remains advisory. No execution tools, extra service, graph database or scheduler. |

That review proposed comparing a failed recovery test with administrative access-cleanup work. It remains an earlier development case rather than the portfolio's selected next case. Preserve its scoped observations, deadline applicability, capacity authority and displaced work if reused. Do not encode the deck's preferred choice as a qualified answer key.

The audit began with 43 passing tests. See [the pilot record](PILOT.md#baseline-audit) for the final local checks, provider receipts and review findings.

The result explicitly records `population_complete: false`, `feasibility_checked: false` and `simulated: true`. Citation checks prove an ID was supplied, not that every claim is supported. No independent scheduling/capacity evaluator or owner-authorisation workflow is implemented.

Use the [portfolio test plan](MEASUREMENT-PLAN.md#first-test-session) to examine judgment and customer effort. Its new workflow comparisons are planned; the existing access runner remains the bounded implemented comparison. Earlier prioritisation results stay historical evidence rather than deciding the current launch order.

Unattended scheduling, webhook ingestion, channel discovery, other source connectors, complete provider-history erasure, hosted restore, multiuser authentication and deployment remain future work. The direct Slack adapter rechecks the configured reader's access; the capture adapter relies on an authorised upstream read and its actual check time. Processor permission remains trusted operator configuration.

Recreate this environment on the backend computer with `uv sync --locked`. Configure credentials and permitted scopes there. Source collection runs where access exists. Private data stays outside Git. Keep the existing runtime ledger when continuing an allowance; a new runtime must not reset it.
