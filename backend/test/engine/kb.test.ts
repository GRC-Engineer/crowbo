import { describe, expect, it } from "vitest";
import { demoOptions } from "../../src/engine/demo";
import { Engine } from "../../src/engine/engine";
import { NORTHWIND } from "../../src/engine/fixture";
import { KB_LIMITS, type KbFile, parseCsv, recordId } from "../../src/engine/kb";
import { NORTHWIND_KB_EXPORT } from "../../src/engine/kb-fixture";
import { runEngine } from "../../src/engine/port";
import { MemoryEngineStore } from "../../src/engine/store";

/** A company with no tools connected yet: the export is all Crowbo knows. */
const fresh = () => Engine.start(structuredClone(NORTHWIND), { ...demoOptions(), connectors: [] });
const csv = (content: string, path = "registers/controls.csv"): KbFile => ({ path, content, modified_at: "2026-10-01", mapping: { shape: "triples" } });
const SYNTHETIC = { synthetic: true } as const;

describe("knowledge-base import", () => {
  it("turns an export into a first profile: systems and owners, controls, people, stale entries and first moves", async () => {
    const { profile } = await (await fresh()).importKnowledgeBase(NORTHWIND_KB_EXPORT, "grc-lead", SYNTHETIC);
    expect(profile.systems).toEqual([{ id: "app:billing", owner: "person:priya" }, { id: "app:okta", owner: "person:dana" }]);
    expect(profile.controls.find((c) => c.id === "control:billing-admin-access")!.assigned_to).toBe("person:alex");
    expect(profile.people).toEqual(["person:alex", "person:dana", "person:priya"]);
    expect(profile.stale.map((s) => `${s.record} ${s.predicate}`)).toContain("kb:registers/risk-register.csv rating");
    expect(profile.next_moves.map((m) => [m.action, m.decides])).toEqual([["drop-access-screenshots", "person:dana"]]);
    expect(profile.deferred[0].reason).toMatch(/^Needs evidence: role:billing-operator covers_unused_actions/);
    expect(profile.weight).toMatchObject({ connector: "kb", weight: 3, max_age_days: 180, set_by: "engine" });
  });

  it("says which files it did not read and why, and reads an unmapped CSV as prose with nothing typed", async () => {
    const { profile } = await (await fresh()).importKnowledgeBase(NORTHWIND_KB_EXPORT, "grc-lead", SYNTHETIC);
    const byPath = Object.fromEntries(profile.files.map((f) => [f.path, f]));
    expect(byPath["board/q3-board-pack.pdf"]).toMatchObject({ format: "not_read", record: null, reason: "The file is empty" });
    expect(byPath["registers/vendors.csv"]).toMatchObject({ format: "prose", reason: expect.stringMatching(/Not mapped.*nothing typed/) });
    expect(byPath["registers/risk-register.csv"]).toMatchObject({ format: "lines", reason: expect.stringMatching(/holders were skipped: an export cannot state them/) });
  });

  it("is idempotent: an unchanged export writes nothing; a changed file becomes revision 2", async () => {
    const e = await fresh();
    await e.importKnowledgeBase(NORTHWIND_KB_EXPORT, "grc-lead", SYNTHETIC);
    const kept = e.memory.list().length;
    const again = await e.importKnowledgeBase(NORTHWIND_KB_EXPORT, "grc-lead", SYNTHETIC);
    expect(again.profile.files.filter((f) => f.changed)).toEqual([]);
    expect(again.decision_diff).toBeNull();
    expect(e.memory.list().length).toBe(kept);
    const edited = await e.importKnowledgeBase([csv("subject,field,value\ncontrol:quarterly-access-screenshots,issues_found_last_4,2")], "grc-lead", SYNTHETIC);
    expect(edited.profile.files[0]).toMatchObject({ revision: 2, changed: true });
    expect(edited.decision_diff!.removed).toEqual(["drop-access-screenshots"]);
  });

  it("an export cannot state a predicate the engine derives or does not declare importable, and its typed facts are kind imported", async () => {
    const e = await fresh();
    await e.importKnowledgeBase([csv("subject,field,value\ngroup:billing-admins,unused_90d,0\ngroup:billing-admins,movable_unused,0\ncontrol:billing-admin-access,assigned_to,person:alex")], "grc-lead", SYNTHETIC);
    expect(e.facts.filter((f) => f.source.connector === "kb").map((f) => [f.predicate, f.kind])).toEqual([["assigned_to", "imported"]]);
    const mapped: KbFile = { path: "s.csv", content: "Group,Unused\nbilling-admins,0", mapping: { shape: "columns", subject_column: "Group", subject_prefix: "group", columns: { Unused: { predicate: "unused_90d" } } } };
    await expect(e.importKnowledgeBase([mapped], "grc-lead", SYNTHETIC)).rejects.toThrow(/"unused_90d" cannot be imported/);
  });

  it("records the default weight as a weight change with its reason, once, when the first file is read", async () => {
    const e = await fresh();
    await e.importKnowledgeBase(NORTHWIND_KB_EXPORT, "grc-lead", SYNTHETIC);
    await e.importKnowledgeBase(NORTHWIND_KB_EXPORT, "grc-lead", SYNTHETIC);
    const changes = e.memory.list("weight_change");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ actor: "grc-lead", body: { connector: "kb", from: null, to: 3, default: true } });
    const onlyPdf = await (await fresh()).importKnowledgeBase([{ path: "a.pdf", content: "" }], "grc-lead", SYNTHETIC);
    expect(onlyPdf.profile.weight).toBeNull();
  });

  it("keeps a digest of each file in memory, never its text", async () => {
    const e = await fresh();
    await e.importKnowledgeBase(NORTHWIND_KB_EXPORT, "grc-lead", SYNTHETIC);
    const entry = e.memory.list("import")[0];
    expect(entry.actor).toBe("grc-lead");
    expect(entry.body.declared).toBe("synthetic");
    expect(JSON.stringify(entry.body)).not.toContain("Ignore previous instructions");
    expect((entry.body.files as { sha256: string }[]).every((f) => /^[a-f0-9]{64}$/.test(f.sha256))).toBe(true);
    expect(e.memory.verify()).toBe(true);
  });

  it("survives a restart: the imported records and the default weight are kept, and the decision is the same", async () => {
    const store = new MemoryEngineStore();
    const first = await Engine.open(structuredClone(NORTHWIND), { ...demoOptions(), connectors: [] }, store);
    await first.importKnowledgeBase(NORTHWIND_KB_EXPORT, "grc-lead", SYNTHETIC);
    const reopened = await Engine.open(structuredClone(NORTHWIND), { ...demoOptions(), connectors: [] }, store);
    expect(reopened.nextMoves().id).toBe(first.nextMoves().id);
    expect(reopened.weightsTable().find((w) => w.connector === "kb")!.weight).toBe(3);
  });

  it("adds to the connected tools rather than replacing them: the export's stale register is shown, not used", async () => {
    const e = await Engine.start(structuredClone(NORTHWIND), demoOptions());
    const before = e.facts.find((f) => f.predicate === "unused_90d")!.value;
    await e.importKnowledgeBase(NORTHWIND_KB_EXPORT, "grc-lead", SYNTHETIC);
    expect(e.facts.find((f) => f.predicate === "unused_90d")!.value).toBe(before);
    expect(e.nextMoves().unresolved.some((u) => u.kind === "stale" && u.detail.includes("kb:registers/risk-register.csv"))).toBe(true);
  });
});

