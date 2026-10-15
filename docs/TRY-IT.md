# Try Crowbo in your own Claude

Crowbo is a decision engine for security teams. It reads the tools a team already uses, joins what they say, and works out the next move by risk removed, with the evidence for it. This page connects it to your Claude so you can ask it questions yourself.

You will be working on **demo data built on a case a future customer raised**: 40 people hold admin rights in a billing app, and 31 of them have not used those rights in 90 days. Nothing you connect or type reaches any real system, and Crowbo reads nothing of yours.

## Connect

You need the personal token we sent you. It gives you your own copy of the demo, so your choices are kept separately from everyone else's.

**Claude app or claude.ai:** go to **Settings → Connectors → Add custom connector**. Enter the address below, then sign in with your token when asked.

```text
https://crowbo-api-staging.grcengineeringpodcast.workers.dev/mcp
```

**Claude Code:** run this, replacing `$CROWBO_TOKEN` with your token.

```bash
claude mcp add --transport http crowbo https://crowbo-api-staging.grcengineeringpodcast.workers.dev/mcp --header "Authorization: Bearer $CROWBO_TOKEN"
```

## Three things to try

1. **Ask a question.** Try "Who should still have billing admin?" Crowbo answers with numbered sources, the move, who decides and who delivers by when, and the evidence it chose not to use. It also shows why that move ranks where it does.
2. **Change the answer by telling it something.** Try "Alex says 4 of the 31 are break-glass accounts and must keep admin. Record that." Then ask the first question again. The answer now says 27, and cites your call.
3. **Jump a week ahead.** Try "Advance the demo a week. What was done?" Crowbo reads the tools again and records what actually happened against the decision it made.

You can also ask "What if Slack counted for less?". That recomputes the answer on a copy and changes nothing.

## What it touches

- **Your data:** none. Crowbo reads only the demo company's sources.
- **What is kept:** your questions are not stored. Calls you record, outcomes and weight changes are kept in your own copy, in Cloudflare's EU region. We remove your copy when your access ends.
- **Sending:** nothing is sent anywhere. Follow-up messages are drafts only.
- **Ending access:** tell us, and we revoke your token. The connector stops working on the next request.
