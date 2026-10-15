import { createHash } from "node:crypto";

/** One pinned provider spec, as listed in backend/contracts/sources.json. */
export interface PinnedSource {
  label: string;
  url: string;
  sha256: string;
  /** "canonical-json": hashed with object keys sorted, for a source that serves keys in varying order. */
  hash?: "canonical-json";
  file: string;
  format: "openapi" | "google-discovery" | "graphql";
  committed: boolean;
}

const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v;

/** The SHA-256 a spec is pinned by: over its bytes, or over its canonical JSON. */
export const digest = (s: PinnedSource, bytes: Uint8Array): string =>
  createHash("sha256").update(s.hash === "canonical-json" ? JSON.stringify(canonical(JSON.parse(new TextDecoder().decode(bytes)))) : bytes).digest("hex");
