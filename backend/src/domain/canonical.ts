import { createHash } from "node:crypto";

/**
 * Canonical JSON matching Python's `json.dumps(value, sort_keys=True, separators=(",", ":"),
 * ensure_ascii=False)`, so identities written by the Python pilot (revision, logical, head,
 * assessment and question IDs) stay byte-identical. Integral floats are the one known
 * difference: JavaScript cannot distinguish `1.0` from `1`. No identity hash contains a
 * float; only internal body hashes can, and those never cross languages.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return pythonNumber(value);
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new TypeError(`Value of type ${typeof value} has no canonical JSON form`);
}

function pythonNumber(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError("Non-finite numbers have no JSON form");
  if (Number.isInteger(value) && Math.abs(value) < 1e16) return String(value);
  // Python repr: shortest round-trip digits, scientific when exponent < -4 or >= 16.
  const [mantissa, exponentText] = value.toExponential().split("e");
  const exponent = Number(exponentText);
  if (exponent < -4 || exponent >= 16) {
    const sign = exponent < 0 ? "-" : "+";
    return `${mantissa}e${sign}${String(Math.abs(exponent)).padStart(2, "0")}`;
  }
  return String(value);
}

/** Python's default `json.dumps(value, sort_keys=True)`: `", "`/`": "` separators, ASCII-escaped. */
export function pythonDefaultJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") {
    return JSON.stringify(value).replace(/[\u0080-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return canonicalJson(value);
  if (Array.isArray(value)) return `[${value.map(pythonDefaultJson).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${pythonDefaultJson(k)}: ${pythonDefaultJson(v)}`).join(", ")}}`;
}

export function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export const HEX64 = /^[a-f0-9]{64}$/;
