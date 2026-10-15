import type { Envelope, SecretKind } from "./crypto";

/**
 * Connections and their encrypted secrets, kept in the tenant's own Durable Object (EU jurisdiction),
 * never in a store shared across tenants. commit writes a connection record and any secrets in one
 * transaction, so a rotated refresh token is either stored with its access token or not at all.
 */

export type ConnectionStatus = "active" | "revoked";

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
}

export interface ConsentState {
  nonce: string;
  provider: string;
  verifier: string | null;
  expires_at: string;
}

export interface ConnectionStore {
  get(provider: string): Connection | null;
  list(): Connection[];
  secret(provider: string, kind: SecretKind): Envelope | null;
  /** Every stored secret, for re-encryption under a new key id. */
  allSecrets(): { provider: string; kind: SecretKind; envelope: Envelope }[];
  /** The record and its secrets together, or neither. Throws if the write fails. */
  commit(connection: Connection, secrets: Partial<Record<SecretKind, Envelope>>): void;
  putState(state: ConsentState): void;
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
  putState(state: ConsentState) {
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
  putState(state: ConsentState) {
    this.storage.sql.exec("INSERT INTO consent_states (nonce, body) VALUES (?, ?)", state.nonce, JSON.stringify(state));
  }
  takeState(nonce: string) {
    return this.storage.transactionSync(() => {
      const row = this.storage.sql.exec<{ body: string }>("SELECT body FROM consent_states WHERE nonce = ?", nonce).toArray()[0];
      this.storage.sql.exec("DELETE FROM consent_states WHERE nonce = ?", nonce);
      return row ? (JSON.parse(row.body) as ConsentState) : null;
    });
  }
}
