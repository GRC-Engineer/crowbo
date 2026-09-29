# crowbo

Security decision infrastructure. Crowbo brings permitted evidence, business context and policy into reasoned recommendations for people and agents.

## Start here

- [Foundation](docs/FOUNDATION.md) owns the product direction and initial workflows.
- [Backend brief](docs/TECHNICAL-PLAN.md), [data contract](docs/DECISION-DATA-MODEL.md) and [permissions](docs/PERMISSIONS.md) describe the connected Python implementation.
- [Interaction model](docs/INTERACTION-MODEL.md) and [Decision Studio](design/decision-studio/README.md) describe the product experience and synthetic frontend demo.
- [Evaluation contract](docs/EVALUATION.md) and [measurement plan](docs/MEASUREMENT-PLAN.md) separate engineering checks from judgment quality.
- [Brand guide](design/BRAND.md) owns the visual identity. [Contributor instructions](AGENTS.md) govern repository work.

## What is available

The public website, frontend demo and backend are separate deliverables:

- **Website:** [crowbo.ai](https://crowbo.ai) serves the Command Room design prototype with fictional decision examples. It does not call a model or change a security system.
- **Frontend:** Decision Studio includes a question flow, access-review conversation, assistant view, sources and versioned decisions. It uses synthetic data and is not connected to the backend. The newer company homepage and brand studies remain in `design/`.
- **Backend:** the Python CLI and local MCP interface import permitted source bundles, prepare Jev assessments, retrieve evidence with Turbopuffer and retain recommendations, feedback and reassessment. [The pilot guide](docs/PILOT.md) records its scope and observed checks. It is not a hosted multiuser service.
- **Earlier proof:** [the offline programme experiment](proof/README.md) preserves the synthetic control and investment decision loop and its historical results.

The initial workflow portfolio is remediation tracking, access reviews, and issues and exceptions management. Access is the most developed experiment; the other workflows still need their own cases and implementation. No comparative decision-quality advantage, customer acceptance or commercial result follows from the engineering tests.

## Run locally

Backend, using [uv](https://docs.astral.sh/uv/):

```sh
uv sync --locked
uv run --locked pytest -q
uv run --locked crowbo --help
```

Frontend:

```sh
cd design/decision-studio
npm ci
npm test
npm run build
npm run dev
```

Credentials, authorised source inputs and runtime outputs stay outside Git. Follow [the pilot guide](docs/PILOT.md#running-it) before connecting any provider. The synthetic tests need no provider credentials.

## Website deployment

Only `site/` is published. [wrangler.jsonc](wrangler.jsonc) configures static assets on Cloudflare Workers with crowbo.ai as a custom domain; [site/_headers](site/_headers) sets response security headers. The consolidation of frontend and backend code does not change those files or expose either application through the website.

Preview the website with `npx wrangler dev`. The deployment command is `npx wrangler deploy`. Git-triggered builds and their production branch are configured in Cloudflare; a live website alone does not establish that automatic deployment is connected.

This repository is public. Commit only first-party or rights-cleared code and assets, non-sensitive documentation, and synthetic or appropriately licensed public examples. Customer evidence, employer materials, private strategy and meeting notes, credentials and runtime exports do not belong here.
