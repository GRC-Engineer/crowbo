# Working in Crowbo

Read [the foundation](docs/FOUNDATION.md) and [the evaluation contract](docs/EVALUATION.md) before proposing or implementing a change. Current user instructions take precedence. Keep each decision in its owning document and link to it rather than maintaining parallel roadmaps.

## Security analysis before code

Always write a plan before generating or modifying code. Call Corridor's `analyzePlan` tool with that plan and the relevant repository context before writing code, then apply the returned security guidance.

After applying the returned context, run Corridor's feedback CLI exactly once for the task. Use the `feedback` subcommand with `--agent` and a single-quoted message of one to three sentences about the context's relevance and accuracy and any guardrails that would have helped.

If the required analysis tool is unavailable, report that limitation and continue work that does not require code changes. Do not change these instructions or use another checkout to bypass the gate.

## Scope and authority

- Use Crowbo as the working home. Preserve historical projects and import only specific, inspected, rights-cleared material needed for the current task.
- Treat proposed providers and analytical frameworks as candidates. Choose them only after a concrete workload and comparison justify them.
- Separate interpretation, deterministic policy and calculation, recommendation, authorised decision and execution. A recommendation cannot grant authority or change a system.
- First-proof decisions are simulations. No live integrations, purchases, hiring, system changes or policy exceptions follow from them.
- Keep the current task as the steering point. Use bounded work with clear ownership; create additional tasks or delegate only when authorised. Do not start recurring monitoring without a request.
- Preserve a reviewable change. Do not infer permission to publish, merge, deploy, contact others or change repository visibility from permission to work locally.

## Data and evaluation

- Commit only rights-cleared code, concise non-sensitive documentation, and synthetic or appropriately licensed public fixtures. Never copy credentials, customer evidence, private notes or unapproved proprietary code into this public repository.
- Give evidence a subject, scope, period, provenance and freshness. Preserve missing, stale, partial and conflicting evidence as unresolved.
- Label synthetic examples, assumptions, model interpretations and demonstrated results separately. Finding counts, model agreement and valid output structures do not prove risk reduction or decision quality.
- Keep hidden evaluation cases and answer keys outside the public development checkout. Public examples are development material.
- Record who authored and reviewed an expected judgment. Assistant-written expectations are candidates until qualified through the evaluation process.

## Working style

Prefer the smallest complete decision loop. Avoid broad integrations, multiple services, generic frameworks and a large imported note corpus before the first proof is useful.

Explain code and CLI work at a junior Python developer level when helpful. State what an important command reads or changes, explain unfamiliar terms in context, and connect implementation decisions to the security outcome.

Verify the actual changed behaviour with appropriate checks. For documentation, check the content and links. Report implementation, test results, deployment, user acceptance and commercial evidence separately.
