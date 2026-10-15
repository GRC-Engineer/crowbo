import type { Envelope, SecretKind } from "./crypto";

/**
 * Connections and their encrypted secrets, kept in the tenant's own Durable Object (EU jurisdiction),
 * never in a store shared across tenants. commit writes a connection record and any secrets in one
 * transaction, so a rotated refresh token is either stored with its access token or not at all.
 */

/** pending: consented, waiting for the initiating operator to confirm the consenting identity; not used. */
export type ConnectionStatus = "pending" | "active" | "revoked";

export interface Connection {
  provider: string;
  status: ConnectionStatus;
  /** Scopes the provider says it granted (or the manifest's, where the provider does not say). */
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  /** When the access token expires; null for API keys and pasted secrets. */
  access_expires_at: string | null;
  /** Pasted secrets (Vanta, Drata) and keys: rotate by this date. */
  rotation_due: string | null;
  /** Non-secret identifiers: the client id an admin pasted, the Okta org host. */
  client_id: string | null;
  host: string | null;
  /** Who consented, as the provider states it (a domain, a workspace, a site, a team); null when unknown. */
  identity?: string | null;
  /** The operator who started a consent; only they may confirm a pending connection. */
  initiator?: string | null;
}

/** Raised when a write would bring a revoked connection back without a fresh consent. */
export class RevokedError extends Error {
  override name = "RevokedError";
}

/** A change to a connection, applied to the record as it is now, inside the write. */
export type Change = (current: Connection) => Connection;

function guard(current: Connection | null, next: Connection) {
  if (current?.status === "revoked" && next.status !== "revoked") throw new RevokedError(`${current.provider} was revoked; only a fresh consent reconnects it`);
}

/** Secrets are never written onto a revoked connection: a token that arrives after revocation is dropped. */
const writable = (next: Connection, secrets: Partial<Record<SecretKind, Envelope>>) => (next.status === "revoked" ? {} : secrets);
const sameEnvelope = (a: Envelope | null, b: Envelope) => a !== null && a.kid === b.kid && a.iv === b.iv && a.ct === b.ct;

export interface ConsentState {
  nonce: string;
  provider: string;
  /** The PKCE verifier, sealed like any secret. */
  verifier: Envelope | null;
  /** The operator who started it. */
  initiator: string;
  expires_at: string;
}

export interface ConnectionStore {
  get(provider: string): Connection | null;
  list(): Connection[];
  secret(provider: string, kind: SecretKind): Envelope | null;
  /** Every stored secret, for re-encryption under a new key id. */
  allSecrets(): { provider: string; kind: SecretKind; envelope: Envelope }[];
  /** A whole record from a fresh consent or setup, with its secrets, or neither. Throws if the write fails. */
  commit(connection: Connection, secrets: Partial<Record<SecretKind, Envelope>>): void;
  /**
   * A change applied to the record as it is at the moment of the write, with any secrets, in one
   * transaction. Refuses (RevokedError) to move a revoked connection to any other status, and writes no
   * secret onto a connection that is revoked after the change.
   */
  update(provider: string, change: Change, secrets?: Partial<Record<SecretKind, Envelope>>): Connection;
  /** Replace a secret only if it is still the envelope that was read; false when it changed meanwhile. */
  swapSecret(provider: string, kind: SecretKind, expected: Envelope, next: Envelope): boolean;
  /** Also purges states that have expired by `now`. */
  putState(state: ConsentState, now: number): void;
  /** The state for a nonce, once: it is deleted as it is read. */
  takeState(nonce: string): ConsentState | null;
}

export class MemoryConnectionStore implements ConnectionStore {
  connections = new Map<string, Connection>();
  secrets = new Map<string, Envelope>();
  states = new Map<string, ConsentState>();
  /** Tests set this to make the next commit fail, as a storage error would. */
  failNextCommit = false;
  get(provider: string) {
    const c = this.connections.get(provider);
    return c ? structuredClone(c) : null;
  }
  list() {
    return [...this.connections.values()].map((c) => structuredClone(c));
  }
  secret(provider: string, kind: SecretKind) {
    return this.secrets.get(`${provider}|${kind}`) ?? null;
  }
  allSecrets() {
    return [...this.secrets.entries()].map(([k, envelope]) => {
      const [provider, kind] = k.split("|");
      return { provider, kind: kind as SecretKind, envelope };
    });
  }
  commit(connection: Connection, secrets: Partial<Record<SecretKind, Envelope>>) {
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error("storage write failed");
    }
    this.connections.set(connection.provider, structuredClone(connection));
    for (const [kind, env] of Object.entries(secrets)) this.secrets.set(`${connection.provider}|${kind}`, env!);
  }
  update(provider: string, change: Change, secrets: Partial<Record<SecretKind, Envelope>> = {}) {
    const current = this.get(provider);
    if (!current) throw new Error(`No connection for ${provider}`);
    const next = change(current);
    guard(current, next);
    this.commit(next, writable(next, secrets));
    return next;
  }
  swapSecret(provider: string, kind: SecretKind, expected: Envelope, next: Envelope) {
    if (!sameEnvelope(this.secret(provider, kind), expected)) return false;
    this.secrets.set(`${provider}|${kind}`, next);
    return true;
  }
  putState(state: ConsentState, now: number) {
    for (const [k, v] of this.states) if (Date.parse(v.expires_at) < now) this.states.delete(k);
    this.states.set(state.nonce, state);
  }
  takeState(nonce: string) {
    const s = this.states.get(nonce) ?? null;
    this.states.delete(nonce);
    return s;
  }
}

