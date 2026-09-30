/**
 * Exact decimal arithmetic for attributed loss inputs, mirroring Python's `Decimal`:
 * a product keeps the sum of its operands' exponents, so `Decimal("2.5") * Decimal("1000")`
 * formats as "2500.0". Only multiplication and ordering are needed.
 */
export type Dec = { readonly coefficient: bigint; readonly exponent: number };

export function parseDec(input: string | number): Dec {
  const text = typeof input === "number" ? pythonReprNumber(input) : input.trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) throw new Error("Invalid decimal");
  const [, sign, whole, fraction = "", exp = "0"] = match;
  const digits = `${whole}${fraction}` || "0";
  const coefficient = BigInt(digits) * (sign === "-" ? -1n : 1n);
  return { coefficient, exponent: Number(exp) - fraction.length };
}

function pythonReprNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Invalid decimal");
  // Pydantic reads a JSON float through its shortest repr, e.g. 2.5 -> Decimal("2.5").
  return Number.isInteger(value) ? String(value) : value.toString();
}

export const mulDec = (a: Dec, b: Dec): Dec => ({ coefficient: a.coefficient * b.coefficient, exponent: a.exponent + b.exponent });

export function cmpDec(a: Dec, b: Dec): number {
  const e = Math.min(a.exponent, b.exponent);
  const x = a.coefficient * 10n ** BigInt(a.exponent - e);
  const y = b.coefficient * 10n ** BigInt(b.exponent - e);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Python `format(Decimal, "f")`. */
export function formatDec(d: Dec): string {
  const negative = d.coefficient < 0n;
  const digits = (negative ? -d.coefficient : d.coefficient).toString();
  let out: string;
  if (d.exponent >= 0) out = digits + "0".repeat(d.exponent);
  else {
    const places = -d.exponent;
    const padded = digits.padStart(places + 1, "0");
    out = `${padded.slice(0, -places)}.${padded.slice(-places)}`;
  }
  return negative ? `-${out}` : out;
}

/** Digits and decimal places, as Pydantic's `max_digits`/`decimal_places` count them. */
export function decShape(d: Dec): { digits: number; places: number } {
  const digits = (d.coefficient < 0n ? -d.coefficient : d.coefficient).toString().replace(/^0+(?=\d)/, "");
  const places = Math.max(0, -d.exponent);
  const whole = d.exponent >= 0 ? digits.length + d.exponent : Math.max(digits.length, places);
  return { digits: whole, places };
}
