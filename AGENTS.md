# Working in Crowbo

Read [the foundation](docs/FOUNDATION.md) and [the evaluation contract](docs/EVALUATION.md) before proposing or implementing a change. Current user instructions take precedence. Keep each decision in its owning document and link to it rather than maintaining parallel roadmaps.

## Baseline method: PStack

Every Crowbo workstream (backend, frontend, design, deck and strategy) uses the PStack skills as its default working method. They are installed locally under `.claude/skills/` with the `pstack-` prefix, and are not committed. Use the skill for the phase you are in. Skip a skill only when its own description says it does not apply, and say so.

| Phase | Skills |
| --- | --- |
| Frame | `pstack-figure-it-out` for multi-step or ambitious work. `pstack-how` and `pstack-why` to ground in the existing system. `pstack-recall` when resuming. `pstack-principle-attack-the-premise`. |
| Design | `pstack-architect` (with `pstack-arena`) before non-trivial code. `pstack-interrogate` for multi-model adversarial review of a design or diff. `pstack-principle-model-the-domain`, `-exhaust-the-design-space`, `-redesign-from-first-principles`, `-subtract-before-you-add`. |
| Build | `pstack-tdd` for regressions and cheap test targets. `pstack-typescript-best-practices` on every `.ts` file. `pstack-principle-sequence-verifiable-units`, `-boundary-discipline`, `-type-system-discipline`, `-make-operations-idempotent`, `-fix-root-causes`. `pstack-swarm` only for independent parallel slices. |
| Verify | `pstack-principle-prove-it-works` and `-test-behavior-not-implementation`. `pstack-blast-radius` before shipping. `pstack-thermo-nuclear-code-quality-review`, `pstack-deslop` and `pstack-no-comments` on the diff. `pstack-create-verification-skill` and `pstack-maintain-verification-skill` for driving the product as a user would. |
| Record | `pstack-show-me-your-work`: a decision log with one row per decision and its evidence, committed with the change when reviewers need it. |
| Ship | `pstack-make-pr-easy-to-review` with the repository's PR template. `pstack-babysit`, `pstack-fix-ci`, `pstack-get-pr-comments` and `pstack-fix-merge-conflicts` until the PR is mergeable. `pstack-blast-radius` and `code-review` on the final diff, then merge under the merge rule in GitHub checkpoints. |
| Write | `pstack-unslop` on all prose. `pstack-technical-writing` for docs. `pstack-teach` and `pstack-bro` to explain work plainly. |
| Learn | `pstack-reflect` after a substantial session. `pstack-what-did-i-get-done` for updates. `pstack-principle-encode-lessons-in-structure`: turn a repeated correction into a check. |

The rules in this file still apply on top of the skills. Where a skill and this file disagree, this file wins.

## Plan before code

Always write a plan before generating or modifying code. Note the security considerations the plan raises and address them in the change.

## Scope and authority

- Use Crowbo as the working home. Preserve historical projects and import only specific, inspected, rights-cleared material needed for the current task.
- Treat proposed providers and analytical frameworks as candidates. Choose them only after a concrete workload and comparison justify them.
- Separate interpretation, deterministic policy and calculation, recommendation, authorised decision and execution. A recommendation cannot grant authority or change a system.
- First-proof decisions are simulations. No live integrations, purchases, hiring, system changes or policy exceptions follow from them.
- Keep the current task as the steering point. Use bounded work with clear ownership; create additional tasks or delegate only when authorised. Do not start recurring monitoring without a request.
- Preserve a reviewable change. Do not infer permission to publish, deploy, contact others or change repository visibility from permission to work locally. Merging is governed by the merge rule in GitHub checkpoints.

## Data and evaluation

- Commit only rights-cleared code, concise non-sensitive documentation, and synthetic or appropriately licensed public fixtures. Never copy credentials, customer evidence, private notes or unapproved proprietary code into this public repository.
- Give evidence a subject, scope, period, provenance and freshness. Preserve missing, stale, partial and conflicting evidence as unresolved.
- Label synthetic examples, assumptions, model interpretations and demonstrated results separately. Finding counts, model agreement and valid output structures do not prove risk reduction or decision quality.
- Keep hidden evaluation cases and answer keys outside the public development checkout. Public examples are development material.
- Record who authored and reviewed an expected judgment. Assistant-written expectations are candidates until qualified through the evaluation process.

## Working style

Prefer the smallest complete decision loop. Avoid broad integrations, multiple services, generic frameworks and a large imported note corpus before the first proof is useful.

Explain code and CLI work at a junior TypeScript developer level when helpful. State what an important command reads or changes, explain unfamiliar terms in context, and connect implementation decisions to the security outcome.

Verify the actual changed behaviour with appropriate checks. For documentation, check the content and links. Report implementation, test results, deployment, user acceptance and commercial evidence separately.

## GitHub checkpoints

GitHub is the shared home for reviewable backend work. At the end of each bounded backend change, inspect the complete diff for scope and private material, run the relevant checks, commit on a named feature branch, push it and verify the remote commit. Open or update a pull request with the behaviour, validation and remaining limitations. Keep checkpoints small instead of accumulating unpublished code across sessions.

Merge rule, set by the founder on 15 October 2026 and revocable by him at any time: the agent may merge its own pull request into main without waiting for the founder, once the PR has passed the Ship-phase skills (`pstack-make-pr-easy-to-review`, `pstack-blast-radius`, `code-review` on the final diff), the local checks are green, the diff has been read in full for scope and private material, and stacked PRs are merged in dependency order. Record each merge in the steering thread's page of record. A merge is still not a deployment or production approval, and nothing in this rule permits publishing, deploying, changing repository visibility or contacting anyone. A pushed branch is not a merge, deployment or production approval. Preserve unrelated frontend work and never publish source evidence, credentials or private runtime files. If a checkpoint cannot be pushed, report the exact local state and blocker rather than imply GitHub contains it. This is a per-change workflow, not a scheduled monitor.
