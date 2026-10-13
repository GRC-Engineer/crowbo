# Crowbo backend

The decision API: TypeScript on Cloudflare Workers. [ADR 0001](../docs/adr/0001-typescript-on-workers-with-tenant-durable-objects.md) records why. It is a separate Worker (`crowbo-api`) from the crowbo.ai website, and nothing in `backend/` triggers a website deploy.

## Shape

| Layer | Where | What it owns |
| --- | --- | --- |
| Domain | `src/domain/` | Pure contracts (zod) and identities. Revision, logical, head, assessment and question IDs are byte-identical to the Python pilot, enforced by `test/domain/golden.test.ts`. |
| Services | `src/services/` | Evidence preparation and access, checked reasoning (`Review`), decisions, feedback, access assessment and Slack sync. These are faithful ports of the Python modules behind a `Store`/`Ledger`/`Assessor` seam. |
| Standing decisions | `src/standing/` | Source-bound facts, eval-gated criteria, pure rules per workflow, immutable input-addressed versions, and team-scoped currency and access derived at read. |
| Storage | `src/storage/sql-store.ts` | The tenant's records and request ledger in Durable Object SQLite. |
| Providers | `src/providers/` | Jev and reasoning over Cloudflare AI, the Turbopuffer search index, Slack. Every HTTP client is pinned to one host, never follows redirects and caps response size. |
| Programme prioritisation | `src/programme/` | Which improvements fit the capacity a team actually has, given evidence prerequisites and named commitments. A port of the frozen proof (`proof/crowbo.py`) whose record IDs match the proof's recorded results, exposed as four read-only MCP tools. |
| Engine prototype | `src/engine/` | The [engine architecture](../docs/ENGINE.md) at micro scale: connectors, quoted facts, visible weights, context graph, deterministic next moves by risk removed, hash-chained decision memory. Synthetic company only; served by the local MCP server. |
| Interfaces | `src/worker.ts`, `src/app/` | Bearer-token API (`POST /v1/operations/<name>`), MCP at `/mcp`, the Cron-driven sync, and one operation table shared with the CLI (`src/cli/`). |

Each tenant is one SQLite Durable Object in the `eu` jurisdiction, and the services run inside it. Turbopuffer holds rebuildable search chunks only.

## Run

```sh
bun install
bunx tsc --noEmit
bunx vitest run
bun scripts/parity.ts
```

`scripts/parity.ts` proves the TypeScript suite covers every test from the Python baseline. Each Python test ID must be tagged on a ported test, or listed in `parity/dropped.tsv` with a reason.

Query the synthetic programme from Claude Code: the repo's `.mcp.json` starts `scripts/mcp-local.ts` over stdio. It has no network access, credentials or storage, and serves only the synthetic Northstar fixture.

Local API:

```sh
bunx wrangler dev --env ""
```

This needs a git-ignored `.dev.vars` with these entries:
- `CLOUDFLARE_ACCOUNT_ID`
- `CROWBO_OPERATORS`, the operator map described below
- `DO_JURISDICTION=none`, because local workerd cannot emulate jurisdictions
- `ALLOW_SYNTHETIC_GATES=true`

Model, search and Slack credentials are optional locally: without them, preparation stays pending, search is empty and reasoning refuses.

Smoke test against a running API:

```sh
CROWBO_API=http://127.0.0.1:8788 CROWBO_TOKEN_FILE=.dev-token bun scripts/smoke.ts
```

## Operators and access

`CROWBO_OPERATORS` is an administrator-controlled secret. It maps the SHA-256 of each bearer token to one operator: tenant, reader, teams, roles (`operator`, `criteria_approver`), permitted source scopes and processors, and an experiment allowance.

Team membership comes only from this map. Each request mints a fresh lease of under one hour, and operators cannot assert their own membership. Every derived answer remains subject to the caller's current grant on every contributing source.

## Deploy

`wrangler.jsonc` defines two targets:
- **Production:** `crowbo-api`, with no public URL until a route is chosen.
- **`staging`:** `crowbo-api-staging` on workers.dev. It allows synthetic evaluation gates and has no cron.

Secrets are set with `wrangler secret put`: `CROWBO_OPERATORS`, `CLOUDFLARE_API_TOKEN`, `TURBOPUFFER_API_KEY` and `SLACK_API_TOKEN`. `CLOUDFLARE_ACCOUNT_ID` is a var. Deploying changes the Cloudflare account and needs the owner's confirmation.
