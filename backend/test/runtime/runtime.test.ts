// Port of tests/test_runtime.py. The pilot's per-operator SQLite ledger is now SqlLedger inside
// the tenant Durable Object; here it runs over node:sqlite (test/support/sqlite.ts), where each
// SqliteStorage is one connection, so reopening a file is a restart and two processes are two
// concurrent writers. The private-file rules moved to the operator CLI (src/cli/private.ts).
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiToken, outsideCheckout, readPrivate, runtimeDirectory, writeReport } from "../../src/cli/private";
import { CrowboError } from "../../src/domain/errors";
import { type Settings, settings as settingsSchema } from "../../src/domain/settings";
import { SqlLedger } from "../../src/storage/sql-store";
import { makeSettings } from "../helpers";
import { SqliteStorage } from "../support/sqlite";

let tmp: string;
let db: string;
const open: SqliteStorage[] = [];

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "crowbo-runtime-"));
  db = join(tmp, "tenant.sqlite3");
});
afterEach(() => {
  for (const storage of open.splice(0)) {
    try {
      storage.close();
    } catch {
      // already closed
    }
  }
  rmSync(tmp, { recursive: true, force: true });
});

/** Python `Runtime(settings)`: a fresh connection to the same durable ledger. */
function runtime(settings: Settings) {
  const storage = new SqliteStorage(db);
  open.push(storage);
  return { storage, ledger: new SqlLedger(storage.storage, settings) };
}

const withSettings = (base: Settings, update: Partial<Record<keyof Settings, unknown>>) => settingsSchema.parse({ ...base, ...update });

async function rejects(promise: Promise<unknown> | (() => unknown), pattern: RegExp) {
  const run = typeof promise === "function" ? Promise.resolve().then(promise) : promise;
  const error = await run.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CrowboError);
  expect((error as Error).message).toMatch(pattern);
}

describe("provider allowance ledger", () => {
  it("py: tests/test_runtime.py::test_request_allowance_persists_across_restart", async () => {
    const settings = withSettings(makeSettings(), { max_provider_calls: 1 });
    const first = runtime(settings);
    await first.ledger.reserve("test", "operation");
    first.storage.close();
    const second = runtime(settings);
    await rejects(second.ledger.reserve("test", "operation"), /allowance exhausted/);
  });

  it("py: tests/test_runtime.py::test_conservative_cost_reservation_stops_requests", async () => {
    const { ledger } = runtime(withSettings(makeSettings(), { budget_usd: "0.05" }));
    await ledger.reserve("test", "operation");
    await rejects(ledger.reserve("test", "operation"), /reservation exhausted/);
  });

  it("py: tests/test_runtime.py::test_explicit_allowance_extension_keeps_previous_reservations", async () => {
    const base = makeSettings();
    const first = runtime(withSettings(base, { max_provider_calls: 1, budget_usd: "0.05" }));
    await first.ledger.reserve("test", "previous_request");
    first.storage.close();
    const second = runtime(withSettings(base, { max_provider_calls: 2, budget_usd: "0.10" }));
    await second.ledger.reserve("test", "new_request");
    await rejects(second.ledger.reserve("test", "another_request"), /allowance exhausted/);
    expect(second.storage.sql.exec("SELECT operation FROM calls ORDER BY id").toArray()).toEqual([
      { operation: "previous_request" },
      { operation: "new_request" },
    ]);
  });

  it("py: tests/test_runtime.py::test_experiment_is_explicit_durable_and_does_not_reset_old_calls", async () => {
    let settings = makeSettings();
    let rt = runtime(settings);
    await rt.ledger.reserve("test", "legacy");
    rt.storage.close();
    settings = withSettings(settings, { experiment_id: "test-one", budget_usd: "0.05" });
    rt = runtime(settings);
    await rejects(rt.ledger.reserve("test", "read"), /operator must create/);
    rt.ledger.createExperiment(3, 1);
    await rt.ledger.reserve("jev", "assess");
    rt.storage.close();
    rt = runtime(settings);
    expect(rt.ledger.createExperiment(3, 1).model_calls).toBe(1);
    await rejects(() => rt.ledger.createExperiment(4, 2), /cannot be changed/);
    await rejects(rt.ledger.reserve("glm", "review"), /model-call allowance/);
    await rt.ledger.reserve("turbopuffer", "read");
    await rt.ledger.reserve("turbopuffer", "read");
    await rejects(rt.ledger.reserve("turbopuffer", "read"), /request allowance/);
    expect(rt.storage.sql.exec<{ n: number }>("SELECT count(*) AS n FROM calls").one().n).toBe(4);
    expect(rt.ledger.experimentStatus().requests).toBe(3);
  });

  for (const [name, identity] of [
    ["py: tests/test_runtime.py::test_experiment_cannot_be_claimed_by_another_identity[identity0]", { reader: "other" }],
    ["py: tests/test_runtime.py::test_experiment_cannot_be_claimed_by_another_identity[identity1]", { tenant: "other" }],
  ] as const) {
    it(name, async () => {
      const settings = withSettings(makeSettings(), { experiment_id: "test-one" });
      const owner = runtime(settings);
      owner.ledger.createExperiment(3, 1);
      const other = runtime(withSettings(settings, identity));
      await rejects(other.ledger.reserve("glm", "review"), /unavailable/);
      await rejects(() => other.ledger.createExperiment(3, 1), /cannot be changed/);
      expect(owner.ledger.experimentStatus().requests).toBe(0);
    });
  }

  it("py: tests/test_runtime.py::test_new_experiment_does_not_require_a_fabricated_dollar_budget", async () => {
    const data: Record<string, unknown> = { ...makeSettings(), experiment_id: "no-dollar-estimate" };
    delete data.budget_usd;
    const settings = settingsSchema.parse(data);
    expect(settings.budget_usd).toBeNull();
    const { ledger } = runtime(settings);
    ledger.createExperiment(2, 1);
    await ledger.reserve("glm", "review");
    await ledger.reserve("turbopuffer", "query");
    expect(ledger.experimentStatus().requests).toBe(2);
  });

  it("legacy settings without a budget or an experiment are rejected", () => {
    const data: Record<string, unknown> = { ...makeSettings() };
    delete data.budget_usd;
    const parsed = settingsSchema.safeParse(data);
    expect(parsed.success).toBe(false);
    expect(parsed.error!.issues.map((i) => i.message)).toContain("legacy settings require a cost reservation or an explicit experiment");
  });

  it("py: tests/test_runtime.py::test_concurrent_reservations_cannot_overspend_one_remaining_request", async () => {
    const settings = withSettings(makeSettings(), { experiment_id: "one-remaining" });
    const setup = runtime(settings);
    setup.ledger.createExperiment(1, 1);
    setup.storage.close();

    // Two OS processes, each with its own connection, reserve at the same moment.
    const script = fileURLToPath(new URL("../support/reserve-process.ts", import.meta.url).href);
    const register = fileURLToPath(new URL("../support/ts-register.mjs", import.meta.url).href);
    const workers = [0, 1].map(() => {
      const child = spawn(process.execPath, ["--experimental-transform-types", "--no-warnings", "--import", register, script, db, JSON.stringify(settings)], {
        stdio: ["pipe", "pipe", "inherit"],
      });
      const lines = createInterface({ input: child.stdout! })[Symbol.asyncIterator]();
      return { child, next: async () => (await lines.next()).value as string };
    });
    for (const worker of workers) expect(await worker.next()).toBe("ready");
    for (const worker of workers) worker.child.stdin!.write("go\n");
    const results = (await Promise.all(workers.map((w) => w.next()))).map((line) => JSON.parse(line));
    await Promise.all(workers.map((w) => new Promise((done) => (w.child.exitCode !== null ? done(null) : w.child.on("exit", done)))));
    expect(results.sort()).toEqual(["Experiment request allowance exhausted", "reserved"]);
    expect(runtime(settings).ledger.experimentStatus().requests).toBe(1);
  }, 30_000);
});