export const CONNECTION_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS connections (provider TEXT PRIMARY KEY, body TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS connection_secrets (provider TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (provider, kind))",
  "CREATE TABLE IF NOT EXISTS consent_states (nonce TEXT PRIMARY KEY, body TEXT NOT NULL)",
];

/** The tenant Durable Object's storage: SQL for the rows, transactionSync for atomic commits. */
export class SqlConnectionStore implements ConnectionStore {
  constructor(private storage: DurableObjectStorage) {
    for (const s of CONNECTION_SCHEMA) storage.sql.exec(s);
  }
  get(provider: string) {
    const row = this.storage.sql.exec<{ body: string }>("SELECT body FROM connections WHERE provider = ?", provider).toArray()[0];
    return row ? (JSON.parse(row.body) as Connection) : null;
  }
  list() {
    return this.storage.sql.exec<{ body: string }>("SELECT body FROM connections ORDER BY provider").toArray().map((r) => JSON.parse(r.body) as Connection);
  }
  secret(provider: string, kind: SecretKind) {
    const row = this.storage.sql.exec<{ body: string }>("SELECT body FROM connection_secrets WHERE provider = ? AND kind = ?", provider, kind).toArray()[0];
    return row ? (JSON.parse(row.body) as Envelope) : null;
  }
  allSecrets() {
    return this.storage.sql.exec<{ provider: string; kind: string; body: string }>("SELECT provider, kind, body FROM connection_secrets").toArray()
      .map((r) => ({ provider: r.provider, kind: r.kind as SecretKind, envelope: JSON.parse(r.body) as Envelope }));
  }
  commit(connection: Connection, secrets: Partial<Record<SecretKind, Envelope>>) {
    this.storage.transactionSync(() => {
      this.storage.sql.exec("INSERT INTO connections (provider, body) VALUES (?, ?) ON CONFLICT (provider) DO UPDATE SET body = excluded.body", connection.provider, JSON.stringify(connection));
      for (const [kind, env] of Object.entries(secrets)) {
        this.storage.sql.exec("INSERT INTO connection_secrets (provider, kind, body) VALUES (?, ?, ?) ON CONFLICT (provider, kind) DO UPDATE SET body = excluded.body", connection.provider, kind, JSON.stringify(env));
      }
    });
  }
  update(provider: string, change: Change, secrets: Partial<Record<SecretKind, Envelope>> = {}) {
    return this.storage.transactionSync(() => {
      const current = this.get(provider);
      if (!current) throw new Error(`No connection for ${provider}`);
      const next = change(current);
      guard(current, next);
      this.storage.sql.exec("UPDATE connections SET body = ? WHERE provider = ?", JSON.stringify(next), provider);
      for (const [kind, env] of Object.entries(writable(next, secrets))) {
        this.storage.sql.exec("INSERT INTO connection_secrets (provider, kind, body) VALUES (?, ?, ?) ON CONFLICT (provider, kind) DO UPDATE SET body = excluded.body", provider, kind, JSON.stringify(env));
      }
      return next;
    });
  }
  swapSecret(provider: string, kind: SecretKind, expected: Envelope, next: Envelope) {
    return this.storage.transactionSync(() => {
      if (!sameEnvelope(this.secret(provider, kind), expected)) return false;
      this.storage.sql.exec("UPDATE connection_secrets SET body = ? WHERE provider = ? AND kind = ?", JSON.stringify(next), provider, kind);
      return true;
    });
  }
  putState(state: ConsentState, now: number) {
    this.storage.transactionSync(() => {
      for (const r of this.storage.sql.exec<{ nonce: string; body: string }>("SELECT nonce, body FROM consent_states").toArray()) {
        if (Date.parse((JSON.parse(r.body) as ConsentState).expires_at) < now) this.storage.sql.exec("DELETE FROM consent_states WHERE nonce = ?", r.nonce);
      }
      this.storage.sql.exec("INSERT INTO consent_states (nonce, body) VALUES (?, ?)", state.nonce, JSON.stringify(state));
    });
  }
  takeState(nonce: string) {
    return this.storage.transactionSync(() => {
      const row = this.storage.sql.exec<{ body: string }>("SELECT body FROM consent_states WHERE nonce = ?", nonce).toArray()[0];
      this.storage.sql.exec("DELETE FROM consent_states WHERE nonce = ?", nonce);
      return row ? (JSON.parse(row.body) as ConsentState) : null;
    });
  }
}
