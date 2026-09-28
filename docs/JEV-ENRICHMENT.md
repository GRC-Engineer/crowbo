# Jev enrichment: batching, cascades and scale

28 September 2026. Context retained from the founder's architecture discussion. The preference below is explicit; the design and arithmetic are proposals and planning estimates, not measured pipeline results. The [foundation](FOUNDATION.md) and [evaluation contract](EVALUATION.md) continue to govern the product and qualification of judgment. This note changes no runtime configuration or code.

## Founder preference

Prioritise fast retrieval. Slower ingestion is acceptable because evidence can be processed as it arrives. Spend time during ingestion on multiple Jev assessments, including dependent CRQ questions, then retain their answers alongside searchable evidence. Explore approximately 50 questions per piece of evidence, with up to 60 discussed as a possible target. Neither number is a selected provider limit.

## Proposed shape

- Voyage creates the semantic embedding. Jev evaluates source text and supporting context, not the embedding's numerical coordinates.
- Store named Jev answers and their probabilities alongside the indexed evidence. These are metadata attributes, not automatically additional embeddings. Known facts such as source type, source version and access permissions come from trusted source metadata.
- Batch independent questions using the same evidence into one request. If an answer determines what evidence to fetch or which questions to ask next, make a subsequent request. Fifty questions across a few rounds differs from fifty sequential levels.
- A candidate cascade first identifies relevant evidence families, then asks their more specific questions, then fetches and assesses additional context where needed. Three to five rounds is an initial design suggestion, not an agreed requirement.
- Allow several relevant branches and preserve uncertainty. A premature wrong branch must not silently exclude deciding evidence. Use uncertain classifications as ranking signals where hard filtering would hide relevant material.
- Keep document-level properties at the document level and passage-specific claims at the chunk level. Retain subject, scope, observation period, source revision, question definitions/version and model identity for each assessment.
- Changes to contributing evidence or assessment criteria invalidate dependent assessments. Access restrictions apply to derived attributes and shared context. Slow enrichment must not cause old classifications to be presented as current.

Stored evidence interpretation supports retrieval. Current priority, feasibility and a new recommendation still depend on the decision context and may require fresh reasoning.

## CRQ meaning

Use classifications to identify evidence relevant to threat activity, loss frequency, loss magnitude, control performance and business context. A record can inform several factors; annual loss expectancy and threat frequency are not mutually exclusive labels.

More assessments produce more interpretations of the supplied evidence. Additional sources are needed when the evidence cannot answer a question. A model's probability that a passage supports a classification is not the probability of a future loss event.

Keep source interpretation separate from scenario-level calculations. Quantification requires an explicit scenario and time horizon, supported frequency and magnitude inputs, units and uncertainty. Fifty chunk labels do not establish a calibrated risk model or fifty independent pieces of evidence.

## Shared context and reuse

- Questions in one request already share the supplied state. Batching avoids resending it for each question.
- Assess applicable document-level properties once, then reference them from chunks without turning them into passage-level claims.
- Use embeddings to find related supporting evidence. Similarity alone is insufficient to reuse a conclusion: planned and completed remediation can have similar wording.
- Reuse unchanged assessments only when the relevant source, supporting context, assessment configuration and access conditions still match. Preserve provenance across reuse.
- Storing a context reference reduces application duplication. Jev still needs the relevant text supplied in its request; an ID or embedding is not a substitute. Do not assume provider-side caching savings.

## Verified documentation and remaining uncertainty

Documentation checked on 28 September 2026:

- [TypeSafe questions](https://docs.typesafe.ai/primitives) supports mixed, independent questions over one state in a single request. Dependent requests are needed when earlier answers change the next input or available choices.
- [TypeSafe hierarchical classification](https://docs.typesafe.ai/cookbooks/hierarchical_classification) demonstrates traversing a hierarchy and considering multiple candidate paths.
- [TypeSafe batching example](https://docs.typesafe.ai/cookbooks/parallel_questions) explains that separate requests repeatedly pay for the same document context.
- [Cloudflare Jev](https://developers.cloudflare.com/ai/models/typesafe/jev/) lists a 32,000-token context window, USD 0.042 per million input tokens and USD 0.00 per million output tokens.
- [Turbopuffer limits](https://turbopuffer.com/docs/limits) lists 1,024 attribute names per namespace. Attribute limits are separate from vector-column limits. [Query filters](https://turbopuffer.com/docs/query#filtering) can constrain vector retrieval using attributes.

Fifty independent questions in one request is a proposed use of the documented batching interface, subject to request limits. This discussion did not execute that exact request through Cloudflare, verify a numerical maximum question count, or verify that the current local configuration permits it. No subsecond latency, throughput or classification-quality guarantee was established. The retained question set must fit alongside evidence and context.

## Jev cost estimate

Illustrative assumptions: 2,000 source/context tokens per call, 150 tokens per question including criteria, 50 total questions per chunk, no caching discount. The 2,000 tokens include supporting context; they are not a selected chunk size.

Cost in USD = total billed input tokens across all calls / 1,000,000 × 0.042.

| Arrangement | Estimated input tokens per chunk | USD per chunk | USD per 100,000 chunks | USD per million chunks |
| --- | ---: | ---: | ---: | ---: |
| One call with 50 questions | 9,500 | 0.000399 | 39.90 | 399 |
| Five calls with 10 questions each | 17,500 | 0.000735 | 73.50 | 735 |
| Fifty calls with one question each | 107,500 | 0.004515 | 451.50 | 4,515 |

For five calls with 10,000 source/context tokens each, the estimate becomes 57,500 input tokens per chunk, or USD 241.50 per 100,000 chunks.

These estimates exclude serialization overhead, growing intermediate context, retries and reclassification. Embeddings, database storage/operations, Workers, other inference and operational costs are additional. Provider usage receipts must replace these assumptions before budgeting a production workload. Prices can change.

## What 100,000 chunks represents

Planning conversions assume about 0.75 English words and four plain-text bytes per token. Actual tokenization varies with language, code and tables. Sizes below use decimal MB and exclude vectors, metadata, indexes and original binary files.

| Average indexed chunk | Total indexed tokens | Approximate words | Approximate plain text |
| --- | ---: | ---: | ---: |
| 500 tokens | 50 million | 37.5 million | 200 MB |
| 1,000 tokens | 100 million | 75 million | 400 MB |
| 2,000 tokens | 200 million | 150 million | 800 MB |

At 1,000 tokens per chunk, this is approximately 300,000 pages at 250 words per page. Overlap repeats text and reduces the unique content represented by that total. Short messages may be much smaller; PDFs with images may occupy much more disk space.

| Average chunks per source record | Source records represented |
| --- | ---: |
| 1 | 100,000 |
| 5 | 20,000 |
| 20 | 5,000 |

These are illustrative conversions, not a measurement of the connected source corpus. With one request per chunk, 100,000 chunks and 50 questions produce five million individual answers across 100,000 requests. A five-round design uses 500,000 requests if every chunk runs every round.

## Candidate comparison

Under the existing evaluation contract, compare smaller and larger question sets against reviewed required facts, including a 50-question batch and a cascade with equivalent assessment intent. Measure actual input tokens, cost, median and 95th-percentile latency, retrieval omissions, classification errors and invalidation behaviour. Include conflicting, incomplete and updated evidence. Question count is a capacity target; retrieval and decision usefulness determine whether an attribute deserves to stay.