describe("private local files", () => {
  it("py: tests/test_runtime.py::test_private_inputs_reject_checkouts_and_shared_permissions", () => {
    expect(() => outsideCheckout(fileURLToPath(import.meta.url))).toThrow(/checkout/);
    const path = join(tmp, "input.json");
    writeFileSync(path, "synthetic");
    chmodSync(path, 0o644);
    expect(() => readPrivate(path)).toThrow(/owner-only/);
    chmodSync(path, 0o600);
    expect(readPrivate(path).toString()).toBe("synthetic");
    expect(() => readPrivate(path, 2)).toThrow(/size limit/);
  });

  it("rejects files inside any Git checkout", () => {
    const repository = join(tmp, "other-repository");
    mkdirSync(join(repository, ".git", "objects"), { recursive: true });
    expect(() => outsideCheckout(join(repository, "nested", "input.json"))).toThrow("Private runtime files must be outside Git checkouts");
  });

  it("py: tests/test_runtime.py::test_reports_and_database_are_private", () => {
    // The database half has no local file any more: it is Durable Object storage.
    const directory = runtimeDirectory(join(tmp, "runtime"));
    const report = writeReport(directory, "test.json", { basis: "synthetic" });
    expect(statSync(report).mode & 0o777).toBe(0o600);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(() => writeReport(directory, "test.json", { basis: "synthetic" })).toThrow(expect.objectContaining({ code: "EEXIST" }));
    chmodSync(directory, 0o755);
    expect(() => runtimeDirectory(directory)).toThrow("Runtime directory requires owner-only permissions (chmod 700)");
  });
});

describe("API credential", () => {
  const good = "a".repeat(16);

  it("prefers CROWBO_TOKEN and falls back to the Keychain", () => {
    expect(apiToken({ CROWBO_TOKEN: good }, () => "unused")).toBe(good);
    expect(apiToken({}, () => "k".repeat(2048))).toBe("k".repeat(2048));
  });

  it("applies the pilot's secret() validation without echoing the value", () => {
    for (const bad of [null, "", "a".repeat(15), "a".repeat(2049), `${good} x`, `${good}\t`, `${good}é`, `${good}\x1f`]) {
      expect(() => apiToken({}, () => bad)).toThrow("Required Crowbo API credential is unavailable");
    }
  });
});
