# Connected evidence pilot

Updated 28 September 2026. This document records how to run the implemented CLI and what was observed. The [backend brief](TECHNICAL-PLAN.md) owns architecture and build order; the [measurement plan](MEASUREMENT-PLAN.md) owns decision-usefulness evaluation.

## What works

One Python process imports a small private bundle. It stores each source revision in the customer's turbopuffer records namespace, then independently prepares a Jev assessment and native Voyage search chunks. A mutable source head identifies the current revision and access grant. Retrieval resolves that head again before returning content and its assessment. An assessment is an interpretation bound to a source revision and criteria hash, not a priority or calibrated risk score.

The default question set checks whether each record explicitly supplies an obligation, deadline, consequence of missing it and owner confirmation of non-deferrability. These are replaceable questions, not a restriction on Jev or the data model. The model's sufficiency judgment does not qualify a commitment by itself or authorise any action.

| File | Responsibility |
| --- | --- |
| [contracts.py](../src/crowbo/contracts.py) | Validate source provenance, grants, batches and typed assessments. |
| [questions.py](../src/crowbo/questions.py) | Versioned native Jev questions and answer matching. |
| [evidence.py](../src/crowbo/evidence.py) | Own current revisions, independent preparation, access checks and assessment binding. |
| [providers.py](../src/crowbo/providers.py) | Call Jev through Cloudflare and the official turbopuffer SDK. Fixed destinations, timeouts, response bounds and no automatic retries. |
| [runtime.py](../src/crowbo/runtime.py) | Private settings, credentials, request ledger, local worker lock and private reports. |
| [review.py](../src/crowbo/review.py) | One model call over selected evidence, citation checks and retained review/history. |
| [cli.py](../src/crowbo/cli.py) | Expose ingestion, retrieval, review and history commands. |

The Python environment is locked with uv. SQLite contains operational receipts and experiment allocations; source revisions and preparation status live in turbopuffer. A new process can recover pending preparation from those stored heads. Keep the existing runtime and ledger when creating a new experiment so earlier usage remains available.

## Running it

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) on the backend computer, then run `uv sync --locked` from this checkout. `uv run --locked pytest -q` runs synthetic engineering tests without credentials.

Keep configuration, source exports, query text and results in a private directory outside any Git checkout. Use directory mode `700` and file mode `600`; these permit access only to the local account. The importer rejects files with broader permissions and paths inside Git checkouts.

