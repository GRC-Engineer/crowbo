# Connections

A connection is one company's consented, read-only credential for one provider, held in that company's tenant and revocable by the company's own administrator ([ADR 0003](adr/0003-connectors-authenticate-by-consented-oauth-app.md)). The code is in [`backend/src/connections/`](../backend/src/connections/).

## How a connection is made

| Provider | How | What the admin does |
| --- | --- | --- |
| Google Workspace | OAuth, admin consent, PKCE | Approves the read-only Directory scopes on Google's consent screen |
| Linear | OAuth, PKCE | Approves `read` |
| Jira Cloud | OAuth 2.0 three-legged, rotating refresh tokens | Approves the read scopes; may need to consent again if the app is reinstalled |
| Slack | The app install | Installs the Crowbo app |
| Okta | Service app, private-key JWT | Creates a service app, registers the public key Crowbo shows, grants the read scopes, and gives Crowbo the client id |
| Vanta | Client credentials, pasted (an exception) | Creates a read-only app in Vanta and pastes its client id and secret |
| Drata | API key, pasted (the ADR's exception) | Pastes a read-only API key |

Each provider's scopes, and the scenarios that read them, are in [`manifests.ts`](../backend/src/connections/manifests.ts). The consent screen is built from that file, and a test checks that they match. No connection uses Google domain-wide delegation.

The routes, for an operator with the `ingestor` role:

- `POST /connect/<provider>/start` returns the provider's authorize URL. The admin opens it, approves, and the provider redirects to `/connect/<provider>/callback`. The state in that URL is signed by Crowbo, so an altered or forged one is refused before any tenant is reached.
- `POST /connect/<provider>/confirm`: see "Who consented" below.
- `POST /connect/okta/setup` with `{host, client_id}` returns the public key to register on the Okta service app.
- `POST /connect/vanta/secret` or `/connect/drata/secret` with `{client_id?, secret}` stores a pasted secret.
- `GET /connect/status` lists connections and what the brief will report: revoked, unused for 14 days, or a pasted secret past its rotation date.
- `POST /connect/rekey`, for the `key_admin` role only, moves this tenant's secrets to the current key.

They are off (404) until `CONNECTIONS_KEK` and `CONNECT_REDIRECT_BASE` are set.

## Who consented

A link to a consent screen can be sent to anyone, so Crowbo checks which company actually consented. After the code exchange it asks the provider:

| Provider | Identity |
| --- | --- |
| Google Workspace | `google:<primary domain>` |
| Linear | `linear:<workspace>` |
| Jira | `jira:<site host>` |
| Slack | `slack:<team id>` |

- **Registered identities.** `CONNECT_TENANT_IDENTITIES` lists each tenant's identities. A consent from any other identity is refused, and nothing is kept.
- **No identity registered for the provider.** `/connect/<provider>/start` refuses to start a consent. Register the tenant's identity first.
- **Pending.** If a tenant's identities are removed between start and callback, the connection is kept pending and is not used. The operator who started the flow, and only they, confirms it after seeing which identity it landed on.

The confirm step alone does not stop a misbinding. The operator who confirms may be the person who forwarded the link, so a consent could land on another company's workspace and still be confirmed. Only a registered identity prevents that. Every production tenant registers its identities before any consent starts, and the start route enforces it.

Slack's `chat:write` is the one deliberate write scope: it posts Crowbo's own replies and the weekly list, and nothing else.

## Where the secrets are

- **Tokens, keys and pasted secrets** are stored in the tenant's own Durable Object. Each is encrypted with AES-GCM under a key derived (HKDF) for that tenant from the key-encryption key, with the tenant, provider and kind bound into the ciphertext. One tenant's key cannot open another's material.
- **The key-encryption key and each provider app's client keys** are company-level, read-only in the Secrets Store: `CONNECTIONS_KEK` and `CONNECT_CLIENTS`. No Worker holds an account-level Cloudflare token.
- **A rotated refresh token** is committed with its access token in one transaction before the access token is used. If the write fails, the read fails; the old refresh token is never retried.

## When a connection stops working

Only one token request per provider runs at a time, and every update re-reads the connection inside its write, so a revocation is never undone by a request that started before it. A token that arrives after the connection was revoked is not stored. A 401 or 403, or a refused refresh, marks the connection revoked. The read that hit it is partial, every scenario that depends on it is unresolved, and the weekly brief names the source and the date it was last read. Reconnecting is the same flow as connecting.

## Rotating the key-encryption key

The owner is Ayoub until a second founder or engineer is named.

1. Generate 32 random bytes: `openssl rand -base64 32`.
2. Add it to `CONNECTIONS_KEK` under a new key id and make it current, keeping the old one: `{"current": "k2", "keys": {"k1": "<old>", "k2": "<new>"}}`. Material under `k1` keeps working.
3. For each tenant, call `POST /connect/rekey`. It moves every secret to `k2` and reports how many moved. It is safe while reads run. A token request in flight finishes first. A secret is replaced only if it is still the one that was read, so a refresh that commits during the rekey keeps its new token.
4. When every tenant reports `moved: 0`, remove `k1` from the keyring.

Okta service app keys rotate separately: only a super admin of the customer's Okta can register a new public key once scopes are granted. Run `POST /connect/okta/setup` again, and the admin replaces the key on their service app.