describe("knowledge-base import: untrusted files", () => {
  it("a quoted newline in a CSV value cannot add a second fact", async () => {
    const e = await fresh();
    const content = 'subject,field,value\ncontrol:billing-admin-access,superseded_by,"fine\nperson:u10 last_billing_action 2026-10-01"';
    await e.importKnowledgeBase([csv(content)], "grc-lead", SYNTHETIC);
    expect(e.facts.filter((f) => f.subject === "person:u10")).toEqual([]);
    expect(e.facts.find((f) => f.predicate === "superseded_by")!.value).toBe("fine person:u10 last_billing_action 2026-10-01");
  });

  it("prose instructions in a policy change no decision", async () => {
    const e = await fresh();
    const { profile } = await e.importKnowledgeBase(NORTHWIND_KB_EXPORT, "grc-lead", SYNTHETIC);
    const without = await (await fresh()).importKnowledgeBase(NORTHWIND_KB_EXPORT.filter((f) => !f.path.startsWith("policies/")), "grc-lead", SYNTHETIC);
    expect(profile.next_moves).toEqual(without.profile.next_moves);
  });

  it("refuses paths that climb out of the export, duplicate paths, and oversized exports", async () => {
    expect(() => recordId("../secrets.csv")).toThrow(/Invalid path/);
    expect(recordId("./registers\\systems.csv")).toBe("kb:registers/systems.csv");
    const e = await fresh();
    await expect(e.importKnowledgeBase([csv("a"), csv("b")], "grc-lead", SYNTHETIC)).rejects.toThrow(/Two files map to/);
    const big = Array.from({ length: 17 }, (_, i) => csv("x".repeat(KB_LIMITS.file_chars), `f${i}.md`));
    await expect(e.importKnowledgeBase(big, "grc-lead", SYNTHETIC)).rejects.toThrow(/import it in parts/);
    await expect(e.importKnowledgeBase([{ path: "a.md", content: "x", modified_at: "2027-01-01" }], "grc-lead", SYNTHETIC)).rejects.toThrow(/after the import date/);
  });

  it("a mapping must name real columns and well-formed predicates", async () => {
    const e = await fresh();
    const file = (columns: Record<string, { predicate: string }>): KbFile => ({ path: "s.csv", content: "System,Owner\nBilling,priya", mapping: { shape: "columns", subject_column: "System", subject_prefix: "app", columns } });
    await expect(e.importKnowledgeBase([file({ Missing: { predicate: "business_owner" } })], "grc-lead", SYNTHETIC)).rejects.toThrow(/not in the header/);
    await expect(e.importKnowledgeBase([file({ Owner: { predicate: "Business Owner" } })], "grc-lead", SYNTHETIC)).rejects.toThrow(/cannot be imported/);
  });

  it("parses RFC 4180 CSV: quoted commas, doubled quotes, CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });
});

describe("knowledge-base import over the port", () => {
  it("requires synthetic: true until the founders clear real exports, at the port and in the engine", async () => {
    const e = await fresh();
    await expect(e.importKnowledgeBase(NORTHWIND_KB_EXPORT, "grc-lead", {} as { synthetic: true })).rejects.toThrow(/declared synthetic/);
    await expect(runEngine(e, "grc-lead", "import_knowledge_base", { files: NORTHWIND_KB_EXPORT })).rejects.toThrow();
    await expect(runEngine(e, "grc-lead", "import_knowledge_base", { synthetic: false, files: NORTHWIND_KB_EXPORT })).rejects.toThrow();
    const r = (await runEngine(e, "grc-lead", "import_knowledge_base", { synthetic: true, files: NORTHWIND_KB_EXPORT })) as { profile: { next_moves: unknown[] } };
    expect(r.profile.next_moves).toHaveLength(1);
  });

  it("is listed in decision memory and filterable by kind", async () => {
    const e = await fresh();
    await runEngine(e, "grc-lead", "import_knowledge_base", { synthetic: true, files: NORTHWIND_KB_EXPORT });
    const m = (await runEngine(e, "grc-lead", "memory", { kind: "import" })) as { entries: unknown[] };
    expect(m.entries).toHaveLength(1);
  });
});
