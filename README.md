# crowbo

Security decision infrastructure. Crowbo aims to turn evidence, business context and policy into reasoned, traceable recommendations for people and agents.

The name combines the English crow with a nod to the French corbeau. It is pronounced CROW-bo; the proposed wordmark is lowercase.

## Start here

- [Foundation](docs/FOUNDATION.md) owns the product direction and scope.
- [Backend build brief](docs/TECHNICAL-PLAN.md) owns the connected architecture and incremental build.
- [Data contract](docs/DECISION-DATA-MODEL.md) owns evidence, decision inputs and history.
- [Permissions](docs/PERMISSIONS.md) defines source audiences, Jev-derived access and the boundary between local assertions and production identity.
- [CLI and MCP guide](docs/PILOT.md#scenario-loop-and-local-mcp) explains the shared decision interface and private replay client.
- [Storage design](docs/ARCHITECTURE-COMPARISON.md) owns database selection, layout and limits.
- [Evaluation contract](docs/EVALUATION.md) and [measurement plan](docs/MEASUREMENT-PLAN.md) own judgment review and experiments.
- [Contributor instructions](AGENTS.md) govern work in this repository.

Crowbo should connect permitted security and company context to a decision question, assemble the deciding evidence, compare feasible options and retain the basis for reassessment. The initial portfolio is remediation tracking, access reviews, and issues and exceptions management. The access experiment is the implemented starting point; the other workflow extensions remain proposed.

## Current state

The first connected Python CLI is implemented: import a permitted private source bundle, store source revisions in turbopuffer London, prepare independent Jev assessments and native Voyage embeddings, and retrieve evidence with its matching assessment. The first hosted run used five real, privately held records. Exact listing, keyword search, semantic search and repeat-import reuse succeeded. See the [pilot guide and run record](docs/PILOT.md).

The CLI also supports configurable Jev questions, evidence-bound decision scenarios, attributed expected-loss arithmetic and retained-review inspection under current access. A [local MCP and portable replay client](docs/PILOT.md#scenario-loop-and-local-mcp) expose the same checked decision path. [Attributed feedback](docs/PILOT.md#record-feedback-and-reassess) retains a simulated choice, correction or reported outcome and links it to a later reassessment. A one-shot Slack sync command reconciles selected threads and tracks review freshness; see [configuration and limits](docs/PILOT.md#slack-synchronisation). Unattended scheduling, other direct source connectors, independent capacity calculations, a hosted HTTP service and multiuser authentication remain future work. Historical experiments are not architecture inputs. No customer outcome or recommendation-quality advantage has been validated.

The [access comparison](docs/PILOT.md#29-september-access-decision-comparison) adds account-specific facts, feasible-option comparisons and contextual Jev alongside matched baselines. The earlier [fact-card experiment](docs/PILOT.md#28-september-source-bound-fact-experiment) records exact source spans and deterministic Jev references. Their semantic errors and incomplete comparisons remain documented; structured output and passing engineering tests are not qualified judgment.

## Run the connected CLI

```sh
uv sync --locked
uv run --locked pytest -q
uv run --locked crowbo --help
```

The [pilot guide](docs/PILOT.md#running-it) explains private configuration, credentials, import, retrieval and review. Private inputs and outputs must stay outside every Git checkout.

## Review backend changes

Run `uv run --locked ruff check src tests proof/mcp_scenarios.py` and `uv run --locked ruff format --check src tests proof/mcp_scenarios.py` alongside the tests. Publish bounded changes on feature branches and review them through pull requests, following the [GitHub checkpoint workflow](AGENTS.md#github-checkpoints). Verify the pushed commit separately from merging or deploying it. The repository contains no provider credentials or private evidence needed to reproduce a hosted pilot.

Crowbo is a new software project. The connected backend is designed from the agreed service primitives and the first real decision workload. Historical prototypes are separate artifacts and are not imported.

This is a public repository. Examples must be synthetic or drawn from public sources with suitable rights. Customer evidence, employer materials, private meeting notes and credentials do not belong here.
