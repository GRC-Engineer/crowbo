/**
 * Encryption of connection secrets at rest in a tenant's Durable Object (ADR 0003, as amended).
 * One key-encryption key (KEK) per key id is held read-only in the Secrets Store; each tenant's data
 * key is derived from it with HKDF, salted by the tenant, so a tenant's key cannot open another
 * tenant's material. Every secret is AES-GCM encrypted with additional data "tenant|provider|kind",
 * so a ciphertext moved to another tenant, provider or kind fails to decrypt.
 *
 * Rotation: a new KEK gets a new key id and becomes current; material under an older key id still
 * decrypts while that key stays in the keyring, and reencrypt moves it to the current key id.
 */

export interface Keyring {
  /** The key id new material is encrypted under. */
  current: string;
  /** Raw 32-byte KEKs by key id. */
  keys: Record<string, Uint8Array>;
}

export interface Envelope {
  kid: string;
  iv: string;
  ct: string;
}

export type SecretKind = "access_token" | "refresh_token" | "private_jwk" | "client_secret" | "api_key" | "pkce_verifier";

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const utf8 = new TextEncoder();

/** Parse the CONNECTIONS_KEK secret: {"current": "k1", "keys": {"k1": "<base64 of 32 bytes>"}}. */
export function parseKeyring(raw: string): Keyring {
  const j = JSON.parse(raw) as { current?: unknown; keys?: Record<string, unknown> };
  if (typeof j.current !== "string" || !j.keys || typeof j.keys !== "object") throw new Error("CONNECTIONS_KEK must be {current, keys}");
  const keys: Record<string, Uint8Array> = {};
  for (const [kid, v] of Object.entries(j.keys)) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(kid) || typeof v !== "string") throw new Error("Invalid key id or key in CONNECTIONS_KEK");
    const bytes = unb64(v);
    if (bytes.length !== 32) throw new Error(`Key ${kid} must be 32 bytes`);
    keys[kid] = bytes;
  }
  if (!keys[j.current]) throw new Error("The current key id has no key");
  return { current: j.current, keys };
}

async function tenantKey(ring: Keyring, kid: string, tenant: string): Promise<CryptoKey> {
  const kek = ring.keys[kid];
  if (!kek) throw new Error(`Key id ${kid} is not in the keyring`);
  const base = await crypto.subtle.importKey("raw", kek, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: utf8.encode(`crowbo:tenant:${tenant}`), info: utf8.encode("crowbo:connections:v1") },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

const aad = (tenant: string, provider: string, kind: SecretKind) => utf8.encode(`${tenant}|${provider}|${kind}`);

export async function seal(ring: Keyring, tenant: string, provider: string, kind: SecretKind, plaintext: string): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await tenantKey(ring, ring.current, tenant);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(tenant, provider, kind) }, key, utf8.encode(plaintext)));
  return { kid: ring.current, iv: b64(iv), ct: b64(ct) };
}

/** The plaintext, or a thrown error: wrong tenant, provider, kind or key id never yields text. */
export async function open(ring: Keyring, tenant: string, provider: string, kind: SecretKind, env: Envelope): Promise<string> {
  const key = await tenantKey(ring, env.kid, tenant);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv), additionalData: aad(tenant, provider, kind) }, key, unb64(env.ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("A connection secret could not be decrypted for this tenant, provider and kind");
  }
}

/** Move material to the current key id; unchanged if it is already there. */
export async function reencrypt(ring: Keyring, tenant: string, provider: string, kind: SecretKind, env: Envelope): Promise<Envelope> {
  return env.kid === ring.current ? env : seal(ring, tenant, provider, kind, await open(ring, tenant, provider, kind, env));
}
