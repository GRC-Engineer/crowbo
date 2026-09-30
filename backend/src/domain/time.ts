import { z } from "zod";

/**
 * Timezone-aware instants in the exact form Pydantic serialises them, because revision IDs
 * hash these strings. Microseconds are kept (JavaScript `Date` only has milliseconds).
 * Canonical form: `YYYY-MM-DDTHH:MM:SS[.ffffff](Z|±HH:MM)`, with `+00:00` written as `Z`.
 */
export type Instant = string & { readonly __instant: unique symbol };

const PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|z|[+-]\d{2}(?::?\d{2})?)$/;

export function parseInstant(text: string): Instant {
  const match = PATTERN.exec(text);
  if (!match) throw new Error("Expected a timezone-aware ISO 8601 datetime");
  const [, y, mo, d, h, mi, s = "00", frac, zone] = match;
  const micros = frac ? Number(frac.padEnd(6, "0")) : 0;
  let offset = "Z";
  if (zone !== "Z" && zone !== "z") {
    const digits = zone.slice(1).replace(":", "").padEnd(4, "0");
    const hh = Number(digits.slice(0, 2));
    const mm = Number(digits.slice(2, 4));
    if (hh > 23 || mm > 59) throw new Error("Invalid timezone offset");
    offset = hh === 0 && mm === 0 ? "Z" : `${zone[0]}${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  }
  const check = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
  if (
    check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() !== Number(mo) - 1 ||
    check.getUTCDate() !== Number(d) ||
    Number(h) > 23 ||
    Number(mi) > 59 ||
    Number(s) > 59
  ) {
    throw new Error("Invalid calendar datetime");
  }
  const fraction = micros ? `.${String(micros).padStart(6, "0")}` : "";
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${fraction}${offset}` as Instant;
}

/** Microseconds since the Unix epoch, for ordering and arithmetic. */
export function micros(instant: Instant): bigint {
  const match = PATTERN.exec(instant)!;
  const [, y, mo, d, h, mi, s = "00", frac, zone] = match;
  const base = BigInt(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))) * 1000n;
  const fraction = BigInt(frac ? Number(frac.padEnd(6, "0")) : 0);
  let offsetMinutes = 0;
  if (zone !== "Z" && zone !== "z") {
    const digits = zone.slice(1).replace(":", "").padEnd(4, "0");
    offsetMinutes = (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) * (zone[0] === "-" ? -1 : 1);
  }
  return base + fraction - BigInt(offsetMinutes) * 60_000_000n;
}

export function fromMicros(value: bigint): Instant {
  const ms = Number(value / 1000n);
  const rest = Number(((value % 1000n) + 1000n) % 1000n);
  const iso = new Date(ms).toISOString(); // YYYY-MM-DDTHH:MM:SS.mmmZ
  const total = Number(iso.slice(20, 23)) * 1000 + rest;
  return parseInstant(`${iso.slice(0, 19)}${total ? `.${String(total).padStart(6, "0")}` : ""}Z`);
}

export function now(): Instant {
  return fromMicros(BigInt(Date.now()) * 1000n);
}

export const SECOND = 1_000_000n;
export const MINUTE = 60n * SECOND;
export const HOUR = 60n * MINUTE;
export const DAY = 24n * HOUR;

export function addMicros(instant: Instant, delta: bigint): Instant {
  return fromMicros(micros(instant) + delta);
}

export const compare = (a: Instant, b: Instant): number => {
  const d = micros(a) - micros(b);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
};
export const before = (a: Instant, b: Instant) => compare(a, b) < 0;
export const atOrBefore = (a: Instant, b: Instant) => compare(a, b) <= 0;

/** The calendar date of an instant in its own offset, matching Python's `datetime.date()`. */
export function localDate(instant: Instant): string {
  return instant.slice(0, 10);
}

export const instant = z
  .string()
  .transform((text, ctx) => {
    try {
      return parseInstant(text);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
      return z.NEVER;
    }
  });

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((text) => {
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(text);
}, "Invalid calendar date");
