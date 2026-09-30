// The operator CLI: the TypeScript replacement for the pilot's cli.py. It reads private local
// inputs, calls the Crowbo HTTP API, writes full results to private reports and prints only a
// bounded summary. It never prints input values, evidence or credentials.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CrowboError } from "../domain/errors";
import { apiToken, keychainToken, outsideCheckout, readPrivate, reportName, runtimeDirectory, writePrivateNew, writeReport } from "./private";

export type Deps = {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  env: Record<string, string | undefined>;
  keychain: () => string | null;
  out: (line: string) => void;
  err: (line: string) => void;
};

const defaultDeps = (): Deps => ({
  fetch: (input, init) => fetch(input, init),
  env: process.env,
  keychain: keychainToken,
  out: (line) => process.stdout.write(line + "\n"),
  err: (line) => process.stderr.write(line + "\n"),
});

type Spec = { args: "none" | "one" | "many"; options?: Record<string, "value" | "flag">; required?: string[]; choices?: Record<string, string[]>; ints?: string[] };

const COMMANDS: Record<string, Spec> = {
  "create-experiment": { args: "none", options: { "max-requests": "value", "max-models": "value" }, required: ["max-requests", "max-models"], ints: ["max-requests", "max-models"] },
  "experiment-status": { args: "none" },
  ingest: { args: "one" },
  resume: { args: "none" },
  list: { args: "none" },
  inspect: { args: "one" },
  search: { args: "none", options: { "query-file": "value", mode: "value" }, required: ["query-file"], choices: { mode: ["semantic", "keyword"] } },
  review: { args: "one" },
  "inspect-review": { args: "one" },
  decide: { args: "one" },
  "inspect-decision": { args: "one" },
  "export-decision": { args: "many", options: { output: "value" }, required: ["output"] },
  "record-feedback": { args: "one" },
  "inspect-feedback": { args: "one" },
  "sync-slack": { args: "one", options: { capture: "value", force: "flag" } },
  "sync-status": { args: "one" },
  "standing-ask": { args: "one" },
  "standing-survey": { args: "one" },
};

const GLOBAL: Partial<Record<string, "value">> = { api: "value", "runtime-dir": "value" };

const USAGE =
  "usage: crowbo [--api URL] [--runtime-dir DIR] {" + Object.keys(COMMANDS).join(",") + "} ...";

const SCHEMA_ERROR = "Input or stored record failed schema validation; no input values printed";
const LOCAL_ERROR = "Local input, provider response or private output is unavailable or invalid";

class UsageError extends Error {}
/** A local input that is not JSON: Python's pydantic `model_validate_json` reported it as a schema failure. */
class SchemaError extends Error {}

type Parsed = { operation: string; args: string[]; options: Record<string, string | boolean> };

export function parseArgs(argv: readonly string[]): Parsed {
  let operation: string | null = null;
  const args: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--") && token.length > 2) {
      const [name, inline] = token.slice(2).split(/=(.*)/s, 2);
      const kind: "value" | "flag" | undefined = GLOBAL[name] ?? (operation ? COMMANDS[operation].options?.[name] : undefined);
      if (!kind) throw new UsageError(`unrecognized argument: --${name}`);
      if (kind === "flag") {
        if (inline !== undefined) throw new UsageError(`argument --${name}: ignored explicit argument`);
        options[name] = true;
      } else {
        const value = inline ?? argv[++i];
        if (value === undefined) throw new UsageError(`argument --${name}: expected one argument`);
        options[name] = value;
      }
    } else if (operation === null) {
      if (!Object.hasOwn(COMMANDS, token)) throw new UsageError(`invalid choice: ${JSON.stringify(token)}`);
      operation = token;
    } else {
      args.push(token);
    }
  }
  if (operation === null) throw new UsageError("the following arguments are required: operation");
  const spec = COMMANDS[operation];
  const expected = { none: [0, 0], one: [1, 1], many: [1, Infinity] }[spec.args];
  if (args.length < expected[0]) throw new UsageError("the following arguments are required: input");
  if (args.length > expected[1]) throw new UsageError("unrecognized arguments");
  for (const name of spec.required ?? []) if (options[name] === undefined) throw new UsageError(`the following arguments are required: --${name}`);
  for (const [name, allowed] of Object.entries(spec.choices ?? {})) {
    if (options[name] !== undefined && !allowed.includes(options[name] as string)) throw new UsageError(`argument --${name}: invalid choice`);
  }
  for (const name of spec.ints ?? []) {
    if (options[name] !== undefined && !/^\s*[-+]?\d+\s*$/.test(options[name] as string)) throw new UsageError(`argument --${name}: invalid int value`);
  }
  return { operation, args, options };
}

/** Python `json.dumps(value)`: default separators and ASCII escapes, so summaries print identically. */
export function pyDumps(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(pyDumps).join(", ")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).map(([k, v]) => `${pyDumps(k)}: ${pyDumps(v)}`).join(", ")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value).replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return value === undefined ? "null" : JSON.stringify(value);
}

function json(bytes: Buffer): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new SchemaError();
  }
}

/** The API base URL. The bearer token only travels over HTTPS, or plain HTTP to loopback. */
function apiBase(value: string | undefined): string {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new CrowboError("Crowbo API address is unavailable; set --api or CROWBO_API");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!(url.protocol === "https:" || (url.protocol === "http:" && loopback)) || url.username || url.password || url.search || url.hash) {
    throw new CrowboError("Crowbo API address must use HTTPS unless it is a loopback address");
  }
  return url.href.replace(/\/+$/, "");
}

