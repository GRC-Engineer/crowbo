# Turbopuffer storage design

25 September 2026. Turbopuffer is the selected evidence database and search service. No additional primary database is selected. [The backend brief](TECHNICAL-PLAN.md) owns dependencies and application flow.

## Initial namespace layout

A customer-derived prefix selects two namespaces in the same service:

- `-records` stores source revisions, current heads/access, Jev assessments, sync checkpoints and saved reviews.
- `-chunks` stores text for native embedding/BM25 search, source/version references, offsets and access prefilters.

Chunks can be rebuilt without overwriting history or embedding every assessment/review update. The application resolves hits to current authoritative records before disclosure.

Nested bodies are serialized JSON string attributes. Query fields, including kind, IDs, readers and expiry, are separate typed attributes. Conditional state-hash writes protect source-head changes. A skipped write requires reconciliation.

Customer identity is trusted local configuration for this CLI. Production requires authenticated identity; caller-selected namespaces alone are insufficient.

## Native embeddings for the backend

The selected database region is London, `aws-eu-west-2`. The text schema uses `voyage/voyage-4-large`, 1024 dimensions and full-text search. Turbopuffer embeds writes and queries. There is no separate Voyage client or key.

[Embedding documentation](https://turbopuffer.com/docs/embedding) and [regions](https://turbopuffer.com/docs/regions) define provider behaviour. London database storage does not imply London inference; the selected Voyage route is listed as Global.

The current overlapping chunks retain source offsets. Their size is an implementation choice to evaluate, not a demonstrated optimum.

Unchanged content refreshes only access metadata. For changed sources, exact unchanged chunk text can reuse its stored native vector; other chunks use native embedding. Reuse is limited to the current fixed model and dimension. A model or chunking change requires an explicit migration. Offset-based chunks can shift after an edit, reducing reuse; this is not a message-level embedding cache.

## Text search without another service

Exact references fetch known records. Keyword search uses BM25; semantic search uses native query embedding. Both return sources with stored assessments after current access/version checks.

Top-k search and deduplication produce a partial population. They cannot replace a complete constraint review. Regex indexing, a graph database and a search agent are not prerequisites; add capabilities only for demonstrated retrieval failures.

## Durability and limits

Persist sources before inference. Durable heads retain pending assessment/index state, so a new process can resume. Reconcile obsolete search chunks after successful indexing.

The local standard-library SQLite table only records API reservations and receipts. It is neither source storage nor a search fallback. [The dependency audit](TECHNICAL-PLAN.md#dependency-audit) explains its operational use.

There is no atomic transaction across namespaces. Schema migration completes before writes that filter on new attributes. Generation-specific IDs and cleanup restricted to older generations prevent a delayed index writer from deleting newer chunks. Permission patches are conditioned on their check time. Head checks reject delayed writes' obsolete generations; a later reconciliation reclaims them. This does not establish distributed-worker or production scale guarantees.

The first Slack synchroniser saves pending state before reading, then marks the scope ready only after complete pagination and preparation. Failures preserve a retry time without advancing successful coverage. Known revocations/expiry block reads; confirmed unavailable sources also trigger bounded chunk deletion. Full history erasure and hosted restore checks remain unimplemented.

The private pilot exercised persistence, conditional writes, native embeddings, exact/keyword/semantic reads and repeated-import reuse. [The run record](PILOT.md#observed-hosted-run) separates hosted receipts from local tests. It does not establish scale, production isolation or decision quality.
