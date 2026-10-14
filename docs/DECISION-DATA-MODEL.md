# Connected data contract

Updated 29 September 2026. The implemented records support ingestion, native Jev judgments, retrieval, model-backed review and attributed feedback/reassessment. The proposed portfolio extensions below are not implemented schemas. [Foundation](FOUNDATION.md#initial-workflows) owns workflow scope. Historical proof schemas impose no requirements.

## Source and assessment records

| Record | Meaning |
| --- | --- |
| Source revision | Customer, connector/workspace/native ID, URL, text, native-update or capture timestamp, source kind and limitations. Content hash identifies the revision. |
| Grant | Direct readers and groups, independently permitted processors, check/expiry times and revocation. Trusted operator input, not authentication. |
| Group membership | Optional startup snapshot bound to tenant and reader, with groups and a lease of at most one hour. Missing or inactive snapshots grant no group access. |
| Source head | Current revision/grant, declared coverage, assessment/index readiness, last check, withdrawal state, generation and optional sync scope. |
| Sync checkpoint | Configured source scope, pending/ready/failed status, next poll, freshness deadline and the last complete source/version map. |
| Question set | Version and native Jev questions. A hash binds the question meaning and criteria. |
| Assessment | Exact source revision, criteria version/hash, keyed Noul/Choice/Score answers, question definitions when recorded, returned model and usage. |
| Evidence view | Current source, stored assessment, coverage limits, index readiness and whether the selected criteria match. |

Identity includes customer, connector, workspace and native ID. A display-name match does not establish cross-system identity. Source edit and capture times are different facts. Existing IDs remain compatible.

The default commitment questions are a selected configuration, not a restriction on the provider. Older assessments without definitions remain readable; known default definitions can accompany them in a review without changing scores.

Source facts, interpretation, search relevance and action priority remain distinct. Valid structures do not establish correct judgment. Failed assessment remains pending, never a fabricated low score.

## Storage and retrieval

[The namespace design](ARCHITECTURE-COMPARISON.md#initial-namespace-layout) keeps source/history records separate from rebuildable search chunks inside Turbopuffer. Search hits resolve back to their current source and access before disclosure.

Unchanged imports reuse assessments and indexes. Changed questions cause new assessments without re-embedding unchanged text. Changed sources require new matching assessments. Equal-time conflicting revisions remain unresolved until reconciliation.

Legacy revision fingerprints retain their original timestamp rules. Slack sync opts into fingerprint version 2: substantive fields determine the revision, while `updated_at` and `observed_at` describe its acquisition. The immutable revision retains the first stored observation; the head's `last_checked_at` records the latest complete read. A repeat read can therefore renew checked access without inventing a content change. Observation ordering is not proof of the source's last edit time.

Each newly indexed version or restored source advances its generation. Search accepts only the current head's generation, and cleanup targets strictly older generations. A confirmed unavailable thread withdraws the current head and deletes its captured generations; immutable history remains subject to current access. Incomplete reads and rate limits do not prove deletion or renew grants.

Reader access and external processing are separate checks. A Jev grant does not permit another inference provider. Source grants explicitly name the reasoning model. The question/context independently requires both that model and Turbopuffer in `query_processors` for a retained review.

The [permissions model](PERMISSIONS.md) owns source audiences, membership freshness, derived-context access and the limits of reusing a GRC platform's collection. Saved reviews and feedback remain private to their creator even when another user can read all cited sources.

## Review

The request contains a question, optional attributed operator context, unique source IDs, one supported model ID, effort and completion-token limit. The operation fetches current permitted versions. The in-memory bundle is ordinary JSON, not another service or a separate packet framework.

The saved result contains the request, exact evidence/assessments used, prompt hash, model/usage receipt, timestamp, recommendation, rationale, alternatives, uncertainties and evidence IDs. It uses the records namespace.

Every returned citation ID must refer to supplied evidence. Its semantic support still requires review. The result is a simulation and explicitly says source coverage and feasibility are not established.

The application checks source/assessment versions and processing permissions before inference and around saving. A changed basis fails the new review. This is not a cross-namespace transaction.

History checks current reader access to all contributors without new inference. A current conflict does not erase earlier evidence; the history is marked changed. Revocation denies disclosure. New reviews over synchronised evidence also bind the selected scopes' coverage hashes. `evidence_unchanged` becomes false if a scope is incomplete, overdue, or contains a changed source, even when the changed source was not cited. Older reviews without that binding retain citation-only checks. None of these checks establishes general decision validity or complete company coverage. Existing private exports cannot be retroactively revoked.

## Reported feedback and reassessment

Feedback is a separate immutable record linked to one exact saved decision. It holds an operator-reported review time, rationale, optional simulated choice, corrections, reported outcome and observation date, revisit conditions, and optional exact supporting source/revision references. A choice either names the retained recommendation, selects an existing alternative by zero-based index, proposes custom text, or defers. The original recommendation and Jev answers remain unchanged.

The configured reader is the reporter. This is not authenticated human identity or proof that the reporter can allocate engineering work, accept risk or approve execution. Reported outcomes do not prove causality, independent verification or risk reduction. Corrections describe an operator's interpretation; they do not automatically become accepted truth or change evidence weights. Notes without source references are explicit operator assertions.

Feedback references use logical source IDs and immutable revision IDs. Local `[E1]`/`[P1]` citation notation is rejected in feedback prose because labels can mean different things across runs. Historical supporting revisions may be retained under current access; they do not become fresh observations. Supporting data stays in existing source records rather than another copy of the corpus.

Recording requires no model call. The identifier hashes the normalized request, tenant, reader and fixed attribution/simulation flags. Identical retries retain the same record after renewed access checks; reusing the same `reviewed_at` is part of an identical retry. A changed statement or report time creates a separate record, not a replacement. An uncertain insert succeeds only after exact readback. Storage operations still consume the shared provider allowance.

A new `DecisionRequest` can name one `prior_feedback_id`. It must use the same case ID, a different case version and every source identity contributing to the parent recommendation or supporting feedback, within the existing 15-source limit. Current source readiness and GLM permission checks therefore cover all inherited inputs. Each later result preserves that complete source set, so historical access needs no recursive ancestor traversal. If the set grows beyond the limit, do not silently discard contributors to claim a reassessment.

Only the immediate parent's answer and selected feedback enter the new reasoning call. Older records remain independently inspectable; older corrections must be restated if still relevant. Historical answer citations become `[P1]` with their original source/revision map; the new answer must cite the current `[E1]` evidence. A source's current revision can differ from the historical one. The new result retains that distinction and its predecessor without editing either.

Reassessment is a fresh model call, not an idempotent replay. Failure leaves the saved feedback intact. Neither current evidence readiness nor a saved simulated choice establishes feasible scheduling or organisational authority. All derived history remains subject to current access for every contributing source; private exports cannot be retroactively revoked.

## Access decisions

An access request binds a system, account identifier and scope. Its answer keeps identity, required work, current access, dependencies and observation period separate. Each is stated with exact source quotations, unknown, or conflicting. Missing custodian, approval authority and deadline are null. A named person must appear in the quoted span; a deadline must be a date. These checks do not independently prove a person's authority or what an ambiguous date governs.

The model compares two to seven distinct option kinds: retain, reduce, project scope, temporary access, replace a credential, remove, or investigate. Each records workflow fit, its source basis, exposure change, operational cost, conditions and what would reverse the choice. The selected option must exist and cannot be marked as failing the required work. Selecting an account action requires stated identity; an unresolved option requires conditions and a deciding check. Investigation must name the missing fact and explain how the answer would change the choice.

The backend binds the returned subject to the request and every quotation to a unique span in a selected source revision. It cannot prove that a quoted role belongs to the right historical account, that all required tasks were tested, or that the recommendation and prose agree. Those remain semantic evaluation questions. `authority_verified` is always false, and no choice changes permissions.

Contextual Jev answers describe subject match, required work and alternative test evidence for this account. They retain their question definitions and assessment provenance. They are source interpretations, not policy grants, risk probabilities or a combined decision score. All contributing source permissions still apply when inspecting saved results.

## Proposed portfolio extensions

Reuse the existing source/grant records, exact evidence bindings, case ID/version, immutable recommendation, feedback and explicit predecessor. A stable identity should follow one problem across issue handling, access review and remediation. Distinct related problems need explicit links rather than title matching or duplicated copies. The current default `ad-hoc` case ID is not a durable registry; callers need deliberate case identities. No new registry service or database is selected.

The smallest candidate additions are below. Final fields and validation rules need a reviewed case before code changes; free prose in today's operator context does not implement these semantics.

| Contract area | Information to preserve | Boundary |
| --- | --- | --- |
| Workflow and case links | Which decision is being requested; relevant issue, treatment or exception reference and its source/version. | Workflow routing must choose appropriate criteria rather than use the current commitment format for every non-access request. Shared links do not grant access to another case. |
| Remediation facts | Agreed treatment and basis, affected scope, responsible owner, dependencies, intended date, implementation, deployment and verification observations, plus the closure condition. | A merged PR or closed ticket is not deployment or effective protection. Unknown verification supports a targeted check, not a completion claim. |
| Issue and exception facts | Applicable requirement, observed practice, affected activity, existing issue identity, handling options, stated safeguards and their evidence, authority basis, conditions, expiry and revisit triggers. | A candidate deviation is not a confirmed issue or an approved exception. Approval evidence, deployed safeguards and current risk assessment stay separate. |
| Choice and outcome | Accepted, revised or rejected recommendation and attributed reason; any chosen alternative or deferral; later observations with source and period. | Current choice kinds are recommendation, alternative, custom and defer. Rejection and a revision relationship need explicit semantics; a note or alternative is not automatically a rejection. Retain old records without relabelling them as authenticated decisions. |
| Assessment period and lifecycle | Period covered by the evidence, requested decision horizon, treatment target and exception validity. | The current request limits its window to 31 days. Do not stretch that field to represent a long-running remediation or exception, or remove the bound without a case-specific replacement. Dates and authority remain unknown where unsupported. |

Use the customer's risk method and version where an assessment is relevant. Keep an asserted current assessment, proposed post-treatment assessment and observed result separate; do not force all three workflows into the optional annual-loss arithmetic. Existing reported outcomes remain reports until supporting verification establishes a defined conclusion.

All inherited contributors remain subject to current reader and processor checks. The current 15-source bound and immediate-parent feedback behaviour still apply; a cross-workflow link must not silently drop evidence, permissions or earlier material corrections. Linked-case authorization and lifecycle behaviour require their own checks before being claimed. No autonomous reopening, follow-up, expiry scheduler or execution is introduced here.

## Proposed agent handoff records

These are requirements for a future contract, not implemented schemas or additions to the current MCP tools. [The backend plan](TECHNICAL-PLAN.md#proposed-continuation-with-an-agent) owns sequencing and destination qualification; [permissions](PERMISSIONS.md#proposed-agent-handoff-boundary) owns disclosure and action authority. Keep handoff records separate from simulated decision feedback. A `ReportedChoice` is not an execution grant.

| Contract area | Information to retain | Required distinction |
| --- | --- | --- |
| Identity and reviewed basis | Tenant, handoff ID, creator, case ID/version, selected stage or result, evidence/criteria bindings and basis fingerprint. | A saved backend result uses its real result ID. An authored demo fixture uses its case ID, specification version, stage, fixture hash and synthetic provenance; never invent a backend result ID. |
| Task and deliverable | Chosen next step, objective, explicit deliverable, requested mode, target environment/repository and relevant base revision. | Investigate, prepare a change and perform approved work have different permissions. A mode label alone grants none. |
| Decision context | Rationale, feasible alternatives, unresolved/blocking facts, relevant attributed corrections, conditions and stop/reassessment criteria. | A recommendation or quoted source cannot override the reviewed task or its constraints. Retain material corrections even when older than the immediate parent; today's reassessment path does not automatically carry all earlier notes. |
| Shared evidence | Exact permitted source/revision references, subject/scope, provenance, observation/check time, limitations and contributor relationships. | Export only a permitted projection. Reduced evidence cannot retain a recommendation derived from inaccessible contributors as though its basis were unchanged. |
| Policy and explanatory context | Applicable requirement and version, scope and authority basis; control/risk/framework explanations with their separate provenance. | Synthetic SOC 2, ISO and NIST teaching notes remain labelled interpretation outside the evidence. They establish neither applicability, compliance nor approval. |
| Destination and identities | Host/product/version, destination tenant/workspace, acting principal, delegating human, processor route and capability-check receipt. | Product name, human readership, destination processing permission and action authority are distinct. |
| Consent and task authority | Who approved sharing which context with which destination; action grant issuer/basis, exact operations and targets, validity, required approvals and enforceable resource limits. | Sharing consent cannot exceed the person's authority or organisation policy. A draft has requested scope; an authorised task needs a separately validated grant. |
| Delivery and execution receipts | Stable launch intent, attempts, destination acknowledgment/run reference, observed state and timestamps, errors, cancellation request and acknowledgment. | Prepared, exported/opened, submitted and confirmed running are distinct. A copy/open action has no execution receipt; a timeout may leave submission unknown. |
| Returned work and verification | Handoff/run reference, external artifact identity and immutable revision, reported changes/checks/blockers, verification criteria, observed verification result and verifier provenance. | Agent-reported completion, observed artifact and verified outcome remain separate. A PR URL alone establishes none of its merge, deployment or security effect. |

Derive any task brief from this structured basis without credentials, bearer links or launch-URL payloads containing private context. A future private deep link must require authenticated access; knowing a handoff ID grants nothing. Returned text and artifacts are untrusted inputs, bound to the expected tenant, handoff, destination and run before attachment. They must not silently amend the original recommendation, expand permissions or qualify as a verified outcome.

Record repeated delivery attempts under one explicit launch intent bound to the reviewed basis, destination and action scope. A repeated request returns its known receipt or reconciles the uncertain attempt. A changed basis or authority requires a new review and intent; an intentional second run must be explicit. Do not infer exactly-once execution from a local content hash. If the destination cannot deduplicate or look up an uncertain submission, stop automatic retry and report the uncertainty.

Keep the handoff's validity state separate from the externally observed run state. A revoked handoff can coexist with a still-running external session. Mark it invalid, prevent further disclosure and request cancellation where supported; report the external state accurately. Source or policy changes affecting the reviewed basis require explicit reassessment before consequential work. Reference [the permission boundary](PERMISSIONS.md#proposed-agent-handoff-boundary) for limits on revoking copies already delivered.

## Earlier commitment decision facts

The earlier prioritisation question concerns two weeks of security work. Its existing contract remains useful development material, not the common shape for the three workflows. A genuinely non-negotiable commitment needs obligation, deadline, consequence and accountable-owner non-deferral confirmation. Capacity needs skill/capability, amount, applicable dates and existing allocations. No calendar absence or no merged PRs does not prove spare capacity.

Exposure comparisons need supported scenarios, affected business/assets, current protection and how each action could improve the outcome. Effort and benefits remain attributed estimates where unverified.

These facts enter as evidence and operator context. Dedicated scheduling types, calculation engines or approval workflows must be justified by the reviewed cases before implementation. Missing facts stay unknown.

### Source-bound deciding facts

The default Crowbo decision asks GLM to return a recommendation and one to three deliverable cards in a single call. Each card has a source-quoted anchor and separate obligation, deadline, owner, completion, consequence, non-deferral and capacity fields. Fields distinguish stated, unknown and conflicting interpretations. Unknown has no invented value; conflicting requires at least two distinct quoted spans. Counterfactual assumptions remain outside these source-assertion cards and are explained separately in the answer.

To reduce completion failures, the model can omit unknown fact fields. The application expands every omitted field to an explicit unknown in the saved result. The prompt requests at most two focused cards; the boundary accepts up to three. This reduces repeated output without treating an omission as evidence that a condition is satisfied.

Every quoted span must occur exactly once in the cited source text. The application records its character offsets, source identity and immutable revision. All referenced labels must belong to the answer's cited evidence. A model can still attach a real quotation to the wrong deliverable or interpret it incorrectly: the binding establishes origin, not truth or meaning. Missing commitment fields stay visible; neither a complete card nor a stated capacity field establishes owner authority or scheduling feasibility.

The model references Jev by evidence label and question key, without supplying a numeric score. Code resolves the value, question definition and criteria identity from that exact assessment. These deterministic rows are distinct from free prose, which still needs review for unsupported claims. The record carries version `deciding-facts-v1` in the decision packet. Original five-field review answers and older immutable history remain readable.

For development comparisons, `DecisionRequest.method` selects `crowbo` or `plain`. Plain omits Jev assessments from model input and uses the original prose response. The saved history still retains the source snapshot and processing/access checks. This changes two forms of assistance and cannot measure Jev's isolated effect.