/** Python truthiness for a record's `errors` field. */
const truthy = (value: unknown) =>
  Array.isArray(value) ? value.length > 0 : value && typeof value === "object" ? Object.keys(value).length > 0 : Boolean(value);

const pendingWork = (value: any) =>
  !!value && typeof value === "object" && (truthy(value.errors) || value.status === "conflicting_revision" || value.status === "access_denied");

/** Build the API call for an operation from its private local inputs. */
function request(parsed: Parsed): { name: string; body: unknown } {
  const { operation: op, args, options } = parsed;
  const [first] = args;
  switch (op) {
    case "create-experiment":
      return { name: "create_experiment", body: { max_requests: Number.parseInt(options["max-requests"] as string, 10), max_models: Number.parseInt(options["max-models"] as string, 10) } };
    case "experiment-status":
      return { name: "experiment_status", body: {} };
    case "ingest":
      return { name: "ingest", body: json(readPrivate(first)) };
    case "resume":
    case "list":
      return { name: op, body: {} };
    case "inspect":
      return { name: "inspect", body: { source_ids: [first] } };
    case "search": {
      const query = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(readPrivate(options["query-file"] as string, 4000));
      return { name: "search", body: { query, mode: options.mode ?? "semantic" } };
    }
    case "review":
    case "decide":
    case "record-feedback":
      return { name: op.replace("-", "_"), body: json(readPrivate(first, 30000)) };
    case "inspect-review":
    case "inspect-decision":
    case "inspect-feedback":
      return { name: op.replace("-", "_"), body: { id: first } };
    case "export-decision":
      if (args.length < 1 || args.length > 5) throw new CrowboError("Select one to five saved versions");
      return { name: "export_decision", body: { ids: args } };
    case "sync-slack": {
      const spec = json(readPrivate(first, 20000));
      let captures: unknown = null;
      if (options.capture !== undefined) {
        const bytes = readPrivate(options.capture as string);
        try {
          captures = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
        } catch {
          throw new TypeError("capture is not JSON");
        }
      }
      return { name: "sync_slack", body: { spec, captures, force: options.force === true } };
    }
    case "sync-status":
      return { name: "sync_status", body: { spec: json(readPrivate(first, 20000)) } };
    case "standing-ask":
      return { name: "standing_ask", body: json(readPrivate(first, 20000)) };
    case "standing-survey":
      return { name: "standing_survey", body: { workflow: first } };
    default:
      throw new UsageError("unknown operation");
  }
}

/** Records from an API result, as the Python CLI listed them in its report. */
function records(operation: string, result: any): unknown[] {
  if (["ingest", "resume", "list", "inspect", "search"].includes(operation)) {
    if (!result || !Array.isArray(result.records)) throw new TypeError("records missing");
    return result.records;
  }
  return [result];
}

async function call(deps: Deps, base: string, token: string, name: string, body: unknown): Promise<Response> {
  const response = await deps.fetch(`${base}/v1/operations/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  if (response.ok) return response;
  let message: unknown = null;
  try {
    message = ((await response.json()) as any)?.error;
  } catch {
    // Non-JSON error body: fall through to the bounded local message.
  }
  if (typeof message === "string" && message.length > 0 && message.length <= 300) throw new CrowboError(message);
  throw new TypeError("API request failed");
}

export async function main(argv: readonly string[], overrides: Partial<Deps> = {}): Promise<number> {
  const deps = { ...defaultDeps(), ...overrides };
  let parsed: Parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    deps.err(USAGE);
    deps.err(`crowbo: error: ${error instanceof UsageError ? error.message : "invalid arguments"}`);
    return 2;
  }
  const op = parsed.operation;
  try {
    const base = apiBase((parsed.options.api as string | undefined) ?? deps.env.CROWBO_API);
    const { name, body } = request(parsed);
    const reported = !["create-experiment", "experiment-status", "export-decision"].includes(op);
    const directory = reported
      ? runtimeDirectory((parsed.options["runtime-dir"] as string | undefined) ?? deps.env.CROWBO_RUNTIME_DIR ?? join(homedir(), ".crowbo", "runtime"))
      : null;
    let output: string | null = null;
    if (op === "export-decision") {
      output = outsideCheckout(parsed.options.output as string);
      if (existsSync(output)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
    }
    const token = apiToken(deps.env, deps.keychain);
    const response = await call(deps, base, token, name, body);

    if (op === "export-decision") {
      if (!(response.headers.get("content-type") ?? "").startsWith("text/html")) throw new TypeError("expected HTML");
      const path = writePrivateNew(output!, await response.text());
      deps.out(pyDumps({ private_snapshot: path, versions: parsed.args.length }));
      return 0;
    }
    const result = await response.json();
    if (!reported) {
      deps.out(pyDumps(result));
      return 0;
    }
    const values = records(op, result);
    const report = writeReport(directory!, reportName(op), {
      operation: op,
      population_complete: false,
      retrieval_mode: op === "search" ? (parsed.options.mode ?? "semantic") : null,
      records: values,
    });
    const pending = values.filter(pendingWork).length;
    deps.out(pyDumps({ operation: op, record_count: values.length, records_with_pending_work: pending, private_report: report }));
    return pending ? 2 : 0;
  } catch (error) {
    if (error instanceof SchemaError) deps.out(pyDumps({ error: SCHEMA_ERROR }));
    else if (error instanceof CrowboError) deps.out(pyDumps({ error: error.message }));
    else deps.out(pyDumps({ error: LOCAL_ERROR }));
    return 2;
  }
}

if (import.meta.main) {
  process.umask(0o077);
  process.exit(await main(process.argv.slice(2)));
}
