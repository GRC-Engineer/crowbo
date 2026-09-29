# crowbo

Security decision infrastructure. Crowbo aims to turn evidence, business context and policy into reasoned, traceable recommendations for people and agents.

The name combines the English crow with a nod to the French corbeau. It is pronounced CROW-bo; the proposed wordmark is lowercase.

## Start here

- [Foundation](docs/FOUNDATION.md) owns the product direction, decisions, first proof and immediate work.
- [Evaluation contract](docs/EVALUATION.md) owns how that proof will be assessed and where human judgment is still required.
- [Contributor instructions](AGENTS.md) govern work in this repository.

The first selected proof is **buy another vulnerability tool or improve remediation capacity**. It will follow one decision through evidence review, alternatives, explicit checks, recommendation, a simulated decision and reassessment after a material fact changes.

## Website

`site/` holds the public crowbo.ai page: the terminal Command Room prototype from `design/`, its mascot, the two fonts it uses and their licences. Only that folder is published. `wrangler.jsonc` configures it as static assets on Cloudflare Workers with `crowbo.ai` as a custom domain, and `site/_headers` sets the security headers.

Preview locally with `npx wrangler dev` (serves on 127.0.0.1). Publishing becomes automatic once the repository is connected in the Cloudflare dashboard (Workers & Pages → Create → Import a repository; no build command; deploy command `npx wrangler deploy`). Merges to `main` then deploy to crowbo.ai and other branches get preview URLs.

## Frontend previews

[Decision Studio](design/decision-studio/README.md) contains the React question-to-decision demo and its assistant preview. [The design index](design/README.md) links the newer homepage, brand board, mascot and feather studies, and earlier prototypes.

To run the product preview from the repository root:

```sh
cd design/decision-studio
npm ci
npm run build
cd ../..
python3 -m http.server 8799 --bind 127.0.0.1 --directory design
```

Open <http://127.0.0.1:8799/decision-studio/dist/?view=ask>. Prepared examples are synthetic and keep all state in the current tab. The assistant view illustrates the interaction; it does not connect to Claude, Codex or a live Crowbo service. The build output and dependencies are excluded from Git; the lockfile, source, tests, local artwork and licences are included. These previews do not replace the deployed `site/` folder.

## Current state

This repository contains foundation documents, the static company site, and local frontend design studies. Decision Studio is an executable synthetic preview; it has no live backend connection. No completed decision-quality evaluation or validated customer outcome is claimed.

Crowbo is a new software project. Earlier research and prototypes are historical inputs that may be consulted for specific questions; they do not define this repository's scope or roadmap.

This is a public repository. Examples must be synthetic or drawn from public sources with suitable rights. Customer evidence, employer materials, private meeting notes and credentials do not belong here.
