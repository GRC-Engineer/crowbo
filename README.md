# crowbo

Security decision infrastructure. Crowbo brings permitted evidence, business context and policy into reasoned recommendations for people and agents.

## Start here

- [Foundation](docs/FOUNDATION.md) owns the product direction and initial workflows.
- [Backend brief](docs/TECHNICAL-PLAN.md), [data contract](docs/DECISION-DATA-MODEL.md) and [permissions](docs/PERMISSIONS.md) describe the connected Python implementation.
- [Interaction model](docs/INTERACTION-MODEL.md) and [Decision Studio](design/decision-studio/README.md) describe the product experience and synthetic frontend demo.
- [Evaluation contract](docs/EVALUATION.md) and [measurement plan](docs/MEASUREMENT-PLAN.md) separate engineering checks from judgment quality.
- [Brand guide](design/BRAND.md) owns the visual identity. [Contributor instructions](AGENTS.md) govern repository work.

## What is available

The public website includes a company landing page and a synthetic frontend demo; the backend is a separate deliverable:

- **Website and frontend:** [crowbo.ai](https://crowbo.ai) opens the approved two-paragraph company page with Modular Crow and the feather network. [The demo](https://crowbo.ai/demo/) opens the question-first Decision Studio; `/demo/?view=workspace` opens its full workspace. Both are built from [design/decision-studio](design/decision-studio/README.md) into `site/`. The demo uses synthetic data, is not connected to the backend, does not call a model and does not change a security system. No sign-in exists yet; both pages are public. Earlier prototypes remain under `design/` as history.
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

`npm run build` regenerates `site/` at the repository root. Commit the regenerated `site/` together with the source change. The root URL opens the company landing page. `/demo/` and `/demo/?view=ask` open the question-first experience; `/demo/?view=workspace` opens the full workspace. The same entry rules apply locally and on crowbo.ai.

Credentials, authorised source inputs and runtime outputs stay outside Git. Follow [the pilot guide](docs/PILOT.md#running-it) before connecting any provider. The synthetic tests need no provider credentials.

## Review backend changes

Run `uv run --locked ruff check src tests proof/mcp_scenarios.py` and `uv run --locked ruff format --check src tests proof/mcp_scenarios.py` alongside the tests. Follow the [GitHub checkpoint workflow](AGENTS.md#github-checkpoints) to commit, push and review each bounded change.

## Website deployment

Only `site/` is published, and it is generated: `npm run build` in `design/decision-studio` builds the landing page and Decision Studio together there and removes stale files, so do not edit `site/` by hand. [wrangler.jsonc](wrangler.jsonc) configures static assets on Cloudflare Workers with crowbo.ai as a custom domain. The Studio's [public/](design/decision-studio/public) folder supplies the response security headers in `_headers`, the 404 page and the font and provider-mark licence texts, which Vite copies into `site/` unchanged. No Worker code runs and the backend is not exposed through the website.

Preview the website with `npx wrangler dev`. The deployment command is `npx wrangler deploy`. Git-triggered builds and their production branch are configured in Cloudflare; a live website alone does not establish that automatic deployment is connected.

This repository is public. Commit only first-party or rights-cleared code and assets, non-sensitive documentation, and synthetic or appropriately licensed public examples. Customer evidence, employer materials, private strategy and meeting notes, credentials and runtime exports do not belong here.
