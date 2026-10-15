import type { FetchLike } from "../providers/http";
import { type Envelope, type Keyring, open, reencrypt, type SecretKind, seal } from "./crypto";
import { authorizeUrl, manifest } from "./manifests";
import { type Connection, type ConnectionStore, RevokedError } from "./store";

/**
 * One tenant's connections (ADR 0003): consent and code exchange, refresh with rotating tokens
 * persisted before use, Okta's private-key JWT, pasted secrets with a rotation date, revocation and
 * the report of what was not read. Secrets are sealed with the tenant's derived key before they
 * touch storage, and opened only to make a request.
 *
 * Concurrency: the Durable Object interleaves at every await. Only one token request per provider is
 * in flight (single-flight), and every write after an await re-reads the record inside its
 * transaction, so a stale snapshot can never overwrite a revocation.
 */

const DAY = 86_400_000;
/** A connection no scheduled read used for this long is reported. */
export const UNUSED_DAYS = 14;
const STATE_TTL_MS = 10 * 60_000;
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
const iso = (ms: number) => new Date(ms).toISOString();

export class ConnectionError extends Error {
  override name = "ConnectionError";
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; team?: { id?: string } };

/** Who consented, asked of the provider with the new token; null when the provider does not say. */
export type IdentityProbe = (provider: string, token: TokenResponse, http: FetchLike) => Promise<string | null>;

export class ConnectionVault {
  constructor(
    private tenant: string,
    private store: ConnectionStore,
    private ring: Keyring,
    private now: () => number = Date.now,
    /** Token requests in flight, by provider: shared by every vault on the same object. */
    private inflight: Map<string, Promise<string | null>> = new Map(),
  ) {}

  // ---- Consent (authorization code, PKCE where the provider supports it) ----

