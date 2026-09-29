# Results recorded on 25 September 2026

The local engineering proof works. All **17 behavioural tests passed**, including the actual CLI recommendation, separate owner choice, material-change reassessment and replay. Python 3.14.5 and SQLite 3.53.1 ran on macOS 26.6.2 arm64. Engine version: `programme-proof-0.1`.

The [run manifest](manifest.json) records source-file hashes, runtime versions, sample sizes and the explicit zero counts for hosted-vendor and model-baseline runs. Local documentation links, saved record hashes and the cost arithmetic were checked.

Corridor `analyzePlan` ran before code and again before the SQLite refinement. The implementation applies its guidance on validated fields, non-executable text, filtering before indexing, parameterised SQL and bounded file output. The required `corridor feedback --agent` command ran exactly once and returned `Feedback submitted`.

## Inspect the complete loop

| Record | Observed result |
| --- | --- |
| [25 September recommendation](records/3f7d9d3a0929306a8dfd1df0cc8e7d4720cbeb80bc9549debbc6ee7ef3e80659.json) | Proposes recovery repair, application repair, AI data review and cleanup. Uses 3 security days, 4 platform days and $0 at upper bounds. |
| [Separate simulated owner decision](records/7662899bf5c251b5b3beb0be30441681dd6094776d2965a815edf698b7d9d5f2.json) | Chooses the first three actions and retains half a security day as contingency. No action executes. |
| [2 October reassessment](records/5b7d31c8fca677052e37180d307242cf30e32edda15035d9092ec515bb0e268f.json) | Identity changes from `no_gap_observed` to `gap_supported`. Identity repair displaces application repair; recovery remains. The old owner choice needs review. |

The full-loop test verified the first file remained byte-for-byte unchanged. Each recommendation embeds its permitted evidence, alternatives, assumptions and declared policy. The later record links to the original recommendation and owner choice. No later incident text appears in the earlier packet.

## Case and boundary coverage

| Public variation | Behaviour exercised |
| --- | --- |
| Baseline | Uses existing resources, fits upper effort bounds and retains assertion-only uncertainty |
| Material incident | Reallocates flexible capacity without rewriting earlier records |
| Contradiction | Preserves opposing observations and proposes reconciliation |
| Stale evidence | Keeps claims unresolved and names the unmet recovery commitment |
| Capacity cut | Stays within capacity and requires resolution of the unmet commitment |
| Missing capacity | Makes no allocation; unknown capacity is not unlimited |
| Supported pilot | Permits the $6,000 fictional pilot with current gap evidence and capacity |
| Partial scope | Proposes investigation instead of treating incomplete coverage as a pass |
| Malicious source text | Cannot change structured policy, capacity or execution authority |

Other checks cover foreign/restricted canaries, future exclusion, invalid principals/dates, invalid resource values/references, ordering and wording invariance for unchanged structured interpretations, effort sensitivity, path traversal, symlinks, content edits and idempotent record creation. These are bounded implementation checks, not production isolation assurance or a language-model injection evaluation.

## SQLite retrieval run

The saved [raw result](sqlite-retrieval.json) contains 8 queries × 50 repetitions, with 5–6 visible records per packet. All proposed relevant records appeared in the first five results. Mean recall@5 was 1.0; relevant fractions among returned records ranged from 0.20 to 0.67. The tiny corpus and unreviewed labels make this unsuitable for inferring comparative quality.

Per-query median time ranged from 0.0095 to 0.0160 ms; p95 ranged from 0.0106 to 0.0318 ms. These in-process query timings exclude loading, validation, permission selection and model reasoning. The first request is included; cache states were not isolated. The initial smoke run and saved rerun returned the same IDs, with different timings. No hosted-vendor latency follows from this result.

Query-set SHA-256: `8ab0257447cf8e046a8ac61770cba5fa5c356b1655fb07d054e8a8d091edaa34`. Baseline permitted-packet SHA-256: `658b57a1fd9beea3f6ab5c151c3fe057081778c587083e3c2e271f03d492db9b`. Every query result also records its packet hash.

## Evidence still needed

| Deliverable or claim | Status |
| --- | --- |
| Architecture and pricing | Current primary documentation and estimates in [the comparison](../../docs/ARCHITECTURE-COMPARISON.md) |
| Local decision loop and SQLite mechanism | Implemented and exercised as described above |
| Neo4j, MongoDB and turbopuffer live comparison | Not run; no local servers or configured turbopuffer key in the shell; no services provisioned |
| Capable-model, skill and retrieval/workflow decision baselines | Strong prompts and equal-resource protocol prepared; no provider API credentials configured; no model runs or scores |
| Interpretation quality and general judgment | Not measured; labels and priority order are assistant-authored |
| Qualified review and held-out evaluation | Not performed; every present case is exposed development material |
| Deployment, customer acceptance and commercial evidence | None established by this work |

The next bounded experiment is review of the proposed criteria followed by same-packet model comparisons. A first-week milestone can be a reviewed rubric and metered comparison on these open cases. Fundraising can proceed alongside that work. There is no scheduled monitor or unattended follow-up.
