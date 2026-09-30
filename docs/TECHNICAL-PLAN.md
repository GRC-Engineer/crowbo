# Connected backend

Updated 29 September 2026. The existing implementation uses one backend, Turbopuffer with native Voyage embeddings, Jev through Cloudflare, and a reasoning model. The three-workflow portfolio below changes planned domain coverage, not this stack or its qualification status. Historical experiments provide no architecture, policy or implementation requirements. No connected module imports them.

[Foundation](FOUNDATION.md) owns the objective. [Data contract](DECISION-DATA-MODEL.md) owns record meaning. [Storage design](ARCHITECTURE-COMPARISON.md) owns layout. [Evaluation](EVALUATION.md) owns judgment qualification.

## TypeScript backend, 30 September 2026

The backend is now TypeScript on Cloudflare Workers ([ADR 0001](adr/0001-typescript-on-workers-with-tenant-durable-objects.md), [backend README](../backend/README.md)). The sections below describe the pilot's behaviour. It was ported faithfully, and its identities are byte-identical, enforced by golden vectors generated from the Python code. The storage and runtime notes that mention Python, uv, the local SQLite ledger file and the file lock describe the retired pilot.

| Concern | Now |
| --- | --- |
| System of record | One SQLite Durable Object per tenant in the `eu` jurisdiction. Heads, revisions, assessments, reviews, feedback, sync state, standing facts, decision versions and the request ledger live there. The services run inside the object, so their integrity re-reads are local. |
| Search | Turbopuffer `-chunks` namespace only (BM25 plus native Voyage embeddings), rebuildable from records. |
| Allowance ledger | The same reservation rules as the pilot, in the tenant object's SQLite. A reservation commits before the call; experiments keep immutable allocations. |
| Interfaces | Bearer-token HTTP API (`POST /v1/operations/<name>`), streamable-HTTP MCP at `/mcp`, and the operator CLI (`backend/src/cli`). All three share one operation table. |
| Identity | Operator credentials come from an administrator secret. Team membership comes only from that secret, with a lease of under one hour per request. |
| Standing decisions | Source-bound facts, eval-gated criteria and pure rules for access retain, finding close and exception validity. Answers are immutable input-addressed versions. Currency, conflicts and team access are derived at read. |
| Sync | Registered Slack specs run on a Cron trigger; each run keeps the pilot's resumable reconciliation rules. |
| Dependencies | `zod` (boundary validation), the official Turbopuffer and MCP TypeScript SDKs, and the Workers runtime. Development only: `vitest`, `wrangler`, `typescript`. |

The TypeScript suite covers every Python test in the pre-migration baseline (`backend/scripts/parity.ts`). Latency and cost targets are not yet measured on deployed infrastructure.

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