  async startConsent(provider: string, clientId: string, redirectUri: string, initiator: string): Promise<{ url: string; state: string }> {
    const m = manifest(provider);
    if (m.flow.kind !== "authorization_code") throw new ConnectionError(`${m.label} has no consent redirect`);
    const nonce = randomToken();
    const verifier = m.flow.pkce ? randomToken(48) : null;
    const challenge = verifier ? b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))) : undefined;
    this.store.putState({
      nonce, provider, initiator, expires_at: iso(this.now() + STATE_TTL_MS),
      verifier: verifier ? await seal(this.ring, this.tenant, provider, "pkce_verifier", verifier) : null,
    }, this.now());
    return { url: authorizeUrl(provider, { clientId, redirectUri, state: nonce, codeChallenge: challenge }), state: nonce };
  }

  /**
   * The callback: the state must be this tenant's, unused, unexpired and for this provider. The
   * consenting identity is asked of the provider and checked against the tenant's registered
   * identities: a mismatch is refused and nothing is kept. With none registered, the connection is
   * kept pending until the operator who started it confirms the identity shown.
   */
  async completeConsent(
    provider: string, nonce: string, code: string,
    client: { id: string; secret: string; redirectUri: string }, http: FetchLike,
    registered: string[], probe: IdentityProbe,
  ): Promise<Connection> {
    const m = manifest(provider);
    if (m.flow.kind !== "authorization_code") throw new ConnectionError(`${m.label} has no consent redirect`);
    const state = this.store.takeState(nonce);
    if (!state || state.provider !== provider || Date.parse(state.expires_at) < this.now()) throw new ConnectionError("The consent request is unknown, used or expired; start again");
    const verifier = state.verifier ? await open(this.ring, this.tenant, provider, "pkce_verifier", state.verifier) : null;
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: client.redirectUri, client_id: client.id, client_secret: client.secret, ...(verifier ? { code_verifier: verifier } : {}) });
    const t = await this.tokenCall(m.flow.token, body, http);
    if (!t.access_token) throw new ConnectionError(`${m.label} did not return an access token`);
    const identity = await probe(provider, t, http).catch(() => null);
    if (registered.length && (!identity || !registered.includes(identity))) {
      throw new ConnectionError(`${m.label} was consented by ${identity ?? "an identity the provider did not state"}, which is not registered for this company; nothing was kept`);
    }
    const granted = t.scope ? t.scope.split(/[ ,]+/).filter(Boolean) : m.scopes.map((s) => s.scope);
    const connection: Connection = {
      provider, status: registered.length ? "active" : "pending", scopes: granted, created_at: iso(this.now()), last_used_at: null, revoked_at: null, revoked_reason: null,
      access_expires_at: t.expires_in ? iso(this.now() + t.expires_in * 1000) : null, rotation_due: null, client_id: client.id, host: null,
      identity, initiator: state.initiator,
    };
    this.store.commit(connection, {
      access_token: await seal(this.ring, this.tenant, provider, "access_token", t.access_token),
      ...(t.refresh_token ? { refresh_token: await seal(this.ring, this.tenant, provider, "refresh_token", t.refresh_token) } : {}),
    });
    return connection;
  }

  /** The operator who started a consent confirms the identity it landed on; nobody else can. */
  confirm(provider: string, operator: string): Connection {
    const c = this.store.get(provider);
    if (!c || c.status !== "pending") throw new ConnectionError(`No ${manifest(provider).label} connection is waiting for confirmation`);
    if (c.initiator !== operator) throw new ConnectionError("Only the operator who started this connection can confirm it");
    return this.store.update(provider, (cur) => (cur.status === "pending" ? { ...cur, status: "active" } : cur));
  }

  /** Scopes the manifest needs that the provider did not grant: reads that need them will not be complete. */
  missingScopes(provider: string): string[] {
    const c = this.store.get(provider);
    return c ? manifest(provider).scopes.map((s) => s.scope).filter((s) => !c.scopes.includes(s)) : [];
  }

  // ---- Access tokens ----

  /**
   * A usable access token, one request per provider at a time. When it has expired, refresh: the
   * rotated refresh token and the new access token are committed together before the access token
   * is returned. If that write fails, the error is raised: the old refresh token is never retried
   * (Atlassian's are single-use). A connection revoked meanwhile stays revoked.
   */
  accessToken(provider: string, client: { id: string; secret: string }, http: FetchLike): Promise<string | null> {
    const running = this.inflight.get(provider);
    if (running) return running;
    const job = this.token(provider, client, http).finally(() => this.inflight.delete(provider));
    this.inflight.set(provider, job);
    return job;
  }

  private async token(provider: string, client: { id: string; secret: string }, http: FetchLike): Promise<string | null> {
    const c = this.store.get(provider);
    if (!c || c.status !== "active") return null;
    const m = manifest(provider);
    if (m.flow.kind === "api_key") return this.openSecret(provider, "api_key");
    const fresh = c.access_expires_at === null || Date.parse(c.access_expires_at) - 60_000 > this.now();
    if (fresh) return this.openSecret(provider, "access_token");
    if (m.flow.kind === "private_key_jwt") return this.oktaToken(c, http);
    if (m.flow.kind === "client_credentials") return this.clientCredentials(c, http);
    const refresh = await this.openSecret(provider, "refresh_token");
    if (!refresh) return this.revoke(provider, "the access token expired and there is no refresh token");
    let t: TokenResponse;
    try {
      t = await this.tokenCall(m.flow.token, new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: client.id, client_secret: client.secret }), http);
    } catch (error) {
      if (error instanceof ConnectionError && /invalid_grant|unauthorized_client/.test(error.message)) return this.revoke(provider, "the provider refused the refresh token");
      throw error;
    }
    if (!t.access_token) return this.revoke(provider, "the provider returned no access token on refresh");
    return this.storeToken(provider, t);
  }

  /** Persist a new access token (and a rotated refresh token) before returning it; never onto a revoked connection. */
  private async storeToken(provider: string, t: TokenResponse): Promise<string | null> {
    const secrets: Partial<Record<SecretKind, Envelope>> = {
      access_token: await seal(this.ring, this.tenant, provider, "access_token", t.access_token!),
      ...(t.refresh_token ? { refresh_token: await seal(this.ring, this.tenant, provider, "refresh_token", t.refresh_token) } : {}),
    };
    try {
      // Re-reads the record inside the write: a revocation that landed meanwhile is kept, and this token is not used.
      this.store.update(provider, (cur) => (cur.status === "active" ? { ...cur, access_expires_at: iso(this.now() + (t.expires_in ?? 3600) * 1000) } : cur), secrets);
    } catch (error) {
      if (error instanceof RevokedError) return null;
      throw error;
    }
    return this.store.get(provider)?.status === "active" ? t.access_token! : null;
  }

  private async openSecret(provider: string, kind: SecretKind) {
    const env = this.store.secret(provider, kind);
    return env ? open(this.ring, this.tenant, provider, kind, env) : null;
  }

  private async tokenCall(url: string, body: URLSearchParams, http: FetchLike, headers: Record<string, string> = {}): Promise<TokenResponse> {
    const res = await http(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...headers }, body: body.toString() });
    const json = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || json.error) throw new ConnectionError(`Token request refused: ${json.error ?? res.status}`);
    return json;
  }

  // ---- Okta service app: private-key JWT, only the public key registered at Okta ----

  /** A key pair for this tenant's Okta service app; the private key is sealed here, the public JWK is shown to the admin. */
  async setupOkta(orgHost: string, clientId: string): Promise<{ public_jwk: JsonWebKey }> {
    if (!/^[a-z0-9-]+\.(okta|oktapreview|okta-emea)\.com$/.test(orgHost)) throw new ConnectionError("The Okta org host must be <org>.okta.com");
    const pair = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const kid = randomToken(12);
    const priv = { ...((await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey), kid };
    const pub: JsonWebKey & { kid: string; use: string } = { ...((await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey), kid, use: "sig", alg: "RS256" };
    const connection: Connection = {
      provider: "okta", status: "active", scopes: manifest("okta").scopes.map((s) => s.scope), created_at: iso(this.now()), last_used_at: null,
      revoked_at: null, revoked_reason: null, access_expires_at: iso(0), rotation_due: null, client_id: clientId, host: orgHost, identity: orgHost, initiator: null,
    };
    this.store.commit(connection, { private_jwk: await seal(this.ring, this.tenant, "okta", "private_jwk", JSON.stringify(priv)) });
    return { public_jwk: pub };
  }

  private async oktaToken(c: Connection, http: FetchLike): Promise<string | null> {
    const raw = await this.openSecret("okta", "private_jwk");
    if (!raw || !c.client_id || !c.host) return this.revoke("okta", "the service app key or client id is missing");
    const jwk = JSON.parse(raw) as JsonWebKey & { kid: string };
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const aud = `https://${c.host}${(manifest("okta").flow as { tokenPath: string }).tokenPath}`;
    const now = Math.floor(this.now() / 1000);
    const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
    const signing = `${enc({ alg: "RS256", kid: jwk.kid })}.${enc({ iss: c.client_id, sub: c.client_id, aud, iat: now, exp: now + 300, jti: randomToken(16) })}`;
    const sig = b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signing))));
    let t: TokenResponse;
    try {
      t = await this.tokenCall(aud, new URLSearchParams({
        grant_type: "client_credentials", scope: c.scopes.join(" "),
        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: `${signing}.${sig}`,
      }), http);
    } catch (error) {
      if (error instanceof ConnectionError && /invalid_client|unauthorized_client|invalid_grant/.test(error.message)) return this.revoke("okta", "Okta refused the service app's key");
      throw error;
    }
    if (!t.access_token) return this.revoke("okta", "Okta returned no access token");
    return this.storeToken("okta", t);
  }

  // ---- Pasted secrets: the exceptions (Vanta client credentials, Drata API key) ----

  async storePasted(provider: "vanta" | "drata", values: { client_id?: string; secret: string }): Promise<Connection> {
    const m = manifest(provider);
    if (!m.rotate_within_days) throw new ConnectionError(`${m.label} is not a pasted-secret provider`);
    if (values.secret.length < 16 || values.secret.length > 4096) throw new ConnectionError("That does not look like a secret");
    const kind = m.flow.kind === "api_key" ? "api_key" : "client_secret";
    const connection: Connection = {
      provider, status: "active", scopes: m.scopes.map((s) => s.scope), created_at: iso(this.now()), last_used_at: null, revoked_at: null, revoked_reason: null,
      access_expires_at: kind === "api_key" ? null : iso(0), rotation_due: iso(this.now() + m.rotate_within_days * DAY), client_id: values.client_id ?? null, host: null,
      identity: null, initiator: null,
    };
    this.store.commit(connection, { [kind]: await seal(this.ring, this.tenant, provider, kind, values.secret) });
    return connection;
  }

  private async clientCredentials(c: Connection, http: FetchLike): Promise<string | null> {
    const m = manifest(c.provider);
    const secret = await this.openSecret(c.provider, "client_secret");
    if (!secret || !c.client_id || m.flow.kind !== "client_credentials") return this.revoke(c.provider, "the client credentials are missing");
    let t: TokenResponse;
    try {
      t = await this.tokenCall(m.flow.token, new URLSearchParams({ grant_type: "client_credentials", client_id: c.client_id, client_secret: secret, scope: c.scopes.join(" ") }), http);
    } catch (error) {
      if (error instanceof ConnectionError && /invalid_client|unauthorized_client/.test(error.message)) return this.revoke(c.provider, `${m.label} refused the client credentials`);
      throw error;
    }
    if (!t.access_token) return this.revoke(c.provider, `${m.label} returned no access token`);
    return this.storeToken(c.provider, t);
  }

  // ---- Key rotation ----

  /**
   * Move every secret to the current key id, one provider per transaction. Run after a new KEK is
   * made current and before the old one is removed from the keyring. Returns how many moved.
   */
  async rekey(): Promise<{ moved: number; current: string }> {
    let moved = 0;
    const byProvider = new Map<string, Partial<Record<SecretKind, Envelope>>>();
    for (const { provider, kind, envelope } of this.store.allSecrets()) {
      if (envelope.kid === this.ring.current) continue;
      const next = await reencrypt(this.ring, this.tenant, provider, kind, envelope);
      byProvider.set(provider, { ...(byProvider.get(provider) ?? {}), [kind]: next });
      moved++;
    }
    for (const [provider, secrets] of byProvider) if (this.store.get(provider)) this.store.update(provider, (cur) => cur, secrets);
    return { moved, current: this.ring.current };
  }

  // ---- Revocation, use and the report ----

  /** Fail closed: the connection is revoked and no read uses it; returns null for the caller to stop. */
  revoke(provider: string, reason: string): null {
    if (this.store.get(provider)) {
      this.store.update(provider, (cur) => (cur.status === "revoked" ? cur : { ...cur, status: "revoked", revoked_at: iso(this.now()), revoked_reason: reason }));
    }
    return null;
  }

  markUsed(provider: string) {
    if (this.store.get(provider)) this.store.update(provider, (cur) => (cur.status === "active" ? { ...cur, last_used_at: iso(this.now()) } : cur));
  }

  /** What the brief says about sources: revoked since when, unused for 14 days, secrets due for rotation. */
  report(): { provider: string; label: string; problem: "revoked" | "unused" | "rotation_due"; since: string; detail: string }[] {
    const out: ReturnType<ConnectionVault["report"]> = [];
    for (const c of this.store.list()) {
      const label = manifest(c.provider).label;
      if (c.status === "revoked") {
        out.push({ provider: c.provider, label, problem: "revoked", since: c.revoked_at!, detail: c.revoked_reason ?? "revoked" });
        continue;
      }
      if (c.status === "pending") continue;
      const used = Date.parse(c.last_used_at ?? c.created_at);
      if (this.now() - used > UNUSED_DAYS * DAY) out.push({ provider: c.provider, label, problem: "unused", since: c.last_used_at ?? c.created_at, detail: `no scheduled read in ${UNUSED_DAYS} days` });
      if (c.rotation_due && Date.parse(c.rotation_due) <= this.now()) out.push({ provider: c.provider, label, problem: "rotation_due", since: c.rotation_due, detail: "the pasted secret is past its rotation date" });
    }
    return out;
  }
}

