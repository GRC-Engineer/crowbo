import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STYLESHEETS,
  readTokens,
  rewrite,
} from "../tools/apply-brand-tokens.mjs";

const sheets = STYLESHEETS.map((file) => ({
  name: file.split("/decision-studio/")[1],
  source: readFileSync(file, "utf8"),
}));

function offenders(pattern) {
  return sheets.flatMap(({ name, source }) =>
    source
      .split("\n")
      .map((line, index) => ({ line, at: `${name}:${index + 1}` }))
      .filter(({ line }) => pattern.test(line))
      .map(({ line, at }) => `${at} ${line.trim()}`),
  );
}

test("the token file defines the four selected brand colours", () => {
  const tokens = readTokens();
  assert.equal(tokens.get("--chalk"), "#f5f3e8");
  assert.equal(tokens.get("--sage"), "#91aa9d");
  assert.equal(tokens.get("--ink"), "#171b1a");
  assert.equal(tokens.get("--oxide"), "#d18a66");
});

test("stylesheets take every colour from a token", () => {
  assert.deepEqual(offenders(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/), []);
});

test("stylesheets set no corner radius", () => {
  assert.deepEqual(offenders(/border(-[a-z]+)*-radius\s*:/), []);
});

test("stylesheets use no blur, frosted overlay or radial fade", () => {
  assert.deepEqual(
    offenders(/backdrop-filter|blur\(|radial-gradient|text-shadow/),
    [],
  );
});

test("the only shadows are hard-edged", () => {
  const soft = sheets.flatMap(({ name, source }) =>
    [...source.matchAll(/box-shadow\s*:([^;]*);/g)]
      .map(([, value]) => value.trim())
      .filter(
        (value) =>
          value !== "none" &&
          value !== "var(--shadow-hard)" &&
          !/^(inset\s+)?0 0 0 \d+px /.test(value),
      )
      .map((value) => `${name} ${value}`),
  );
  assert.deepEqual(soft, []);
});

test("no text is set smaller than 11px", () => {
  assert.deepEqual(
    offenders(/font(-size)?\s*:[^;]*\b([1-9]|10)(\.\d+)?px/),
    [],
  );
});

test("the rewrite tool has nothing left to change", () => {
  const tokens = readTokens();
  const pending = sheets
    .filter(({ source }) => rewrite(source, tokens).output !== source)
    .map(({ name }) => name);
  assert.deepEqual(pending, []);
});

test("components import no stock icon library", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal("lucide-react" in manifest.dependencies, false);
});
