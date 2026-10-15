import { EngineError } from "./errors";
import { line } from "./connectors";
import type { Engine } from "./engine";
import type { Move, SourceRecord, SourceWeight, Unresolved, Value } from "./model";

/**
 * A company's knowledge-base export (policies, registers, the last audit report) read as one more
 * source, "kb". Each file becomes a source record: CSV with a subject/field/value header or an
 * explicit column mapping becomes typed lines; Markdown, text and unmapped CSV become prose for the
 * model extractor. Nothing is guessed: a column is typed only when the header or the mapping says
 * what it means. File text is untrusted data, so typed values go through the same line() check as
 * every connector, and prose facts must quote the file exactly.
 *
 * The profile is the first view of a new company, in the current Scenario and Action shapes. The
 * register (awaiting sign-off) is meant to replace kbProfile at this seam, not the import.
 */

export const KB_CONNECTOR = "kb";

export const KB_LIMITS = { files: 100, file_chars: 256_000, total_chars: 2_000_000, csv_rows: 5_000 } as const;

/** Used until the company sets its own: documents kept by hand, trusted while they are maintained. */
export const KB_DEFAULT_WEIGHT: SourceWeight = {
  connector: KB_CONNECTOR, weight: 3, max_age_days: 180, set_by: "engine",
  reason: "Default for a knowledge-base export: kept by hand, trusted for six months after an edit; change it when you know how well it is maintained",
};

/** Which CSV column names the subject, and what each other column states about it. */
export interface CsvMapping {
  subject_column: string;
  /** Node type for the subject, e.g. "app" turns "Billing" into app:billing. */
  subject_prefix: string;
  /** Column name to predicate; `node_prefix` makes the value a node too (an owner, a control). */
  columns: Record<string, { predicate: string; node_prefix?: string }>;
}

export interface KbFile {
  /** Path inside the export, e.g. "registers/systems.csv". */
  path: string;
  content: string;
  /** Last edit date in the source (YYYY-MM-DD); freshness follows it. Defaults to the import day. */
  modified_at?: string;
  mapping?: CsvMapping;
}

export type KbFormat = "lines" | "prose" | "not_read";

export interface KbFileResult {
  path: string;
  record: string | null;
  format: KbFormat;
  revision: number | null;
  changed: boolean;
  reason?: string;
}

const PREFIX = /^[a-z]+$/;
const PREDICATE = /^[a-z][a-z0-9_]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PROSE = /\.(md|markdown|txt)$/i;
const NOT_YET: Record<string, string> = {
  pdf: "PDF text is not read yet (P1.1); export the file as Markdown or text",
  docx: "DOCX text is not read yet (P1.1); export the file as Markdown or text",
};

/** "Billing App" → "billing-app"; an email keeps its local part, as connectors do for people. */
export const slug = (value: string) =>
  (value.includes("@") ? value.split("@")[0] : value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

/** A stable record id from the path; a path may not climb out of the export. */
export function recordId(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".");
  if (!parts.length || parts.some((p) => p === "..")) throw new EngineError(`Invalid path in the export: ${path.slice(0, 80)}`);
  const id = parts.map((p) => p.replace(/[^A-Za-z0-9._-]+/g, "-")).join("/");
  if (id.length > 200) throw new EngineError(`Path too long: ${path.slice(0, 80)}…`);
  return `${KB_CONNECTOR}:${id}`;
}

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (field += '"', i++);
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") (row.push(field), (field = ""));
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
    if (rows.length > KB_LIMITS.csv_rows) throw new EngineError(`A CSV may have at most ${KB_LIMITS.csv_rows} rows`);
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

function typedLines(rows: string[][], mapping: CsvMapping | undefined): string[] | null {
  const [header, ...body] = rows;
  if (!header) return null;
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.trim().toLowerCase());
  if (!mapping) {
    const [s, f, v] = [col("subject"), col("field"), col("value")];
    return s < 0 || f < 0 || v < 0 ? null : body.flatMap((r) => line((r[s] ?? "").trim(), (r[f] ?? "").trim(), (r[v] ?? "").trim()));
  }
  if (!PREFIX.test(mapping.subject_prefix)) throw new EngineError(`subject_prefix must be lowercase letters, e.g. app`);
  const subject = col(mapping.subject_column);
  if (subject < 0) throw new EngineError(`Mapped column "${mapping.subject_column}" is not in the header`);
  const columns = Object.entries(mapping.columns).map(([name, spec]) => {
    const i = col(name);
    if (i < 0) throw new EngineError(`Mapped column "${name}" is not in the header`);
    if (!PREDICATE.test(spec.predicate)) throw new EngineError(`Predicate "${spec.predicate}" must be lowercase words joined by underscores`);
    if (spec.node_prefix !== undefined && !PREFIX.test(spec.node_prefix)) throw new EngineError(`node_prefix must be lowercase letters, e.g. person`);
    return { i, ...spec };
  });
  return body.flatMap((r) => {
    const name = slug(r[subject] ?? "");
    if (!name) return [];
    return columns.flatMap(({ i, predicate, node_prefix }) => {
      const raw = (r[i] ?? "").trim();
      if (!raw) return [];
      return line(`${mapping.subject_prefix}:${name}`, predicate, node_prefix ? `${node_prefix}:${slug(raw)}` : raw);
    });
  });
}

