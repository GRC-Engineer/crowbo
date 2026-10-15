# 3. Connectors authenticate as a consented OAuth app per customer, never with pasted keys where the vendor offers an alternative

Status: accepted, 15 October 2026. Decided by the founder in the strategy thread; applies to every read connector before any real customer token exists.

## Context

Crowbo reads a customer's tools (identity, tickets, the compliance platform, chat, HR) read-only and asks for the same access the incumbent platform already has. A security team deciding whether to let Crowbo in asks four things: which scopes, who can revoke, where the credential lives, and what happens when it is revoked. A pasted API key answers none of them well: it is long-lived, it is only as narrow as the vendor's key model allows, it lives wherever the customer pasted it from, and revoking it means finding it. Current practice in security review (October 2026) expects an app the customer's admin installs and consents to, with the scope list on the consent screen, revocable from the customer's own admin console and visible in their audit log; short-lived access tokens with rotating refresh tokens; keys rather than secrets for machine clients; and sender-constrained tokens where the vendor supports them ([RFC 9700 security best current practice](https://www.rfc-editor.org/rfc/rfc9700), [RFC 9449 DPoP](https://datatracker.ietf.org/doc/html/rfc9449)).

## Decision

- **One OAuth app per provider, installed and consented to by the customer's admin.** The consent screen carries the exact read scopes. A pasted key is accepted only where the vendor offers no OAuth for the read we need, and then it is stored in the Secrets Store, bound to the tenant, and rotated within the vendor's maximum lifetime.
- **A scope manifest per provider**, in the repository, naming each scope and the scenario that reads it. The manifest is the security review answer and the consent screen must match it. A scope no scenario reads is removed.
- **Machine clients authenticate with keys, not shared secrets.** Okta service apps use private-key JWT with only the public key registered at Okta; the same pattern wherever a provider offers it. Rotation is a runbook with a named owner, because for Okta only a super admin can rotate once scopes are granted.
- **Short-lived access tokens; rotating refresh tokens persisted atomically.** Atlassian's refresh tokens are single-use and rotate on every call: the rotated token is written to the Secrets Store before any other work continues, and a failed write is a hard error, never a retry with the old token. Where a provider supports sender-constrained tokens (DPoP or mutual TLS), use them; check per provider, do not assume.
- **No Google domain-wide delegation.** It allows impersonation of any user including super admins and narrowing scopes does not narrow who. Google Workspace is read through an admin-consented OAuth app with Directory read scopes.
- **Credentials are per tenant and live with the tenant.** Tokens are stored under the tenant's Durable Object in the EU jurisdiction, never in a store shared across customers. A revocation or a breach stays within one customer.
- **Revocation fails closed.** When a token is revoked or expires, the next scheduled read fails, the listing is recorded partial, and every scenario that depends on it goes unresolved, as the engine already does for a partial read. The brief says which source has not been read and since when. A credential unused by any scheduled read for a stated window is reported.
- **This is outbound authentication**: Crowbo reading the customer's tools. Inbound authentication, the customer's harness reading Crowbo over MCP, stays OAuth 2.1 with PKCE as in ADR 0001 and is a separate decision.

Per provider, as of this decision: Okta, OAuth for Okta service app with private-key JWT and read scopes. Google Workspace, OAuth app with admin consent and Directory read scopes. Linear, OAuth app with read scope. Jira Cloud, OAuth 2.0 three-legged with rotating refresh tokens, accepting that it is built for delegated users and may need re-consent. Vanta, OAuth client credentials. Drata, API key, the one exception, stored and bound as above. Slack, the app install, already OAuth by construction.

## Alternatives considered

- **API keys everywhere, for speed.** Rejected: it fails the four questions a security team asks, and it makes the onboarding promise ("we read what Vanta reads") false, since Vanta is itself installed by consent.
- **Google domain-wide delegation, for completeness of read.** Rejected: Google's own guidance says to avoid it, and the impersonation scope is the whole domain.
- **One shared credential store across tenants, for simplicity.** Rejected: a leak or a revocation would cross customers, and the EU residency commitment is per tenant.

## Consequences

- The dress rehearsal on Crowbo's own sandbox accounts goes through the install-and-consent flow, so the first real customer sees the same flow that was tested.
- Each provider needs an app registration owned by the company, with the client keys in the Secrets Store and a rotation runbook. The company entity (Clerky) is a prerequisite for some vendor app registrations.
- A new provider is added by registering an app and writing its scope manifest; a provider with neither OAuth nor a narrow key model is a reason to decline the connector, not to widen the key.
- The glossary gains "connection": one customer's consented credential for one provider, in that customer's tenant.

## Clarification, 15 October 2026

The decision above said both "written to the Secrets Store" and "stored under the tenant's Durable Object"; the backend pointed out that a Worker cannot write per-tenant secrets at runtime without an account-level API token, which would be a high-privilege credential with no EU jurisdiction. Resolved as follows.

- **Per-tenant token material lives in the tenant's EU Durable Object**, encrypted with AES-GCM under a per-tenant data key derived (HKDF) from one key-encryption key. The key-encryption key is held read-only in the Secrets Store with a key id for rotation; the additional authenticated data binds each ciphertext to tenant, provider and kind, so one tenant's key cannot decrypt another's material. A rotated refresh token is committed in the same Durable Object transaction before the new access token is used. The Secrets Store holds company-level material only: the key-encryption key and each provider app's client keys. No Worker holds an account-level Cloudflare API token.
- **Providers without a consent redirect.** Okta service apps: Crowbo generates a key pair per tenant, keeps the private key encrypted in that tenant's object, and the customer's admin registers the public key on the service app and grants the read scopes in their own console, where the grant is visible and revocable; the only pasted value is the client id, which is not a secret. Vanta client credentials: the admin creates an app with read scopes and pastes its client id and secret, which are encrypted per tenant with a rotation date and an age report; a second exception beside Drata unless a partner OAuth flow exists, to be checked.
- Key-encryption key rotation is a runbook with a re-encrypt path keyed by key id; material under the previous key id must still decrypt during rotation.
