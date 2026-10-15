/**
 * Which fields of a response a connector reads. A body wrapped by trackReads records each field path
 * touched ("[].profile.login", "issues[].fields.labels"), including fields looked for and not found.
 * The contract test checks those paths against the provider's spec; the recorder keeps only them.
 */

/** Fields that the runtime, not the connector, asks for: awaiting a value, JSON.stringify. */
const RUNTIME = new Set(["then", "toJSON"]);

export function trackReads(value: unknown, seen: Set<string>, at = ""): unknown {
  if (value === null || typeof value !== "object") return value;
  return new Proxy(value, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver);
      if (typeof key === "symbol" || RUNTIME.has(key)) return v;
      if (Array.isArray(target)) return /^\d+$/.test(key) ? trackReads(v, seen, `${at}[]`) : v;
      const path = at ? `${at}.${key}` : key;
      seen.add(path);
      return trackReads(v, seen, path);
    },
  });
}

/**
 * A response cut down to the fields read. An object the connector only tested for presence stays as
 * an empty object, so the cut-down response reads the same; an array keeps its elements, each cut down.
 */
export function pruneToReads(value: unknown, read: Set<string>, at = ""): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => pruneToReads(v, read, `${at}[]`));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const path = at ? `${at}.${k}` : k;
    if (read.has(path)) out[k] = pruneToReads(v, read, path);
  }
  return out;
}
