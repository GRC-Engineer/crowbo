# A local programme decision proof

This working CLI reviews five synthetic controls, compares ten actions against capacity, records a separate simulated owner choice, and reassesses when an incident changes the evidence. It demonstrates the decision engine's responsibilities. It is not a shipped service or a validated security recommendation.

Start with [the recorded results](results/RESULTS.md). This is a historical experiment and learning reference. The [connected backend brief](../docs/TECHNICAL-PLAN.md), [data contract](../docs/DECISION-DATA-MODEL.md), and [evaluation protocol](../docs/MEASUREMENT-PLAN.md) describe the next product build. The connected application will not import this CLI or inherit its fixed action policy. The results file preserves the original run and its then-proposed next steps.

## Try it in the terminal

Use Python 3.11 or later, with SQLite FTS5 for the optional retrieval experiment. The verified environment was Python 3.14.5 and SQLite 3.53.1 on macOS arm64. The decision CLI needs no packages, database server or API key. Run these commands from the repository root.

First read the packet the fictional GRC lead may use:

```sh
python3 proof/crowbo.py --tenant northstar-demo --principal grc-lead inspect --case baseline --as-of 2026-09-25
```

`inspect` reads the fixture and prints authorised JSON. JSON is structured text: objects have named fields and arrays hold lists. The tenant identifies the fictional organisation; the principal identifies the reader. These local flags test selection logic, not real sign-in. The date prevents the October incident from entering the September decision.

Create a recommendation:

```sh
python3 proof/crowbo.py --tenant northstar-demo --principal grc-lead assess --case baseline --as-of 2026-09-25 --output proof/runs/my-demo
```

`assess` writes a record under the named directory. It proposes recovery repair, application approval repair, AI data review and routine cleanup. Upper effort bounds consume three security days and four platform days, with no new cash spend. The directory is local and ignored by Git.

The printed record ID is a hash, a fingerprint of the content. With the unchanged fixture it is the value below. Record an owner disagreement: keep half a security day free instead of doing cleanup.

```sh
python3 proof/crowbo.py --tenant northstar-demo --principal grc-lead decide --output proof/runs/my-demo --recommendation 3f7d9d3a0929306a8dfd1df0cc8e7d4720cbeb80bc9549debbc6ee7ef3e80659 --owner grc-lead --select application_fix recovery_fix ai_data_review --rationale 'Keep the remaining half day as contingency instead of cleaning records.'
```

`decide` writes a second record and leaves the recommendation intact. The owner is simulated; no person has been authenticated or real action approved.

Reassess with the later incident:

```sh
python3 proof/crowbo.py --tenant northstar-demo --principal grc-lead reassess --case incident --as-of 2026-10-02 --output proof/runs/my-demo --previous 3f7d9d3a0929306a8dfd1df0cc8e7d4720cbeb80bc9549debbc6ee7ef3e80659 --owner-decision 7662899bf5c251b5b3beb0be30441681dd6094776d2965a815edf698b7d9d5f2
```

New access evidence makes identity repair eligible. Under the declared priority order, it displaces application repair. Recovery keeps its two reserved platform days. The output flags the prior owner choice for review without revising it. Cleanup is proposed again under the unchanged policy; automatic learning of the owner's contingency preference is not implemented.

Verify and read the original record:

```sh
python3 proof/crowbo.py --tenant northstar-demo --principal grc-lead replay --output proof/runs/my-demo --record 3f7d9d3a0929306a8dfd1df0cc8e7d4720cbeb80bc9549debbc6ee7ef3e80659
```

If you change the fixture or rationale, use the new printed IDs in later commands. A hash changes when its content changes. `--help` on the CLI or a subcommand lists its flags. Rejected input exits with status 2 and creates no decision record.

## Read the code in this order

1. Open [the fixture](fixtures/programme.json). Read `controls`, one evidence record, one action and `baseline`. Everything is invented. `gap` is a provisional interpretation, not a conclusion extracted from prose by the program.
2. Read `packet` in [crowbo.py](crowbo.py). It selects permitted evidence before assessment, so a record from another tenant cannot affect the choice.
3. Read `assess_evidence`. It checks scope, time, coverage and source kind. An assertion cannot substitute for an observation. Opposing usable observations produce a conflict.
4. Read `recommend`. `itertools.combinations` enumerates action groups. `totals` adds separate resource costs. `fits` checks upper bounds. Feasible groups follow the explicit proposed preference order.
5. Read `owner_decision` and `reassess`. They separate recommendation, choice and changed facts. `save_record` prevents overwriting an existing content ID; it does not make the filesystem tamper-resistant.

Run the behavioural checks and separate keyword experiment:

```sh
python3 -m unittest discover -s proof -v
python3 proof/retrieval.py
```

The first command runs the CLI loop and boundary checks. The second builds a temporary in-memory SQLite index over permitted packets and runs eight public queries. BM25 ranks word matches. Embeddings represent text as numeric vectors for semantic matching; this experiment does not create them. Neither command contacts a vendor or changes a real security system.

Interpretation/classification, qualified judgment, real authentication, general graph traversal, ingestion, retention/deletion, model reasoning, API/MCP access and production persistence remain unimplemented. [The measurement plan](../docs/MEASUREMENT-PLAN.md) keeps those claims separate from the demonstrated behaviours.
