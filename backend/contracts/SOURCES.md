# Provider API contracts

The connectors read provider APIs in their documented shapes. This folder pins each provider's machine-readable spec by SHA-256, and [`test/contracts/contracts.test.ts`](../test/contracts/contracts.test.ts) holds the connectors to those specs. It replays each connector on its fixture and records every request and every response field the connector touches. A field the connector looks for and does not find counts as read. Each request and field is then looked up in the pinned spec. An undocumented endpoint, an undeclared query parameter or a field the spec does not define fails the test.

## Sources

| Provider | Spec | Version | Fetched | Licence | Stored | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| Okta | [Management API, minimal](https://raw.githubusercontent.com/okta/okta-management-openapi-spec/2bc3a3631fef54cab7aaa97fbaf053f2069cb311/dist/current/management-minimal.yaml) | 2026.41.0 | 2026-10-15 | none stated | cache | `06eb4638aba4155b0369738294ac94c86b590c93f39b1acf613f9a2f36c1c555` |
| Google Workspace | [Admin SDK Directory API discovery](https://www.googleapis.com/discovery/v1/apis/admin/directory_v1/rest) | revision 20261012 | 2026-10-15 | none stated | cache | `9f73909c44f74d5b9368f4568b44d4aa8dfdaab450a62bee5dc0e60a8f896299` (subset) |
| Jira | [Cloud platform REST API v3](https://developer.atlassian.com/cloud/jira/platform/swagger-v3.v3.json) | 1001.0.0-SNAPSHOT-fe911bb6c977 | 2026-10-15 | none stated | cache | `de2695b19a5fdad7d1f85db7e980412e41ce04b430b43cf3d567ff403af63e6e` (subset) |
| Linear | [GraphQL schema](https://raw.githubusercontent.com/linear/linear/379cb14683fd17e580ac1cf7e39e61a245a21a1f/packages/sdk/src/schema.graphql) | linear/linear@379cb14683fd | 2026-10-15 | MIT ([LICENSE](linear/LICENSE)) | committed | `af517c1aedd710d53116b85e32e33b6f0f532fa3c44ac1b2888e094615584be6` |
| Slack | [Web API OpenAPI v2](https://raw.githubusercontent.com/slackapi/slack-api-specs/bc08db49625630e3585bf2f1322128ea04f2a7f3/web-api/slack_web_openapi_v2.json) | 1.7.0, last updated 2021-09-07 | 2026-10-15 | MIT | cache | `742a5c977180a829df8767cf57bc417d99b3713583aee83741efb9c08ca731e7` |
| Vanta | prose documentation only | | | | not covered | |
| Drata | prose documentation only | | | | not covered | |

Linear's schema is committed under its MIT licence. Slack's spec is also MIT, but its examples carry token-shaped strings that GitHub's secret scanning blocks, so it is cached like the specs that state no licence. The rest are fetched into the git-ignored `.cache/` by `bun scripts/contracts.ts`, which checks each one against its pinned hash. Without the cache the contract test fails; it does not skip.

## How each spec is pinned

- **Versioned releases are pinned whole, by their bytes:** Okta (a numbered release at a commit), Linear (a commit) and Slack (a commit, frozen since 2021). Any change to the document fails the build.
- **Often-revised documents are pinned by the subset the connectors use:** Google's discovery document and Jira's platform spec, whose version is a snapshot build. The subset is the methods or paths the connectors request, with their parameters and scopes, and every schema those reach, plus the schemas the contract test checks by name. It is hashed as canonical JSON, with keys and plain-value lists sorted. A change elsewhere in the document passes, so does a new revision with the same subset, or the same content served in another order. A change to anything Crowbo reads fails.
- **Records beside a subset pin:** the document's own revision when it was pinned, and a short hash per part (`parts` in [`sources.json`](sources.json)). A failure names the parts that changed and the revision now served.

Google served two different documents under the same revision on 15 October. A GitHub runner got one, this machine the other. A whole-document pin cannot hold for Google.

When a pin fails, the script keeps the new copy as `<file>.new` and stops. To re-pin:

1. Review the change. For a subset pin, look at the parts named in the message.
2. Update the connectors and fixtures if needed.
3. Run `bun scripts/contracts.ts --repin <provider>`.
4. Read the diff of `sources.json` before committing.

## What the specs corrected

- **Jira issue search names its fields.** The enhanced search (`/rest/api/3/search/jql`) returns only issue ids unless `fields=` lists them. The connector now asks for `labels,status,resolution,assignee,fixVersions`, and the test checks that every field it reads is one it asked for. Each field's inner shape is checked against the schema the spec documents for it (`StatusDetails`, `UserDetails`, `Resolution`, `Version`).
- **Jira issue search states no total.** Its response has `isLast` and `nextPageToken` and no `total`, so the connector no longer reads one. A list is complete only when a page says `isLast`.

## Deliberate reads outside a spec

- **Okta `group.profile.app` and `app.profile.businessOwner`** are custom profile properties. Okta lets a company extend group and app profiles, and the connector relies on the company adding these two. A company that has not added them leaves the app's administering group and owner missing, never guessed.
- **Okta's `Link` header** for paging is documented in Okta's prose, not in the spec. The spec's `after` and `limit` parameters are checked.

## Scope candidates from the specs

The test checks that each endpoint the connectors read accepts at least one of these scopes:

| Provider | Scopes |
| --- | --- |
| Okta | `okta.users.read`, `okta.groups.read`, `okta.apps.read` |
| Google Workspace | `admin.directory.user.readonly`, `admin.directory.group.readonly` |
| Jira | `read:jira-work` |
| Slack (demo connector) | `channels:history` |

## Open

- **The Slack spec was last updated in 2021.** Slack no longer maintains it, so it confirms method names and old response shapes only.
- **The demo Slack connector reads channel history,** which needs `channels:history`. The Slack scope manifest in the connections PR asks for `im:history` and not `channels:history`. Decide which the product needs before the dress rehearsal.
- **The Linear connector requests named stand-ins** (`/graphql?query=projects`). The test checks every field it reads against the schema. The GraphQL documents themselves arrive with the dress-rehearsal kit.
- **Jira project search is paged** (`isLast`, `nextPage`), and the connector reads only its first page. A company with more than one page of projects would have later projects' launches unread, and nothing would say so.
- **The identity probe in the connections PR** (Linear `organization.urlKey`, Google `users[].primaryEmail`, the Atlassian accessible-resources list) joins this test once that PR is merged. `Organization.urlKey` is in the pinned schema.
