# Dress rehearsal

The dress rehearsal runs Crowbo end to end against Crowbo's own sandbox accounts, filled with Northwind, the synthetic company, before any customer connects. It proves the parts a first pilot depends on: real API shapes, consent, the weekly list in Slack, and a brief a security lead would act on.

The kit has three parts:

- [`seed.ts`](../backend/scripts/rehearsal/seed.ts) fills each sandbox with Northwind.
- [`record.ts`](../backend/scripts/rehearsal/record.ts) records what the connectors read, scrubbed, for the P2 criterion.
- This runbook.

Nothing in the kit signs up for an account, contacts anyone or touches a real company. You make each signup, and the scripts refuse to write to anything that is not a sandbox (see [Safety](#safety)).

**What is not built yet.** The staging Worker does not yet read live through the connections. The engine has the hook (`fetchFor`), but nothing connects it to a tenant's connections. Until that follow-up lands:

- the recordings below are how the three connectors are proven;
- the "three connectors complete" check on staging waits.

The decision latency measurement waits for your go-ahead to deploy staging.

## The order

1. [Sign up](#1-sign-up) for the five sandboxes.
2. [Create seeding credentials](#2-seeding-credentials), on your machine only.
3. [Seed](#3-seed) each sandbox: dry run first, then apply.
4. [Record](#4-record) the connectors and commit the scrubbed recordings. P2 flips.
5. [Register the provider apps](#5-provider-apps) for the product's consent flows, with the manifest scopes.
6. [Set the staging secrets](#6-staging-secrets). These are Cloudflare changes: you run them.
7. [Connect each provider](#7-connect) through `/connect`.
8. Deploy staging, on your go. Then run [the checklist](#pass-checklist).

## 1. Sign up

| Sandbox | What to create | Notes |
| --- | --- | --- |
| Okta | A free Integrator or developer org: `dev-<n>.okta.com` | The scripts accept only `dev-` and `trial-` orgs |
| Google Workspace | Nothing new: use `crowbo.ai`, signed in as a super admin | Users are paid seats, so the seed adds only groups, with Northwind as external members. Allow external members on new groups in the Admin console (Groups for Business, sharing settings) |
| Linear | A free workspace with one team | Leads and assignees must be real members, so the seed leaves them unset |
| Jira | A free Jira Cloud site `<site>.atlassian.net`, with a company-managed project, key `NW` | The seed creates versions and issues, not the project |
| Slack | A free workspace for Crowbo, with a channel such as `#grc-rehearsal` | Create the Crowbo rehearsal app (step 2) and invite it to the channel; invite the staging Crowbo app after step 5 |

## 2. Seeding credentials

These stay in your shell. Read each secret with `read -s` so it is not echoed or kept in history, and never write it to a file in the repository. The same credentials serve the recorder.

```bash
read -s OKTA_TOKEN && export OKTA_TOKEN
```

| Provider | Variables | Where it comes from | Access it needs |
| --- | --- | --- | --- |
| All | `SANDBOX_DOMAINS` | Your sandbox email domains, comma-separated, such as `crowbo.ai` | |
| All | `SANDBOX_ACCOUNTS` | Each provider's sandbox account by name: `okta=dev-<n>.okta.com,google-workspace=crowbo.ai,linear=<workspace url key>,jira=<site>.atlassian.net,slack=<workspace>` | A provider with no entry is refused |
| All | `REHEARSAL_SALT_FILE`, optional | Where the pseudonym salt lives. Default `~/.config/crowbo/rehearsal.salt`, created on the first recording; it must be outside the repository | Keep it: a new salt gives every account a new pseudonym |
| Okta | `OKTA_ORG`, `OKTA_TOKEN` | Admin Console, Security, API, Tokens | A super admin's token: seeding creates users, groups, apps and a group profile property |
| Google | `GOOGLE_TOKEN` | An OAuth access token for your admin account, such as from the OAuth 2.0 Playground | `admin.directory.group` to seed; `admin.directory.user.readonly` and `admin.directory.group.readonly` to record |
| Linear | `LINEAR_API_KEY`, optional `LINEAR_TEAM_KEY` | Settings, Security and access, Personal API keys | Create and read |
| Jira | `JIRA_SITE`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, optional `JIRA_PROJECT` (default `NW`) | id.atlassian.com, Security, API tokens | Project admin on `NW` |
| Slack | `SLACK_BOT_TOKEN`, `SLACK_CHANNEL` (channel id) | The bot token of a separate **Crowbo rehearsal** app in the sandbox workspace, with `chat:write` and `channels:history` only | Seeds and records the channel. The staging Crowbo app keeps exactly the manifest's scopes (step 5) |

Revoke these tokens after the rehearsal. The product never uses them: it connects through OAuth ([CONNECTIONS.md](CONNECTIONS.md)).

## 3. Seed

Run from `backend/`. Without `--apply` the script sends nothing and needs no credentials: it prints what seeding an empty sandbox would create in its first round.

```bash
bun scripts/rehearsal/seed.ts okta
```

```bash
CROWBO_SANDBOX=yes bun scripts/rehearsal/seed.ts okta --apply
```

Repeat for `google-workspace`, `linear`, `jira` and `slack`.

- **Round by round.** With `--apply`, it checks the account against `SANDBOX_ACCOUNTS`, reads the sandbox, applies what is missing, and reads it again, up to three rounds. A write made once in a run is never repeated in that run, even if the provider's search has not caught up. Memberships and issues follow once their groups and projects exist.
- **Reruns.** A rerun reports `nothing to seed`.
- **Markers.** Seeded objects carry `crowbo-seed` (a description, a title prefix or a label), so you can find them to remove them later.

What it creates (from [`roster.ts`](../backend/scripts/rehearsal/roster.ts)):

| Provider | Seeded |
| --- | --- |
| Okta | Ten people, created without activation, so no email is sent and nobody can sign in. `u41` is deprovisioned. Groups `billing-admins` (five members) and `workspace-super-admins` (`alex`, `u02`), each with the custom profile property `app`. Bookmark apps `billing` (owner `priya`) and `google-workspace` (owner `dana`), with a `businessOwner` profile property |
| Google | The same two groups on your domain, with the Northwind people as external members |
| Linear | Projects `SOC 2 audit prep` and `Checkout v2`, with the labelled issues the tickets connector reads |
| Jira | Unreleased versions `audit-prep` and `checkout-v2` in `NW`, with the same issues and labels |
| Slack | Two messages in the rehearsal channel. The second is a prompt-injection probe: Crowbo must treat it as data. Use a channel for the rehearsal alone: the seed checks the latest 200 messages for what it already posted |

## 4. Record

```bash
bun scripts/rehearsal/record.ts okta
```

The script first checks that the credentials are the account `SANDBOX_ACCOUNTS` names, then runs the connector against it.

- **Cut down.** It keeps only the fields the connector read, so links, avatars, phone numbers and descriptions never reach the file.
- **By schema.** [`schema.ts`](../backend/scripts/rehearsal/schema.ts) lists every field each connector reads and every path it requests, with the class of each value. Ids and cursors are always replaced. A name stays only if it is in Northwind's roster, and a status only if it is on the provider's word list. A field, key, path or query parameter not in the schema is refused, not kept.
- **Stable pseudonyms.** Replaced values become `id-<hash>`, `cursor-<hash>`, `person-<hash>@northwind.example` or `value-<hash>`. The hash is a keyed HMAC under your salt file, so an account has the same pseudonym in every recording.

It writes `test/fixtures/recorded/okta.json` only if all three of these hold:

- every email it read is at `SANDBOX_DOMAINS` or `northwind.example`;
- the result passes the schema check (`findLeaks`);
- the replay gives exactly the live records, renamed as scrubbed.

It prints counts and paths, never content.

Record at least three connector classes: `okta` or `google-workspace` (identity), `linear` or `jira` (tickets), and `slack`. Then:

1. Read each recording before committing it. `test/rehearsal/scrub.test.ts` checks every committed recording again in CI.
2. Run `bunx vitest run test/acceptance`. P2 now reports "Expect test to fail": the three connectors' recordings reach the engine's weekly list. Change its `it.fails` to `it` in the same commit.

## 5. Provider apps

These are the apps the product's own consent flows use. Each asks for exactly the scopes in [`manifests.ts`](../backend/src/connections/manifests.ts). The redirect URI for each is `<CONNECT_REDIRECT_BASE>/connect/<provider>/callback`.

| Provider | App | Scopes |
| --- | --- | --- |
| Okta | API Services app with public-key client authentication. Grant the scopes, then register the public key that `POST /connect/okta/setup` returns | `okta.users.read`, `okta.groups.read`, `okta.apps.read` |
| Google | OAuth client, Web application, internal to `crowbo.ai` | `https://www.googleapis.com/auth/admin.directory.user.readonly`, `https://www.googleapis.com/auth/admin.directory.group.readonly` |
| Linear | OAuth application | `read` |
| Jira | OAuth 2.0 (3LO) app in the developer console | `read:jira-work`, `read:jira-user`, `offline_access` |
| Slack | The app from [SLACK.md](SLACK.md#set-it-up-on-staging) | `app_mentions:read`, `chat:write` (the one write scope), `im:history`, `files:read`. Nothing more: seeding and recording use the separate rehearsal app from step 2 |

## 6. Staging secrets

Every command here changes the staging Worker in your Cloudflare account, so you run them. Each prompts for its value.

| Secret | Value |
| --- | --- |
| `CONNECTIONS_KEK` | `{"current": "k1", "keys": {"k1": "<openssl rand -base64 32>"}}` |
| `CONNECT_CLIENTS` | `{"google-workspace": {"id": "…", "secret": "…"}, "linear": {…}, "jira": {…}, "slack": {…}}` from step 5 |
| `CONNECT_TENANT_IDENTITIES` | The rehearsal tenant's identities, such as `{"<tenant>": ["google:crowbo.ai", "linear:<urlKey>", "jira:<site>.atlassian.net", "slack:<team id>"]}`. A consent starts only for a provider listed here |
| `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_WORKSPACES` | As in [SLACK.md](SLACK.md#set-it-up-on-staging) |

`CONNECT_REDIRECT_BASE` is a plain variable: the staging Worker's origin.

```bash
bunx wrangler secret put CONNECTIONS_KEK --env staging
```

[CONNECTIONS.md](CONNECTIONS.md) keeps the key-encryption key and client keys in the Secrets Store. For the rehearsal, Worker secrets on staging are enough, and `env.ts` reads either. Moving them into a Secrets Store binding comes with the live-read follow-up.

The operator who connects needs the `ingestor` role. Key rotation needs `key_admin`.

## 7. Connect

For each provider: `POST /connect/<provider>/start`, open the `authorize_url` and approve as the sandbox admin, then check `GET /connect/status`.

- **Okta:** `POST /connect/okta/setup` with `{host, client_id}`, then register the returned public key on the service app.
- **Status:** shows each connection as `active`, and no secrets.

## Pass checklist

The rehearsal passes when every line holds on staging. Record each result with its evidence in the steering thread.

| Check | How to see it | Today |
| --- | --- | --- |
| A company profile from a real export within a day | Import an export of Crowbo's own knowledge base, not a customer's (`import_knowledge_base`). The profile lists systems, owners and stale records in one run | Ready. PDFs that use object streams wait on the PDF parser choice |
| Three connectors complete | The weekly brief has no "Sources not read" section. Each connector's records state a total equal to what was read | Proven from recordings (P2). On staging, waits for the live-read follow-up |
| The weekly post in Slack on schedule | The Monday 08:00 UTC run posts the list to the rehearsal channel | Ready once Slack is set up and staging is deployed |
| A call recorded from a thread changes the next list | Reply to the weekly post with a call (an allowed recorder). The next list changes and cites the thread | Ready (P4.1 on fixtures) |
| The brief reads as a CISO would read it | You read the weekly brief and write down whether you would act on it, and what is missing | Your judgement; it is not self-graded |

## Safety

- **Named accounts.** Before anything is read or written, each token must belong to the account `SANDBOX_ACCOUNTS` names for its provider. That means the Okta org and the Jira site by host, Google by the domain of its own users, Linear by the workspace's key, and Slack by its workspace. A provider with no entry is refused.
- **Sandbox domains.** Both scripts refuse any workspace whose people are not all at `SANDBOX_DOMAINS` or `northwind.example`.
- **Dry run.** Without `--apply`, seeding sends nothing and needs no credentials.
- **Explicit confirmation.** Seeding writes only with `--apply` and `CROWBO_SANDBOX=yes`.
- **Recordings.** A recording keeps only the fields the connector read, each value only as the schema allows. Anything outside the schema is refused, not kept. Credentials and the salt are never written to the repository.

## Open

- **Slack scopes.** The demo Slack connector reads channel history, which needs `channels:history`. The Slack manifest asks for `im:history` and not `channels:history`. Decide whether the product reads a channel. Until then, only the separate rehearsal app carries `channels:history`.
- **Okta profile properties.** Okta's `profile.app` on groups and `businessOwner` on apps are custom properties ([SOURCES.md](../backend/contracts/SOURCES.md)). A customer org must add them, or those facts stay missing.
- **First page only.** Jira project search and Linear's project list read only their first page.
