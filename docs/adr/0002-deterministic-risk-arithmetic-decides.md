# 2. Deterministic risk arithmetic decides; models extract and explain; the graph is a table

Status: proposed, 8 October 2026. Architecture review by three independent models (Opus, Fable, Sonnet), same brief, same verdict. The prototype is in `backend/src/engine/` and the target design is in [ENGINE.md](../ENGINE.md).

## Context

The founder proposed this pipeline:
1. classify every record with a model;
2. embed it;
3. put it in a graph;
4. combine the graph and the vectors;
5. retrieve on request;
6. run a light analysis with a small model;
7. return the decision.

The product's promise is the next move *by risk removed*, with weights the company can see and edit, and decisions that stay current. The review found that nothing in that pipeline computes risk. Step 6 would quietly become the risk model. That contradicts the separation in AGENTS.md (interpretation, then calculation, then recommendation, then an authorised decision). It reverses ADR 0001's move of reasoning off the serving path. And it repeats the one semantic failure on record, which happened with the same model class: a real quote bound to the wrong deadline.

## Decision

- **Decide in code.** The next moves come from deterministic arithmetic: expected loss ranges × reduction × evidence confidence, chosen under capacity. Its inputs are quote-bound facts and the company's own visible weights, scenarios and estimates. Identical inputs give an identical, input-addressed decision.
- **Models at the edges.** Models extract facts (qualified by the evaluation gate), propose missing estimates (labelled as proposals), and explain computed results. They never select or rank.
- **The graph is an edges table** in the tenant's SQLite Durable Object. Each edge records its contributing source revisions and is checked against access when traversed. No graph database until a measured multi-hop failure needs one.
- **Retrieval finds evidence; it does not define the options.** Moves come from a register of scenarios and actions, not from top-k hits.
- **Memory is append-only.** Calls and weight changes are kept and hash chained. Tuning is proposed from the history and applied only by a person.

## Alternatives considered

- **A model chooses at request time.** Rejected. It isn't reproducible, its quality can't be checked without the evaluation set, it reintroduces 20–90 s latency, and it hides the weights the product promises to show.
- **A separate graph database.** Rejected for now. It adds a second consistency domain and a residency question, and needs its own copy of access state. Revisit after a measured traversal failure.
- **Classify every record across many dimensions up front.** Rejected for now. Every dimension that feeds a decision needs reviewed labels, and stored labels go stale on every criteria change. Extract only the predicates the scenarios and actions read.

## Consequences

- The quality of a decision rests on the quality of its estimates. Every number needs a stated basis, and the open question of where first estimates come from is now central.
- The evaluation set (about 30 two-reviewer cases) remains the critical path to production.
- The existing standing-decision tier is the same pattern for single-subject questions. The engine generalises it to cross-action prioritisation.
- The prototype's greedy fit and point confidence are placeholders. Production uses interval or Monte Carlo comparison and reports which estimate would change a move.
