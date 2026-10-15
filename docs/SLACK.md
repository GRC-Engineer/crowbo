# Crowbo in Slack

Crowbo answers in Slack where no AI assistant is deployed. Three things happen there:

- A mention in a thread gets the decision card in that thread.
- "brief" in a mention returns this week's list.
- The weekly list goes to one channel every Monday at 08:00 UTC.

A direct message carrying an export runs the knowledge-base import, but only in a workspace registered as synthetic.

A person records a call in the thread, in a fixed form that no model reads:

```text
@crowbo record override move-unused-to-operator because 4 of the 31 are break-glass accounts
assert group:billing-admins break_glass_exempt 4
```

The call is kept in decision memory with the thread's permalink, which Crowbo asks Slack for. (Unverified: whether `chat.getPermalink` needs a scope beyond those in the manifest below. Check it against a live app before the surface goes live.) The next answer cites it with the link. Only the predicates the engine lets a person assert are accepted; anything else is refused and nothing is kept.

Only the people the workspace registers as recorders can record. Users from another organisation in a shared channel are not answered at all. A permalink is accepted only in the form `https://<workspace>.slack.com/archives/<channel>/p<16 digits>`, so Enterprise Grid links (`*.enterprise.slack.com`) are refused for now. Provenance comes only through this surface: the MCP tools have no field for it.

The surface is staging only and runs on the demo company. It answers only the person who asked, and it never posts anywhere else or sends on anyone's behalf. The code is in [`surfaces/slack.ts`](../backend/src/surfaces/slack.ts), [`surfaces/slack-events.ts`](../backend/src/surfaces/slack-events.ts) and [`app/slack.ts`](../backend/src/app/slack.ts).

## How a request is checked

Every request is checked in this order before anything acts on it:

1. **Size.** The body is read only up to 64 KB.
2. **Signature.** Slack's signature is checked over the raw bytes, and the timestamp must be within five minutes. Anything that fails gets a 401, and nothing is read.
3. **Content.** Only then is the JSON parsed. Slack's retries and messages from bots are acknowledged and ignored.

The text of a mention is only ever a question. It is routed to a topic, never executed, and escaped in the reply, so it cannot become a link, a mention or a broadcast.

The Worker reaches Slack only at two hosts: `slack.com`, to post, and `files.slack.com`, to read an export's text files.

## Set it up on staging

Setting up Slack changes two things outside this repository: a Slack app in your workspace, and three secrets on the staging Worker. Do these yourself.

1. **Create the app.** In Slack, choose *Create New App*, then *From a manifest*, and paste:

   ```yaml
   display_information:
     name: Crowbo
     description: Security decisions with their evidence. Recommendations only.
   features:
     bot_user:
       display_name: crowbo
       always_online: false
   oauth_config:
     scopes:
       bot:
         - app_mentions:read
         - chat:write
         - im:history
         - files:read
   settings:
     event_subscriptions:
       request_url: https://<your-staging-worker>.workers.dev/slack/events
       bot_events:
         - app_mention
         - message.im
     org_deploy_enabled: false
     socket_mode_enabled: false
   ```

2. **Install it** to the workspace, and invite `@crowbo` to the channel that should get the weekly list.

3. **Set the three secrets** on staging. Each command prompts for the value, so it never appears in your shell history:

   ```bash
   bunx wrangler secret put SLACK_SIGNING_SECRET --env staging
   ```

   ```bash
   bunx wrangler secret put SLACK_BOT_TOKEN --env staging
   ```

   ```bash
   bunx wrangler secret put SLACK_WORKSPACES --env staging
   ```

   `SLACK_WORKSPACES` registers each workspace: its team ID, the engine copy that answers it, the weekly channel, whether its exports are synthetic, and who may record calls.

   ```json
   { "T0XXXXXXXX": { "tenant": "demo", "reader": "slack-workspace", "channel": "C0XXXXXXXX", "synthetic": true, "recorders": ["U0XXXXXXXX"] } }
   ```

4. **Deploy staging.** This also adds the Monday cron trigger.

Until all three secrets are set, `/slack/events` returns 404. On production it always does.

## Known limits

- **Imports in a shared workspace.** Any member of a workspace registered as synthetic can import an export by direct message into that workspace's one engine copy. That is fine for fixtures. Before any real workspace, imports need a per-tenant rule for who may import.
- **"brief" goes through the reply path.** "brief" in a mention is answered in the thread like any question; only the scheduled post goes to the channel itself.
