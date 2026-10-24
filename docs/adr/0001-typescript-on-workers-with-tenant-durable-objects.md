# 1. TypeScript on Cloudflare Workers, one Durable Object per tenant, Turbopuffer for search only

Status: accepted, 30 September 2026. Decided by the founder; implemented on branch `feat/typescript-backend`.

## Context

The Python pilot stored every record in Turbopuffer: source heads, revisions, assessments, reviews, feedback and sync state. Turbopuffer checks conditional writes one row at a time and has no multi-row transactions. So each decision re-read and compared its evidence snapshot about six times around the model call. Every read was a metered network call counted against the local request ledger: 146 of 181 provider calls in the first full run were reads. Decisions took 21–96 s. Over 90% of that was the model call, and the re-reads cost about 1–4 s. The founder wants decisions to become infrastructure: sub-second for the common case and cheap enough to call constantly. That means moving reasoning off the serving path and serving recurring questions by lookup.

## Decision

- **Language:** TypeScript everywhere. The backend runs on Cloudflare Workers.
- **System of record:** one SQLite-backed Durable Object per tenant. The ported services run inside that object, next to their data. Each tenant's writes go through a single writer, and the integrity re-reads the services still perform are local reads, not network calls.
- **Search:** Turbopuffer stays as a rebuildable search index only. It holds BM25 and native Voyage embeddings in the `-chunks` namespace. Records never live there.
- **Standing decisions:** recurring questions (access retain, finding close, exception validity) are answered by approved, eval-gated criteria over source-bound facts. Answers are stored as immutable versions addressed by their inputs. Currency and access are worked out at read time, so revocation applies on the next ask and no cached answer can drift. Novel questions keep the full reasoning path.
- **Interfaces:** one operation table serves the HTTP API, a streamable-HTTP MCP endpoint and the operator CLI.

## Alternatives considered

- **Postgres (e.g. Neon via Hyperdrive) as the system of record.** It is portable and good at cross-tenant analytics. We rejected it for now: it adds a vendor and a connection layer, and gives no per-tenant physical isolation. Revisit if cross-tenant reporting or one tenant's throughput (about 1,000 requests/s per object) becomes binding.
- **Cloudflare Vectorize instead of Turbopuffer.** Rejected for now. Vectorize is eventually consistent. Revisit if it matches recall on the evaluation cases.
- **Python Workers.** Rejected. They sit behind a compatibility flag, cold starts take about 1 s against about 5 ms for JavaScript isolates, and Pydantic runs in slower pure-Python mode.
- **Cached decisions with a separate dependency table and invalidation queue.** We rejected this for the rule tier. Evaluation takes microseconds, so compute-on-read with idempotent inserts removes the invalidation protocol entirely. A queue is reserved for a future model-backed tier.

## Consequences

- Revision, logical, head, assessment and question identities are byte-identical to the Python pilot. Golden vectors generated from the Python code enforce this, so existing records keep their identities.
- The integrity checks are preserved as ported, and are now cheap local reads. Simplifying them is a separate, test-guarded change.
- Throughput above about 1,000 requests/s for one tenant will need sharding by team or workflow.
- Latency targets are not yet measured on deployed infrastructure. `backend/scripts/smoke.ts` records local figures only.

## Amendment, 23 October 2026

Data placement is not pinned, at the founder's direction. Tenant objects are created without a jurisdiction, so Cloudflare places each one near where it is first used. The search region is `aws-us-east-1`, and search indexes in the previous region are rebuilt there, not migrated. The title, decision, alternatives and consequences above were edited to match, and Voyage embeddings are still computed in a location Turbopuffer lists as global.
