// Rewrites the site stylesheets against src/tokens.css.
//
//   node tools/apply-brand-tokens.mjs           rewrite files in place
//   node tools/apply-brand-tokens.mjs --check   report only, exit 1 if anything would change
//
// What it changes:
//   - every raw hex colour becomes the nearest brand token (nearest in OKLab,
//     a colour space where equal distances look equally different)
//   - colours with alpha become color-mix(token, transparent)
//   - border-radius declarations are removed (tokens.css sets square corners)
//   - backdrop-filter declarations are removed
//   - soft shadows are removed; large elevation shadows become --shadow-hard
//   - font sizes below the legibility floor are raised to it
//
// It reads and writes only the stylesheets listed in STYLESHEETS. Running it
// twice gives the same result as running it once.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_FILE = join(root, "src/tokens.css");
const MIN_FONT_PX = 11;
const ELEVATION_BLUR_PX = 30;

export const STYLESHEETS = ["src", "landing", "brand"]
  .flatMap((dir) => {
    try {
      return readdirSync(join(root, dir))
        .filter((name) => name.endsWith(".css"))
        .map((name) => join(root, dir, name));
    } catch {
      return [];
    }
  })
  .filter((file) => file !== TOKEN_FILE)
  .sort();

export function readTokens() {
  const tokens = new Map();
  const source = readFileSync(TOKEN_FILE, "utf8");
  for (const [, name, hex] of source.matchAll(
    /(--[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi,
  )) {
    tokens.set(name, hex.toLowerCase());
  }
  return tokens;
}

function toOklab(hex) {
  const channel = (index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  const r = channel(1);
  const g = channel(3);
  const b = channel(5);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function expandHex(raw) {
  let hex = raw.slice(1).toLowerCase();
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((digit) => digit + digit).join("");
  }
  return { rgb: `#${hex.slice(0, 6)}`, alpha: hex.slice(6) || "ff" };
}

function nearestToken(rgb, tokens, labs) {
  const target = toOklab(rgb);
  let best = null;
  for (const [name] of tokens) {
    const lab = labs.get(name);
    const distance = Math.hypot(
      target[0] - lab[0],
      target[1] - lab[1],
      target[2] - lab[2],
    );
    if (!best || distance < best.distance) best = { name, distance };
  }
  return best;
}

function splitLayers(value) {
  const layers = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      layers.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) layers.push(current.trim());
  return layers;
}

function rewriteShadow(value) {
  if (/^\s*(none|var\(--shadow-hard\))\s*$/.test(value)) return value.trim();
  const kept = [];
  let elevated = false;
  for (const layer of splitLayers(value)) {
    const lengths = [
      ...layer.matchAll(/(?<![#\w.-])(-?\d*\.?\d+)(px)?(?![\w%])/g),
    ].map((match) => parseFloat(match[1]));
    const blur = lengths[2] ?? 0;
    if (blur === 0) {
      kept.push(layer);
    } else if (!/\binset\b/.test(layer) && blur >= ELEVATION_BLUR_PX) {
      elevated = true;
    }
  }
  if (elevated) kept.push("var(--shadow-hard)");
  return kept.length ? kept.join(", ") : null;
}

export function rewrite(source, tokens) {
  const labs = new Map([...tokens].map(([name, hex]) => [name, toOklab(hex)]));
  const report = {
    colours: 0,
    farthest: null,
    removed: 0,
    shadows: 0,
    fonts: 0,
  };
  let output = source;

  output = output.replace(
    /^[ \t]*(?:-webkit-)?(border(?:-[a-z]+){0,2}-radius|backdrop-filter)\s*:[^;]*;[ \t]*\n/gm,
    () => {
      report.removed += 1;
      return "";
    },
  );

  output = output.replace(
    /^([ \t]*)box-shadow\s*:([^;]*);[ \t]*\n/gm,
    (whole, indent, value) => {
      const next = rewriteShadow(value);
      if (next === value.trim()) return whole;
      report.shadows += 1;
      return next === null ? "" : `${indent}box-shadow: ${next};\n`;
    },
  );

  output = output.replace(/#[0-9a-fA-F]{3,8}\b/g, (raw) => {
    if (![3, 4, 6, 8].includes(raw.length - 1)) return raw;
    const { rgb, alpha } = expandHex(raw);
    const match = nearestToken(rgb, tokens, labs);
    report.colours += 1;
    if (!report.farthest || match.distance > report.farthest.distance) {
      report.farthest = { from: raw, to: match.name, distance: match.distance };
    }
    if (alpha === "ff") return `var(${match.name})`;
    const percent = Math.max(1, Math.round((parseInt(alpha, 16) / 255) * 100));
    return `color-mix(in srgb, var(${match.name}) ${percent}%, transparent)`;
  });

  output = output.replace(
    /(font-size\s*:\s*)(\d*\.?\d+)px/g,
    (whole, property, size) => {
      if (parseFloat(size) === 0 || parseFloat(size) >= MIN_FONT_PX)
        return whole;
      report.fonts += 1;
      return `${property}${MIN_FONT_PX}px`;
    },
  );
  output = output.replace(
    /(\bfont\s*:\s*(?:[a-z0-9]+\s+)*)(\d*\.?\d+)px/g,
    (whole, property, size) => {
      if (parseFloat(size) >= MIN_FONT_PX) return whole;
      report.fonts += 1;
      return `${property}${MIN_FONT_PX}px`;
    },
  );

  return { output, report };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const tokens = readTokens();
  let changed = 0;
  for (const file of STYLESHEETS) {
    const source = readFileSync(file, "utf8");
    const { output, report } = rewrite(source, tokens);
    if (output === source) continue;
    changed += 1;
    const far = report.farthest
      ? ` farthest ${report.farthest.from} -> ${report.farthest.to} (${report.farthest.distance.toFixed(3)})`
      : "";
    console.log(
      `${file.slice(root.length + 1)}: ${report.colours} colours, ${report.removed} radius/blur removed, ${report.shadows} shadows, ${report.fonts} font sizes.${far}`,
    );
    if (!check) writeFileSync(file, output);
  }
  console.log(
    changed === 0
      ? "All stylesheets already match the tokens."
      : `${changed} stylesheet(s) ${check ? "would change" : "rewritten"}.`,
  );
  if (check && changed > 0) process.exit(1);
}
