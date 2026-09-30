// Proves the TypeScript suite covers every Python test from the pre-migration baseline.
// A Python test is covered when a TypeScript test carries `py: <test id>` in its name or a
// comment, or when parity/dropped.tsv lists it with a reason. Exit 1 on any gap or stale tag.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const expected = readFileSync(join(root, "parity/python-tests.txt"), "utf8")
  .split("\n")
  .filter((line) => line && !line.startsWith("#"));

const dropped = new Map<string, string>();
for (const line of readFileSync(join(root, "parity/dropped.tsv"), "utf8").split("\n").slice(1)) {
  if (!line.trim()) continue;
  const [id, reason] = line.split("\t");
  if (!reason?.trim()) throw new Error(`dropped.tsv entry without a reason: ${id}`);
  dropped.set(id, reason);
}

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
  });

const ported = new Map<string, string[]>();
for (const file of files(join(root, "test"))) {
  for (const match of readFileSync(file, "utf8").matchAll(/py: (tests\/test_\w+\.py::\w+(?:\[[^\]\n]*\])?)/g)) {
    ported.set(match[1], [...(ported.get(match[1]) ?? []), file.slice(root.length + 1)]);
  }
}

const known = new Set(expected);
const stale = [...ported.keys(), ...dropped.keys()].filter((id) => !known.has(id));
const both = expected.filter((id) => ported.has(id) && dropped.has(id));
const missing = expected.filter((id) => !ported.has(id) && !dropped.has(id));

const byFile = new Map<string, { ported: number; dropped: number; missing: number }>();
for (const id of expected) {
  const file = id.split("::")[0];
  const row = byFile.get(file) ?? { ported: 0, dropped: 0, missing: 0 };
  if (ported.has(id)) row.ported++;
  else if (dropped.has(id)) row.dropped++;
  else row.missing++;
  byFile.set(file, row);
}

console.log("python_file\tported\tdropped\tmissing");
for (const [file, row] of [...byFile].sort()) console.log(`${file}\t${row.ported}\t${row.dropped}\t${row.missing}`);
const count = (predicate: (id: string) => boolean) => expected.filter(predicate).length;
console.log(`TOTAL\t${count((id) => ported.has(id))}\t${count((id) => !ported.has(id) && dropped.has(id))}\t${missing.length}`);
for (const id of missing) console.log(`MISSING\t${id}`);
for (const id of stale) console.log(`STALE\t${id}`);
for (const id of both) console.log(`BOTH\t${id}`);
process.exit(missing.length || stale.length || both.length ? 1 : 0);