On macOS the process reads the Keychain account `crowbo`, services `crowbo/turbopuffer` and `crowbo/cloudflare`. It can alternatively read `TURBOPUFFER_API_KEY` and `CLOUDFLARE_API_TOKEN` from its environment. Do not paste keys into code, command arguments, source bundles or Git. The selected Cloudflare REST route requires a token with Workers AI Read access; a token with only AI Gateway permissions is insufficient. See [Cloudflare authentication](https://developers.cloudflare.com/ai-gateway/usage/rest-api/#authentication).

Create private settings with this shape, replacing placeholders:

```json
{
  "tenant": "your-private-pilot-id",
  "reader": "your-local-operator-id",
  "source_scopes": ["linear:your-workspace"],
  "runtime_dir": "/absolute/private/path/runtime",
  "cloudflare_account": "YOUR_32_CHARACTER_ACCOUNT_ID",
  "gateway": "default",
  "experiment_id": "first-private-pilot",
  "query_processors": ["turbopuffer", "voyage"]
}
```

Tenant and reader are trusted local configuration, not authentication. Do not expose this CLI directly to untrusted users. The namespace prefix is derived from the tenant; the provider key still has whatever wider access its provider grants.

Create the experiment allocation explicitly before the first provider operation. This local command does not read credentials or call providers. [Experiment allowances](#experiment-allowances) explains durable counts and older settings.

```sh
uv run --locked crowbo --settings /absolute/private/path/settings.json create-experiment --max-requests 600 --max-models 20
```

Each source bundle follows [SourceBatch](../src/crowbo/contracts.py). It declares scope, partial/complete coverage and limitations. Every source contains tenant, connector, workspace, native ID, source URL, title, text, source-update and observation timestamps, real/synthetic/public basis and record kind. Optional owner, status and due date remain source assertions. Every grant separately declares readers, permitted processors, check time, expiry and revocation. Use actual checked permissions and current timestamps; changing an expired timestamp without checking access is not a refresh. Tests contain public-safe synthetic construction examples in [conftest.py](../tests/conftest.py).

The import limit is 40 source records, 200 KB total text and 40,000 characters per record. Large or unsupported inputs fail validation. This is a selected export, not a complete source connector. Operators must inspect and approve source scope before creating a bundle.

Selected Slack threads and HiBob calendar snapshots can use explicit `slack` and `hibob` source identities. When a connector or browser view does not expose a reliable native update time, set `timestamp_basis` to `observation` and use the capture time for both timestamps. Such revisions are ordered by observation time; they do not establish when the underlying content was last edited. Preserve message dates or the calendar period in the source text and explain coverage limits. Legacy fingerprint version 1 treats a later observation capture as a new revision. The Slack sync below opts into version 2, which separates content changes from check times. Existing revision IDs remain readable.

For calendar evidence, collect only the selected team, planning window and necessary absence dates. Exclude leave reasons and unrelated personnel data. No displayed absence does not establish available hours, workload, skills or permission to allocate someone. Slack plans and replies remain attributed statements, including later delivery reports and unresolved follow-up work; attached files require separate inspection.

GitHub imports support `pull_request` and `team_membership` records under an explicit `github` scope. Preserve the repository, PR number, author login and numeric identity, merge timestamp and commit SHA when the source provides them. Keep native update timestamps distinct from browser-observed roster snapshots. Team membership can establish account inclusion; a similar display name alone does not verify a cross-system identity. Record authorship separately from the actor who merged, and a merged PR separately from deployment or verified security effects. A bounded PR sample cannot measure individual productivity, spare capacity or the absence of other work.

```sh
uv run --locked crowbo --settings /absolute/private/path/settings.json ingest /absolute/private/path/batch.json
uv run --locked crowbo --settings /absolute/private/path/settings.json resume
uv run --locked crowbo --settings /absolute/private/path/settings.json list
uv run --locked crowbo --settings /absolute/private/path/settings.json inspect LOGICAL_ID
uv run --locked crowbo --settings /absolute/private/path/settings.json search --query-file /absolute/private/path/query.txt --mode semantic
uv run --locked crowbo --settings /absolute/private/path/settings.json search --query-file /absolute/private/path/query.txt --mode keyword
```

`ingest` writes permitted source revisions and attempts each enrichment. `resume` retries pending work using stored status. `list` walks the stored, currently permitted source heads; it does not prove that the upstream source population was fully collected. `inspect` returns one current record. Search returns at most ten chunks before source deduplication, so it can return fewer than ten records. It is discovery, not an exhaustive obligation query.

Commands print counts and a private report path. Content stays in the report. Exit code 2 indicates failure or unresolved preparation/access; inspect its stage-specific errors. Repeat import reuses unchanged assessments and completed indexes. Refreshing a grant refreshes searchable access metadata. Conflicting content with the same source timestamp remains unresolved until a newer reconciled revision arrives.

## Slack synchronisation

`sync-slack` performs one bounded reconciliation of up to five explicitly selected threads. It does not discover every relevant thread, install a schedule, receive events or edit Slack. The configured scope remains partial company coverage.

Keep the JSON spec outside Git with mode `600`. This example is synthetic; substitute the actual workspace, Slack team/user IDs and selected thread identities:

```json
{
  "name": "selected-commitment",
  "workspace": "example",
  "team_id": "T00000000",
  "user_id": "U00000000",
  "targets": [{
    "channel_id": "C00000000",
    "message_ts": "1790000000.000001",
    "title": "Selected delivery thread"
  }],
  "processors": ["turbopuffer", "voyage", "jev", "@cf/zai-org/glm-5.3-flash"],
  "poll_seconds": 900,
  "freshness_seconds": 3600,
  "grant_seconds": 86400
}
```

Add the exact `slack:workspace` to settings' permitted source scopes. The direct reader uses `SLACK_API_TOKEN` or Keychain account `crowbo`, service `crowbo/slack`; credentials never belong in the spec. It calls `auth.test` to verify the configured team and user, then reads each complete thread with bounded cursor pagination. Required token access depends on channel type; see [Slack's thread API](https://docs.slack.dev/reference/methods/conversations.replies/). Rate limits persist a retry time. Do not reuse the Codex connector's internal credentials.

```sh
uv run --locked crowbo --settings /absolute/private/path/settings.json sync-slack /absolute/private/path/slack-spec.json
uv run --locked crowbo --settings /absolute/private/path/settings.json sync-status /absolute/private/path/slack-spec.json
```

For today's MCP access, add `--capture /absolute/private/path/captures.json`. This owner-only file is an array of raw, authorised thread-read receipts: `workspace`, `team_id`, `user_id`, `channel_id`, `message_ts`, actual acquisition-start `checked_at`, and the returned `messages` and `pagination_info`. The capture reader requires the requested parent and the explicit complete-pagination receipt. It trusts the operator's acquisition binding; it cannot authenticate Slack itself or infer access loss from a missing capture. Never substitute an LLM summary or advance the check time on an old export. Detailed MCP rendering can change after reactions/display-name changes and may trigger extra enrichment; direct API snapshots omit reactions and use stable user IDs.

Both routes store progress in Turbopuffer. `--force` refreshes early or retries preparation after a repair; it cannot bypass an in-progress lease or Slack read/rate-limit backoff. Restarting preserves those limits. A partial read or failed preparation keeps the scope unresolved; retry rereads the selected threads and reuses completed work. Pagination cursors are bounded within an attempt, not durable change-stream cursors. There is no claim of an atomic snapshot while Slack is changing.

Unchanged rereads preserve revision IDs and Jev results. Grant refreshes patch search metadata without sending text for embedding. Changed content creates a new revision and assessment; identical chunk text can reuse its stored vector. A missing reply disappears on a complete reread. A confirmed inaccessible/missing thread withdraws its head and removes eligible chunks. Removed configured targets are withdrawn from this single-owner scope. Historical evidence remains retained but current access controls disclosure.

New reviews over these sources bind the whole selected scope. Changed coverage, failed sync or expired freshness marks history outdated; unresolved/overdue scopes block new reasoning. This is measured freshness within the configured threads, not knowledge of every upstream change. The next production step is to run the same bounded operation under an owned scheduler and add event-assisted refresh plus periodic reconciliation, after workload tests justify it.

## Configuring Jev questions

Set optional `questions_file` in the private settings to an owner-only JSON file outside Git. Omitting it selects the existing commitment questions and preserves their stored identities. The file contains `version` and `questions` in Jev's native format, for example:

```json
{
  "version": "deployment-evidence-v1",
  "questions": {
    "deployment_evidence": {
      "type": "choice",
      "instructions": "What deployment evidence does this source explicitly report?",
      "criteria": {
        "verified_live": "Reports a live deployment and observed verification result",
        "merged_only": "Reports merged code without live verification",
        "unknown": "Does not establish either state",
        "conflicting": "Contains inconsistent deployment assertions"
      }
    }
  }
}
```

The file is bounded to 20 KB and 20 questions. Choice, Noul and Score use their native criteria. Configuration validates before provider calls. Changing questions produces a new assessment on `resume` while keeping the existing source and embedding. Until then, retrieval retains the prior answers and reports `assessment_current: false`. The example rubric is a candidate, not a qualified deployment judgment.

## Running a review

Create a private JSON request. Copy source IDs from the private `ingest` report or each `source_id` in a `list`/`search` report. The following ID is an illustrative placeholder:

```json
{
  "question": "What should GRC and security engineering prioritise over the next two working weeks?",
  "context": "Honour genuinely non-negotiable commitments, then use remaining capacity to reduce consequential exposures. Exact available hours remain unknown.",
  "source_ids": ["0000000000000000000000000000000000000000000000000000000000000000"],
  "model": "@cf/zai-org/glm-5.3-flash",
  "reasoning_effort": "high",
  "max_completion_tokens": 2048
}
```

GLM is the operator-selected reasoning model for the current pilot and accepts `low`, `high` and `max`. Luna remains an available comparison route and accepts `none`, `low`, `medium`, `high` and `xhigh`; `max` was rejected live. The request must state effort explicitly. Unsupported combinations fail locally, without silent substitution.

Every selected source grant must explicitly permit the selected model ID. The request's `query_processors` must include both that model and `turbopuffer`, since the question/context are sent to inference and retained in the database. Existing Jev grants do not authorise another processor. Revalidate actual access before updating an expired grant; do not extend timestamps merely to make a review run.

```sh
uv run --locked crowbo --settings /absolute/private/path/settings.json review /absolute/private/path/review.json
uv run --locked crowbo --settings /absolute/private/path/settings.json inspect-review REVIEW_ID
```

One review calls one model over explicitly selected source versions. It checks citation IDs and source/access consistency, then retains the request, evidence, result and model receipt in Turbopuffer. It makes no completeness or independently checked feasibility claim. The result is simulated advice. `inspect-review` checks current contributor access, retains the earlier basis even if a new source is conflicted, and makes no model call.

## Processing and limits

The database region is `aws-eu-west-2` (London). The native schema uses `voyage/voyage-4-large` at 1024 dimensions and BM25 text search. No separate Voyage key is required. Database location does not imply UK-only embedding processing; [turbopuffer lists this model's inference location as Global](https://turbopuffer.com/docs/embedding).

Jev uses `typesafe/jev` through Cloudflare's account REST endpoint. The adapter sends the documented `cf-aig-collect-log: false`, `cf-aig-collect-log-payload: false` and `cf-aig-skip-cache: true` controls. [Cloudflare documents these logging controls](https://developers.cloudflare.com/ai-gateway/observability/logging/) and [lists Jev as zero-data-retention](https://developers.cloudflare.com/ai/models/typesafe/jev/). This run did not independently audit provider retention or change account-wide gateway settings.

Settings without `experiment_id` retain the historical cumulative request counter and USD 0.05 reservation per request. Those arbitrary reservations were application controls, not measured costs. New experiments use the allocation below. Earlier calls and receipts are preserved in the same runtime ledger.

### Experiment allowances

Set a named `experiment_id` in the private settings while retaining the existing `runtime_dir`. The operator explicitly creates an allocation, for example:

```sh
crowbo --settings /private/path/settings.json create-experiment --max-requests 600 --max-models 20
crowbo --settings /private/path/settings.json experiment-status
```

These commands do not retrieve credentials or call providers. Limits and the tenant/reader identity are immutable for that experiment. Repeating creation with identical values returns its current usage. Opening another process or making another MCP call cannot reset it; no MCP tool creates allocations. New named experiments require an explicit operator command.

All provider requests consume the request allowance; Jev assessments and reasoning also consume the model-call allowance. Reservations happen atomically before dispatch, including calls that fail or whose result is unknown. The counts survive restarts. A new experiment continues the same ledger without counting old experiments against its own allocation. It uses no invented dollar reservation, and `budget_usd` can be omitted when an experiment is selected. Actual token and billing-unit receipts remain separate from provider invoices and account-wide usage.

Do not delete the ledger or change runtime directories to evade these controls. This is a local experiment limit, not a production billing service, token budget or permission boundary for a user who can edit the runtime files.

Known revocation or expiry blocks subsequent application reads and processing. This does not erase copies already exported to the operator or retained source history. Successful new-revision indexing removes older chunk generations; known withdrawal attempts bounded chunk deletion and remains retryable on failure. The direct Slack reader rechecks access on each selected-thread read. Full provider retention/erasure workflows remain unimplemented. Never treat these local checks as production multiuser isolation.

## Observed hosted run

The private pilot used five selected real issue descriptions and metadata. Source extracts, identifiers, queries and detailed reports are outside this public repository. The sample excludes comments, attachments, related pages, complete backlog coverage, team capacity and owner-confirmed commitments.

| Check | Observed result |
| --- | --- |
| Store and index | Five source revisions stored in London; all five completed native Voyage indexing. |
| Jev | Five retained assessments from returned model `jev-1.13.0`, each bound to its source revision and criteria hash. |
| Exact retrieval | Listed all five imported current sources with assessments and index-ready status. |
| Semantic discovery | One query returned three distinct records; every assessment exactly matched the stored listing. |
| Keyword discovery | One query returned one record; its assessment exactly matched the stored listing. |
| Duplicate import | A repeated unchanged bundle caused zero additional Jev requests and zero additional embedding writes. |
| Interpretation | All five model sufficiency judgments were `insufficient`; these are unreviewed interpretations, not qualified expected judgments. |

The first live attempt exposed an adapter bug: the gateway returned `Completed`, which the original lowercase-only status parser rejected. Source storage and embedding still completed. After correcting and testing the parser, `resume` populated the five missing assessments without embedding again. Eleven Jev requests occurred in total: five original responses rejected by the parser, one synthetic diagnostic and five successful resumed assessments. Usage retained for the five successful assessments was 7,674 input tokens and 670 output tokens; the earlier calls also incurred inference and are not included in those token totals. Successful assessment round-trip times ranged from 0.372 to 1.542 seconds, with too few samples for a latency benchmark. Actual invoiced dollars remain unverified.

## Engineering verification and review

The original 43 local synthetic tests verified independent provider failure/recovery, unchanged-input reuse, wrong-tenant rejection, reader and processor denial, grant expiry/revocation, older delivery, durable equal-time conflicts, revision binding, denied-query routes, typed-response rejection, fixed destinations, redirect/response bounds, private files, persistent request allowances, local locking and CLI error reporting. Snapshot follow-up checks cover legacy revision identities, explicit timestamp provenance, new connector scope denial and replay without repeated enrichment. Test doubles establish application behaviour, not native provider semantics. The hosted run separately exercised real persistence, conditional source-head writes, embeddings, text search, semantic search and retrieval.

Pstack Architect and First Principles shaped the bounded implementation. Three read-only Interrogate reviews challenged it. The lead accepted and fixed revocation lost during import, conflict cleared on replay, eager Jev credentials, obsolete revision chunks, one failed record blocking resume and an unused allowance. A follow-up review confirmed those fixes for the bounded pilot; its CLI denial-reporting follow-up was also fixed. Complete retention cleanup remains an explicit limitation. The reviews do not establish judgment quality or production readiness.

The implementation plan passed the required Corridor analysis before code. Its private-storage, in-memory-secret and revision/grant-binding guidance was applied; the feedback CLI ran once for this implementation task.

## Historical next increment

The initial pilot proposed a two-week prioritisation review after confirming commitment and capacity evidence. This is historical sequencing, not the current build plan. The [backend brief](TECHNICAL-PLAN.md#portfolio-reconciliation-29-september-2026) owns the current three-workflow portfolio and proposed increments. The observations below preserve the limitations at each run's date.

## Baseline audit

The 25 September refactor starts from the agreed primitives and does not import the historical proof. [The dependency audit](TECHNICAL-PLAN.md#dependency-audit) records each retained library and the narrowly scoped SQLite allowance ledger. No dependency was added and no private source, grant, stored source ID or existing allowance was reset.

Local verification: 67 tests passed, including the previous 43. Added cases exercise configurable native Jev questions, unsupported criteria, reassessment without embedding, the CLI review, exact source/assessment retention, request/source processing denials, revocation or source changes during inference, invalid citations, model/effort mismatch and current-access history. All four existing private input bundles validated, covering 34 unique source records, with zero provider calls and no content printed. These are implementation checks, not qualified judgments.

The Interrogate review used one available independent reviewer after the session rejected creation of additional agents. It is not a multi-model review. All three findings were accepted: require Turbopuffer permission for retained request/context as well as the inference route; keep authorised history readable during a current-source conflict; validate Jev criterion descriptions before API calls. Focused tests cover each correction.

Live provider checks used fictional text only, through the actual reasoning adapter:

| Route/configuration | Observed result |
| --- | --- |
| GLM 5.3 Flash, max | Successful structured answer and valid supplied citation. 297 input / 848 completion tokens; one observed 21.842-second call. |
| Luna, max | HTTP 400. The provider explicitly rejected max and listed none/low/medium/high/xhigh. One repeated diagnostic confirmed the cause. |
| Luna, xhigh | Successful structured answer and valid supplied citation. 270 input / 542 completion tokens. |

Unsupported effort combinations now fail locally. There is no silent fallback. These four attempts advanced the existing call ledger from 784 to 788, below its then-unchanged 850-call bound. No real evidence was sent, no source permissions changed, and no hosted review record was created by these adapter checks. Actual invoiced cost and latency distributions remain unverified. The subsequent full run is recorded below.

## First complete live pipeline run

On 25 September 2026, the operator requested the full attempt through the code. The existing Python CLI completed `ingest`, semantic `search`, `review` and a separate-process `inspect-review` against six real records from Linear, Slack, GitHub and HiBob. No product code or dependency changed for this run. A private runner invoked the commands and asserted their results; the recommendation is the unedited provider response.

Upstream reads revalidated access before renewing the selected records' four-hour grants and explicitly permitting Luna. Two Slack threads were refreshed; other stored revisions retained their original capture times. The run manifest records the operator's authorisation, source selection, limitations and a bounded extension to 1,000 cumulative calls / USD 50 in coarse reservations. The original ledger was retained and finished at 969 calls, up from 788. Reservations are not actual invoiced cost.

| Stage | Observed result |
| --- | --- |
| Preparation | All six records assessment-ready and index-ready, no pending errors. Two new Jev calls; four prior assessments reused; six native-embedding index writes refreshed access metadata. |
| Semantic retrieval | Six distinct records returned, each with a current assessment and ready index. Command took 1.702 seconds. |
| Reasoning and persistence | One successful Luna `xhigh` response, 16,260 prompt tokens and 3,628 completion tokens, including 2,910 reasoning tokens. The complete review command, including database checks and storage, took 39.567 seconds. |
| Independent read-back | The separate history command returned an identical result in 0.804 seconds, with no model call. Source/assessment revision bindings and the stored review content hash matched. |

Private inputs, the runner, unedited answer and machine-readable verification receipts are retained outside Git. This demonstrates one complete pipeline run over a selected sample, not full source coverage, qualified judgment, independent capacity feasibility, automatic source syncing or a deployed service. The run made 181 provider requests, including 146 database reads; repeated access/integrity checks should be measured and reduced without weakening their guarantees before broadening the workload.

## GLM rerun

The operator then selected GLM instead of Luna. The private request configuration now uses `@cf/zai-org/glm-5.3-flash`. The same six source revisions, retained Jev answers, question, context and system prompt were used; source expiry and the 1,000-call allowance were unchanged. Explicit processor permissions changed to GLM while preserving reader scope and expiry.

The first `max` attempt returned the old generic transport/validation error after 120.662 seconds and saved no recommendation. A single `high` retry succeeded, returning the requested GLM model with 16,939 input and 1,611 completion tokens. The unedited answer was stored in Turbopuffer. A separate CLI history read returned the identical result in 0.451 seconds with no inference call; content hash and evidence equality checks passed. These runs do not establish a latency distribution or model quality ranking.

Batch reads reduced the successful six-source review from 69 provider requests to 10, and historical inspection from seven to two. Each boundary still fetches fresh, strongly consistent heads and checks every source's access, revision and assessment. No cross-stage authorization cache was introduced. The final ledger count was 993, including the failed attempt and processor-grant updates. Limits were not increased or reset.

Local verification: 77 tests passed, including multi-source revocation, changes during retrieval, missing assessments, duplicate/unexpected provider rows and explicit timeout receipts. Timeouts now produce a specific bounded error and durable receipt. GLM `high` is the current example configuration; the failed `max` attempt and earlier Luna result remain separate private artifacts.

## Source-sync verification — 26 September

The implementation uses the existing three runtime dependencies. Pstack first-principles, idempotence, shared-state separation, behavioural testing and direct verification informed the change. Corridor analysed the plan before code, and its feedback CLI ran once for this task.

Local verification: 102 tests pass; Ruff checks and formatting pass. Added cases cover unchanged rereads, source changes, access loss/restoration, stale captures, incomplete pagination, rate-limit backoff across restart, failed preparation and deletion recovery, legacy state hashes, generation-safe search, metadata-only permission patches, native-vector reuse and scope-level review freshness. Synthetic failures exercise cases that must not be induced in real source systems.

One freshly authorised real Slack thread capture then ran through the CLI into the existing London namespaces. A strong batch read confirmed the current source, bound Jev assessment, indexed revision and ready sync checkpoint. Hosted verification exposed two defects that were fixed: the namespace schema must be updated before a filter references new fields, and replay must compare against the exact stored head representation, including default fields. Recovery completed with zero new Jev calls and all 20 vectors supplied from existing chunks, avoiding native re-embedding.

The final recovery used 14 requests plus one strong readback. Including earlier failed attempts and diagnosis, this task used the remaining 52 requests in the existing allowance, ending at 1,100. No limit or ledger was reset. A separate post-success forced replay was not run against the hosted service; unchanged successful replay is verified locally. Direct Slack HTTP behaviour is covered with transport tests; the live source acquisition used MCP, since no direct Crowbo Slack token was configured. There is no deployed scheduler, continuous source collection, or new GLM recommendation from this test. Private inputs and receipts remain outside Git.

## Scenario loop and local MCP

The 28 September increment adds `decide` and `inspect-decision` to the CLI, plus a stdio MCP server. A decision requires current assessments and fresh, permitted evidence. Its saved record keeps individual Jev answers, named readiness checks, attributed inputs, optional expected-loss arithmetic and a simulated GLM recommendation. It does not combine these into one score. [The backend brief](TECHNICAL-PLAN.md#evidence-bound-scenarios-and-mcp) owns the design and limitations.

```sh
uv sync --locked
uv run --locked crowbo --settings /private/path/settings.json decide /private/path/case.json
uv run --locked crowbo --settings /private/path/settings.json inspect-decision REVIEW_ID
uv run --locked crowbo-mcp --settings /private/path/settings.json
```

The last command waits for an MCP client on stdin/stdout. It opens no port. Configure a trusted Codex project in its root `.codex/config.toml`, using absolute paths:

```toml
[mcp_servers.crowbo]
command = "/absolute/path/crowbo/.venv/bin/python"
args = ["-m", "crowbo.mcp_server", "--settings", "/private/path/settings.json"]
cwd = "/absolute/path/crowbo"
startup_timeout_sec = 15
tool_timeout_sec = 240
required = true
```

Keep this machine-specific configuration ignored by Git. It contains paths, not credentials; existing environment or Keychain lookup supplies credentials. New tasks must load the project configuration. `codex mcp get crowbo --json` verifies discovery from the project root. The server offers `search_evidence`, `inspect_evidence`, `run_decision`, `inspect_result`, `record_feedback` and `inspect_feedback`. If the client sets `enabled_tools`, include both feedback tools to expose them.

The portable [scenario client](../proof/mcp_scenarios.py) imports only the official MCP SDK and Python's standard library. It discovers tools, searches Turbopuffer, inspects selected records, pins their exact revisions, runs one case at a time and reads retained history. Private case files hold expectations separately from model requests. Each run saves resolved case inputs, results, elapsed time and deterministic checks. Use a new output filename for every run:

```sh
uv run --locked python proof/mcp_scenarios.py \
  --python /absolute/path/crowbo/.venv/bin/python \
  --server-dir /absolute/path/crowbo \
  --settings /private/path/settings.json \
  --cases /private/path/cases.json \
  --output /private/path/new-run.json
```

The dataset is a selected private sample, not complete source coverage. Real source reads and labelled counterfactuals remain separate. Assistant-authored qualitative expectations are development candidates, not qualified judgments. A passed arithmetic or access test does not establish recommendation quality. This is a bounded replay command, not an unattended scheduler.

### Record feedback and reassess

Create an owner-only feedback JSON file outside Git. This is a synthetic template; replace the placeholder with an actual saved decision ID and use the actual review time:

```json
{
  "result_id": "EXACT_SAVED_DECISION_ID",
  "reviewed_at": "2026-09-28T09:00:00Z",
  "rationale": "The owner and delivery estimate still need confirmation.",
  "choice": {"kind": "defer"},
  "corrections": [{
    "statement": "A merged repair does not establish a successful recovery test.",
    "basis": "Operator judgment; request a scoped retest observation.",
    "source_ids": []
  }],
  "revisit_when": ["A permitted retest result and a delivery estimate arrive."]
}
```

```sh
uv run --locked crowbo --settings /private/path/settings.json record-feedback /private/path/feedback.json
uv run --locked crowbo --settings /private/path/settings.json inspect-feedback FEEDBACK_ID
uv run --locked crowbo --settings /private/path/settings.json decide /private/path/reassessment.json
```

The first command writes feedback to Turbopuffer without calling Jev or GLM; the second checks current access and reads it. Both consume database requests. Repeating the exact input, including `reviewed_at`, returns the same immutable feedback record. A changed input creates another record. The private report contains the ID.

For reassessment, copy the original decision request, give it a different `case_version`, set `prior_feedback_id` to the saved feedback ID, and select every prior and feedback source plus any new deciding evidence. Pin the current revisions and refresh stale sources through the normal preparation path first. The final command runs fresh reasoning and saves a new decision. A failed inference leaves the feedback intact. It never edits the source, approves work or changes Jev weights.

To ground a correction or outcome, provide its logical `source_ids` and bind each in `supporting_revisions` to an exact stored revision. An optional `outcome` contains `statement`, `basis`, `source_ids` and `observed_on`. Outcomes remain reported assertions. Use stable source references rather than local `[E1]` or `[P1]` labels in feedback text. The [data contract](DECISION-DATA-MODEL.md#reported-feedback-and-reassessment) owns the field meanings and limitations.

The same path is available through MCP: `record_feedback(request)`, `inspect_feedback(feedback_id)`, then `run_decision(request)` with `prior_feedback_id`. The configured reader is attribution, not authenticated human authority.

### 28 September scenario results

The private dataset contains 15 selected records across seven systems: four Linear issues, four Slack threads, two Notion pages, two GitHub PR bodies/metadata, one Drive document, one Granola summary excerpt and one narrow HiBob browser observation. Email and calendar searches were also checked for relevant evidence; neither contributed a record. The meeting excerpt is an AI summary, PR bodies are assertions rather than deployment receipts, and the calendar observation does not establish spare capacity. Private source content and judgments remain outside Git.

The first eight-case pass exercised a programme-wide choice, customer follow-up, contradictory protection evidence, export/authority boundaries, capacity after the planning window, two hypothetical financial assumptions and record-order variation. Six returned saved GLM decisions; one broad case returned an unfinished response and the other timed out at 120 seconds. The process returned a failure status. Both broad cases then completed with the same evidence and model after the requests asked for concise output. These two successful variations do not establish a general latency or reliability guarantee.

| Check | Observed result |
| --- | --- |
| Live protocol | Separate SDK client negotiated `2026-07-28`; local subprocess tests also exercise `2025-11-25`. |
| Retrieval | Two semantic searches completed in 0.704 and 0.629 seconds; selected-source inspection in 0.272 seconds. |
| Reasoning | Eight successful results across ten attempts; successful tool calls took 50.959–93.908 seconds including database checks and persistence. |
| Calculation | Real cases retained `missing_input`. Attributed hypothetical inputs produced GBP 200,000/year and GBP 50,000/year, with no claim that the assumed treatment effect was demonstrated. |
| Replay | Every successful case passed exact-revision and simulation checks. Saved-result readback remained current; oversized search input was denied. |
| Local verification | 140 tests pass; Ruff checks/formatting pass for the connected code, tests and scenario client. Historical proof scripts remain outside that lint scope. |

The first client script did not include discovery/readback success in its overall exit gate. Review found and fixed this; nine regression cases cover failed discovery, failed or stale/mismatched saved results and incomplete source inspection. Earlier receipts remain unchanged. Provider failures now retain sanitized finish-reason and token-usage metadata before answer validation; truncated output cannot become a saved recommendation.

Technical completion is separate from judgment. The broad cases agreed on a first workstream, but one mixed an older deadline with the latest deliverable and proposed timing without confirmed capacity. A capacity variation assumed a credible remediation timeline needed no engineering input. These are candidate judgment failures, not passing professional evaluations. The next semantic increment should bind each commitment to its own deliverable, date, responsible person and completion state, then test corrections on separately reviewed cases. Adding source volume or a combined score would not resolve those errors.

This run continued the same operational ledger from 1,100 calls, with a bounded additional 600-call allowance. A further 50-call allowance was recorded for the separate natural-language client check. The resulting ceiling is 1,750 calls / USD 87.50 in coarse application reservations; no ledger was reset and these reservations are not provider invoices. Source collection and refresh remain explicit operations. Stale selected scopes block new decisions.

The separate workspace's natural-language test completed through a fresh Codex CLI session: one semantic search, one evidence inspection, one decision and one saved-result inspection. The model selected two current records; the result retained both exact revisions and reported `decision_ready: true` and `evidence_unchanged: true`. GLM returned 12,996 prompt / 1,686 completion tokens. This is an additional successful decision beyond the ten scenario attempts above.

Readiness here means the evidence basis passed the application checks, not that the recommendation is correct. Receipt review found the answer attached one source's Jev value to the other source's citation; it also used 634 words despite the request for at most 600. Citation-ID validation cannot detect a claim attached to the wrong valid citation. These errors remain visible in the private review and are not counted as qualified judgment passes.

Host limitations were recorded separately. The existing desktop task did not expose the newly configured MCP tools. The standalone CLI 0.144.6 failed before tool use because the configured host model required a newer version. The already-installed app-bundled CLI 0.155.0-alpha.16.4 loaded the tools. Its first read-only run reached the decision tool but refused it under approval policy `never`, correctly reflecting that the tool saves a simulation. A fresh run using the normal automatic approval reviewer completed; no bypass flag or app upgrade was used. Desktop tool reload remains unverified.

The final ledger is 1,743 / 1,750 calls. Seven requests remain, insufficient for another complete decision journey. Review usage before allocating another bounded batch. The current work installed no recurring job and will make no background provider calls.

### 28 September deck-alignment verification

The local feedback increment passes 164 tests, including the previous 140. Ruff checks and formatting pass for the connected implementation, tests and scenario client; 45 local documentation links were checked. The CLI and actual MCP protocol tests cover recording, inspection, duplicate replay, reassessment and access denial. Synthetic provider responses establish the application behavior, not the quality of GLM's response to feedback.

An independent implementation review found two historical-citation ambiguities. Both were fixed and rechecked: feedback uses exact source references, and historical conversion changes citation labels without renaming ordinary assets. Current access checks cover inherited contributors even in a third-generation result. Feedback recording remains usable without inference, and a failed model response preserves the feedback.

The two feedback tools were added to the existing ignored allowlists in this project and the separate MCP lab. Fresh SDK clients discover all six tools; desktop task reload remains unverified. This increment made no hosted evidence/model calls, changed no allowance or source freshness, added no dependency, and was not published or deployed. It establishes a retained review loop; automatic learning, verified outcomes, owner authority and professional judgment remain unqualified.

### 28 September source-bound fact experiment

The next increment adds deliverable-specific interpreted facts in the existing GLM call, exact quoted spans, and deterministic resolution of Jev references. It adds no dependency or service. Named experiment allocations replace the lifetime ceiling for explicitly selected runs; the legacy ledger and its 1,743 requests were preserved.

The private experiment refreshed four already selected Slack threads and used three for a customer-delivery decision. Existing Jev assessments and source revisions remained reusable. It ran a Crowbo baseline, saved correction and reassessment, a plain GLM comparison, and one joint comparison of hypothetical deadline, late-capacity and reported-completion branches. Both arms used the same raw evidence, policy, model, high effort and 8,192-token completion ceiling. Saved bindings/configuration and correction content matched. The plain arm was reused from an earlier attempt and equality checked afterwards; this was not a randomized trial or isolated Jev ablation.

The initial full-card response reached the 4,096-token limit; a second attempt timed out at 120 seconds. Two follow-on calls were interrupted and their provider outcomes remain unknown. Removing repeated unknown fields from generated output allowed the final structured baseline and reassessment to complete in 50.582 and 22.926 seconds. Code still records omitted fields as unknown. The comparable plain baseline and reassessment took 21.529 and 25.915 seconds. The joint branch review took 50.307 seconds. These few related calls are development observations, not latency benchmarks.

The model distinguished an earlier delivered package from a later remediation request, and the plain reassessment stopped transferring the old deadline after correction. A material failure remains: a real waiver-expiry quotation was assigned to the wrong semantic field, including a response-deadline card that contradicted the answer's own prose. Exact quotation checks establish origin but do not establish the intended relation. This run does not qualify professional judgment, autonomous prioritisation or a benefit over plain reasoning. Separate single-variation and source-order runs were not completed in this increment; permission loss remains covered by synthetic tests rather than live permission changes.

The local suite now passes 196 tests; Ruff and formatting pass. A private HTML prototype renders saved recommendations, evidence and correction history using Nest, Flock, Feathers and Flight log. Content and internal links were checked. Browser policy rejected its local file URL, so visual/browser interaction verification remains unperformed. The existing desktop MCP configuration was not repointed or reloaded; fresh clients selected the experiment settings explicitly.

The experiment consumed 576 of 600 provider requests and 11 of 20 model calls. Seven model outputs completed, one was truncated, one timed out, and two interrupted calls have unknown outcomes. Available receipts report 121,678 prompt and 16,264 completion tokens, including the truncated call and excluding unknown usage. No new Jev inference was required. Actual invoiced cost remains unknown. Private source content, exact result IDs, failure receipts, comparison manifest and prototype remain outside Git. No deployment, publication, automatic learning or execution followed.

### 29 September access-decision comparison

The [account contract](DECISION-DATA-MODEL.md#access-decisions) and [three-method comparison](MEASUREMENT-PLAN.md#access-comparison) are implemented in the existing backend. No dependency or service was added. Contextual Jev assessments bind to an account/system/scope and source revision, with current processing checks and retained provenance. General ingestion assessments are omitted from all access-model inputs.

The private run used three labelled synthetic families and one real account case from the seven previously approved internal records plus two public documentation paraphrases. It made 17 decision attempts across the original comparison and separately recorded contract iterations: nine saved recommendations, six validation rejections and two timeouts. These are development completion counts, not accuracy or independent professional evaluation.

All three methods chose the tested scoped credential in one synthetic case and the tested project-scoped role in another, rejecting a narrower role that failed a required recovery task. Their two complete comparison groups have matching input receipts. After clarifying output constraints and requesting shorter answers, both guided methods completed the real case and recommended establishing current work and effective permissions. The plain arm still failed validation, so the full real three-method comparison remains incomplete. The guided pair's model, schema, prompt, limits and source payload match apart from contextual Jev.

No Jev benefit is established. Both guided answers made an unsupported inference about whether an alternative was available. Some synthetic answers asked redundant questions or made weak identity/feasibility inferences. Unknown-fact and exact-account citation errors continued after the prompt correction; the backend rejected them. Further qualification should test a smaller structured interpretation boundary and practitioner-reviewed semantic expectations, rather than weaken checks to improve completion counts. Private operational details remain in the private experiment record.

Local verification passes 224 tests, current backend Ruff/format checks, and 60 local documentation links and anchors. Actual MCP clients negotiated protocol `2026-07-28`; saved-result readback passed current access and unchanged-evidence checks. Source/processor revocation and cache corruption were exercised with synthetic tests. This run did not change real access grants or source systems.

The new named experiment retained the existing ledger and used 583 of 700 provider requests and 32 of 32 model calls: 17 GLM and 15 Jev. Saved decision journeys took 56.714–96.037 seconds. Available GLM receipts record 81,153 prompt and 45,230 completion tokens, excluding unknown usage for two timeouts; Jev records 24,051 input and 2,240 output tokens. Actual billed cost remains unknown. Private inputs, failures, result histories, comparison receipts, manifests and the decision trail stay outside Git. No deployment or commercial validation follows.