/** Rows of a CSV nobody mapped, as prose: the extractor may read them, but nothing is typed. */
const csvProse = (rows: string[][]) => {
  const [header, ...body] = rows;
  return body.map((r, n) => `Row ${n + 1}. ${header.map((h, i) => `${h.trim()}: ${(r[i] ?? "").trim()}`).filter((c) => !c.endsWith(": ")).join("; ")}.`).join("\n");
};

/** One file as a source record (revision assigned by the engine), or the reason it was not read. */
export function toRecord(file: KbFile, viewer: string, importedOn: string): { record: Omit<SourceRecord, "revision"> | null; format: KbFormat; reason?: string } {
  const id = recordId(file.path);
  const ext = file.path.split(".").at(-1)?.toLowerCase() ?? "";
  if (file.modified_at !== undefined && (!DATE.test(file.modified_at) || Number.isNaN(Date.parse(file.modified_at)))) throw new EngineError(`modified_at must be a date (YYYY-MM-DD): ${file.path.slice(0, 80)}`);
  if (file.modified_at && file.modified_at > importedOn) throw new EngineError(`modified_at is after the import date: ${file.path.slice(0, 80)}`);
  if (file.mapping && ext !== "csv") throw new EngineError(`A column mapping applies to CSV files only: ${file.path.slice(0, 80)}`);
  const base = { id, connector: KB_CONNECTOR, rail: "business" as const, observed_at: file.modified_at ?? importedOn, readers: [viewer], label: file.path.split("/").at(-1) };
  if (ext === "csv") {
    const rows = parseCsv(file.content);
    const lines = typedLines(rows, file.mapping);
    if (lines) return { record: { ...base, format: "lines", text: lines.join("\n") }, format: "lines" };
    return { record: { ...base, format: "prose", text: csvProse(rows) }, format: "prose", reason: "No subject/field/value header and no mapping: read as prose, nothing typed" };
  }
  if (PROSE.test(file.path)) return { record: { ...base, format: "prose", text: file.content }, format: "prose" };
  return { record: null, format: "not_read", reason: NOT_YET[ext] ?? `.${ext.slice(0, 10)} files are not read; export as Markdown, text or CSV` };
}

export function checkLimits(files: KbFile[]) {
  if (!files.length) throw new EngineError("The export has no files");
  if (files.length > KB_LIMITS.files) throw new EngineError(`At most ${KB_LIMITS.files} files per import`);
  let total = 0;
  const seen = new Set<string>();
  for (const f of files) {
    if (f.content.length > KB_LIMITS.file_chars) throw new EngineError(`${f.path.slice(0, 80)} is over ${KB_LIMITS.file_chars} characters`);
    total += f.content.length;
    const id = recordId(f.path);
    if (seen.has(id)) throw new EngineError(`Two files map to ${id}`);
    seen.add(id);
  }
  if (total > KB_LIMITS.total_chars) throw new EngineError(`The export is over ${KB_LIMITS.total_chars} characters; import it in parts`);
}

// ---- The first profile ---------------------------------------------------------------------------

export interface KbProfile {
  company: string;
  as_of: string;
  files: KbFileResult[];
  facts: { total: number; from_export: number; rejected_unquoted: number };
  systems: { id: string; owner: string | null }[];
  controls: { id: string; assigned_to: string | null; facts: Record<string, Value> }[];
  people: string[];
  stale: { subject: string; predicate: string; value: Value; record: string; reason: string }[];
  conflicting: Unresolved[];
  next_moves: Pick<Move, "action" | "title" | "mode" | "decides" | "delivers" | "due">[];
  deferred: { action: string; reason: string }[];
  weight: SourceWeight;
}

/** What Crowbo now knows about the company: systems and owners, controls, people, stale entries, first moves. */
export function kbProfile(engine: Engine, files: KbFileResult[]): KbProfile {
  const usable = engine.facts.filter((f) => f.freshness === "fresh");
  const nodes = (prefix: string) =>
    [...new Set([...usable.map((f) => f.subject), ...engine.graph.all().flatMap((e) => [e.from, e.to])].filter((n) => n.startsWith(`${prefix}:`)))].sort();
  const decision = engine.nextMoves();
  return {
    company: engine.fixture.company,
    as_of: engine.asOf(),
    files,
    facts: { total: engine.facts.length, from_export: engine.facts.filter((f) => f.source.connector === KB_CONNECTOR).length, rejected_unquoted: engine.rejected },
    systems: nodes("app").map((id) => ({ id, owner: engine.graph.follow(id, "business_owner") })),
    controls: nodes("control").map((id) => ({
      id, assigned_to: engine.graph.follow(id, "assigned_to"),
      facts: Object.fromEntries(usable.filter((f) => f.subject === id && f.predicate !== "assigned_to").map((f) => [f.predicate, f.value])),
    })),
    people: nodes("person"),
    stale: engine.facts.filter((f) => f.freshness === "stale").map((f) => ({ subject: f.subject, predicate: f.predicate, value: f.value, record: f.source.record, reason: f.stale_reason ?? "stale" })),
    conflicting: decision.unresolved.filter((u) => u.kind === "conflicting"),
    next_moves: decision.next_moves.map(({ action, title, mode, decides, delivers, due }) => ({ action, title, mode, decides, delivers, due })),
    deferred: decision.deferred.map(({ action, reason }) => ({ action, reason })),
    weight: engine.weightsTable().find((w) => w.connector === KB_CONNECTOR)!,
  };
}
