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

## Current state

This repository contains the foundation documents. There is no executable prototype, completed evaluation, deployed service or validated customer outcome yet.

Crowbo is a new software project. Earlier research and prototypes are historical inputs that may be consulted for specific questions; they do not define this repository's scope or roadmap.

This is a public repository. Examples must be synthetic or drawn from public sources with suitable rights. Customer evidence, employer materials, private meeting notes and credentials do not belong here.