/**
 * Who consented, as each provider states it: the Google Workspace primary domain, the Linear
 * workspace, the Jira site, the Slack team. A tenant registers these to accept a consent without the
 * confirm step. Endpoint shapes are verified: false until the dress rehearsal.
 */
export const identityProbe: IdentityProbe = async (provider, token, http) => {
  const bearer = { authorization: `Bearer ${token.access_token}`, accept: "application/json" };
  if (provider === "slack") return token.team?.id ? `slack:${token.team.id}` : null;
  if (provider === "linear") {
    const r = await http("https://api.linear.app/graphql", { method: "POST", headers: { ...bearer, "content-type": "application/json" }, body: JSON.stringify({ query: "{ organization { urlKey } }" }) });
    const key = ((await r.json()) as { data?: { organization?: { urlKey?: string } } }).data?.organization?.urlKey;
    return key ? `linear:${key}` : null;
  }
  if (provider === "jira") {
    const r = await http("https://api.atlassian.com/oauth/token/accessible-resources", { headers: bearer });
    const sites = (await r.json()) as { url?: string }[];
    return sites.length === 1 && sites[0].url ? `jira:${new URL(sites[0].url).host}` : null;
  }
  if (provider === "google-workspace") {
    const r = await http("https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer&maxResults=1", { headers: bearer });
    const email = ((await r.json()) as { users?: { primaryEmail?: string }[] }).users?.[0]?.primaryEmail;
    return email?.includes("@") ? `google:${email.split("@")[1].toLowerCase()}` : null;
  }
  return null;
};
