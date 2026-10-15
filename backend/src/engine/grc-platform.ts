import { line } from "./line";
import type { Connector, FetchJson, SourceRecord } from "./model";
import { collect, MAX_PAGES } from "./paging";

/**
 * The GRC platform connector, read-only: one class, several providers (Vanta, Drata). A provider
 * reads its own API into one snapshot of controls, vendors and exceptions; the connector turns it
 * into records the same way whichever provider read it.
 *
 * Each record states its own scope, so a join never reasons from silence:
 *  - each list says whether it was read completely ("listing:controls read complete|partial");
 *  - each control states how many risks, obligations and commitments link to it (link_count);
 *  - each vendor states its last review, "never" when the platform has none.
 * Assurance class and coverage are separate facts and are never combined into one score.
 *
 * The provider field names follow each platform's public API as far as known here; they are to be
 * confirmed against a recorded response, which is P2's check. Nothing else about either vendor is
 * encoded.
 */

export const GRC_PLATFORM = "grc-platform";

export interface GrcControl {
  key: string;
  owner: string | null;
  assurance: "automated" | "manual";
  /** Tests passing out of tests run; null when the control has no tests. */
  tests: { passing: number; total: number } | null;
  evidence_at: string | null;
  hours_per_quarter: number | null;
  risks: string[];
  obligations: string[];
  commitments: string[];
}
export interface GrcVendor {
  key: string;
  data_classes: string[];
  last_reviewed_at: string | null;
}
export interface GrcException {
  key: string;
  control: string | null;
  signer: string | null;
  review_by: string | null;
}
/** Each list with the total the provider stated; a list is complete only when it says so. */
export interface GrcSnapshot {
  controls: { list: GrcControl[]; total: number | null };
  vendors: { list: GrcVendor[]; total: number | null };
  exceptions: { list: GrcException[]; total: number | null };
}

export interface GrcProvider {
  id: string;
  label: string;
  snapshot(api: FetchJson): Promise<GrcSnapshot>;
}

const person = (email: string) => `person:${email.split("@")[0].toLowerCase()}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
const node = (prefix: string, s: string) => `${prefix}:${slug(s)}`;
const GRC = ["grc-lead"];

/** A list as read: the items, and how many the provider said there are (null when it did not say). */
type Listing<T> = { list: T[]; total: number | null };

type Page<T> = { results: { data: T[]; pageInfo?: { hasNextPage: boolean; endCursor?: string | null } } };
/** Vanta pages by cursor; complete only when the last page read says there is no next one. */
const vantaPage = async <T extends { id: string }>(api: FetchJson, path: string): Promise<Listing<T>> => {
  const l = await collect<T>(path, async (p) => {
    const r = (await api(p)) as Page<T> | null;
    if (!r) return null;
    const info = r.results.pageInfo;
    return { items: r.results.data, next: info?.hasNextPage === false ? null : info?.hasNextPage && info.endCursor ? `${path}?pageCursor=${encodeURIComponent(info.endCursor)}` : undefined };
  }, (x) => x.id);
  return { list: l.items, total: l.complete ? l.items.length : null };
};

/** Vanta REST API: controls (owner, automation, test results, links), vendors, and exceptions. */
export const vanta: GrcProvider = {
  id: "vanta", label: "Vanta",
  async snapshot(api) {
    type C = { id: string; owner?: { emailAddress: string } | null; isAutomated: boolean; testSummary?: { passing: number; total: number } | null; lastEvidenceAt?: string | null; hoursPerQuarter?: number | null; linkedRisks: string[]; linkedRequirements: string[]; linkedCommitments: string[] };
    type V = { id: string; dataClasses: string[]; lastSecurityReviewAt?: string | null };
    type E = { id: string; controlId?: string | null; approver?: { emailAddress: string } | null; expiresAt?: string | null };
    const [c, v, e] = [await vantaPage<C>(api, "/v1/controls"), await vantaPage<V>(api, "/v1/vendors"), await vantaPage<E>(api, "/v1/exceptions")];
    return {
      controls: { total: c.total, list: c.list.map((x) => ({ key: x.id, owner: x.owner?.emailAddress ?? null, assurance: x.isAutomated ? "automated" : "manual", tests: x.testSummary ?? null, evidence_at: x.lastEvidenceAt ?? null, hours_per_quarter: x.hoursPerQuarter ?? null, risks: x.linkedRisks, obligations: x.linkedRequirements, commitments: x.linkedCommitments })) },
      vendors: { total: v.total, list: v.list.map((x) => ({ key: x.id, data_classes: x.dataClasses, last_reviewed_at: x.lastSecurityReviewAt ?? null })) },
      exceptions: { total: e.total, list: e.list.map((x) => ({ key: x.id, control: x.controlId ?? null, signer: x.approver?.emailAddress ?? null, review_by: x.expiresAt ?? null })) },
    };
  },
};

type DrataList<T> = { data: T[]; total?: number };
/**
 * Drata pages by number against a stated total. Items are counted once by id, so a server that
 * ignores the page number cannot reach the total with repeats: a page of repeats stops the read.
 */
const drataList = async <T>(api: FetchJson, path: string, id: (item: T) => string): Promise<Listing<T>> => {
  const list: T[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  for (let n = 1; n <= MAX_PAGES; n++) {
    const r = (await api(n === 1 ? path : `${path}?page=${n}`)) as DrataList<T> | null;
    if (!r) break;
    const fresh = r.data.filter((x) => !seen.has(id(x)));
    for (const x of fresh) (seen.add(id(x)), list.push(x));
    total = typeof r.total === "number" ? r.total : null;
    if (total === null || list.length >= total || !fresh.length) break;
  }
  // Complete only when the distinct items read reach the stated total.
  return { list, total: total !== null && list.length >= total ? list.length : total };
};

/** Drata public API: controls (owners, monitors, frameworks), vendors, and exceptions. */
export const drata: GrcProvider = {
  id: "drata", label: "Drata",
  async snapshot(api) {
    type C = { code: string; owners: { email: string }[]; monitored: boolean; monitors?: { passing: number; total: number } | null; evidenceUpdatedAt?: string | null; effortHoursPerQuarter?: number | null; risks: { code: string }[]; requirements: { code: string }[]; commitments: { code: string }[] };
    type V = { name: string; dataTypes: string[]; reviewedAt?: string | null };
    type E = { code: string; control?: { code: string } | null; signedBy?: { email: string } | null; reviewDate?: string | null };
    const [c, v, e] = [await drataList<C>(api, "/public/controls", (x) => x.code), await drataList<V>(api, "/public/vendors", (x) => x.name), await drataList<E>(api, "/public/exceptions", (x) => x.code)];
    return {
      controls: { total: c.total, list: c.list.map((x) => ({ key: x.code, owner: x.owners[0]?.email ?? null, assurance: x.monitored ? "automated" : "manual", tests: x.monitors ?? null, evidence_at: x.evidenceUpdatedAt ?? null, hours_per_quarter: x.effortHoursPerQuarter ?? null, risks: x.risks.map((r) => r.code), obligations: x.requirements.map((r) => r.code), commitments: x.commitments.map((r) => r.code) })) },
      vendors: { total: v.total, list: v.list.map((x) => ({ key: x.name, data_classes: x.dataTypes, last_reviewed_at: x.reviewedAt ?? null })) },
      exceptions: { total: e.total, list: e.list.map((x) => ({ key: x.code, control: x.control?.code ?? null, signer: x.signedBy?.email ?? null, review_by: x.reviewDate ?? null })) },
    };
  },
};

export const GRC_PROVIDERS = { vanta, drata } as const;

const complete = (l: { list: unknown[]; total: number | null }) => l.total !== null && l.list.length >= l.total;
const listing = (name: string, l: { list: unknown[]; total: number | null }) => line(`listing:${GRC_PLATFORM}.${name}`, "read", complete(l) ? "complete" : "partial");

export function controlLines(c: GrcControl): string[] {
  const control = node("control", c.key);
  return [
    ...(c.owner ? line(control, "assigned_to", person(c.owner)) : []),
    ...line(control, "assurance_class", c.assurance),
    // Coverage is its own fact, in words; it is never folded into the assurance class or a score.
    ...line(control, "coverage", c.tests ? `${c.tests.passing} of ${c.tests.total} tests passing` : "no tests"),
    ...(c.evidence_at ? line(control, "evidence_collected_at", c.evidence_at.slice(0, 10)) : []),
    ...(c.hours_per_quarter !== null ? line(control, "hours_per_quarter", c.hours_per_quarter) : []),
    ...c.risks.flatMap((r) => line(control, "linked_risk", node("risk", r))),
    ...c.obligations.flatMap((o) => line(control, "linked_obligation", node("obligation", o))),
    ...c.commitments.flatMap((m) => line(control, "customer_commitment", node("commitment", m))),
    ...line(control, "link_count", c.risks.length + c.obligations.length + c.commitments.length),
  ];
}

export function vendorLines(v: GrcVendor): string[] {
  const vendor = node("vendor", v.key);
  return [...v.data_classes.flatMap((d) => line(vendor, "handles_data", node("data", d))), ...line(vendor, "last_reviewed_at", v.last_reviewed_at?.slice(0, 10) ?? "never")];
}

export function exceptionLines(e: GrcException): string[] {
  const ex = node("exception", e.key);
  return [
    ...(e.control ? line(ex, "applies_to", node("control", e.control)) : []),
    ...(e.signer ? line(ex, "signer", person(e.signer)) : []),
    ...(e.review_by ? line(ex, "review_by", e.review_by.slice(0, 10)) : []),
  ];
}

/** The GRC platform connector for one provider: one record per list. */
export function grcPlatformConnector(provider: GrcProvider): Connector {
  // Live state: the engine stamps each record with the time it was read.
  const record = (kind: string, l: { list: unknown[]; total: number | null }, lines: string[]): SourceRecord => ({
    id: `${GRC_PLATFORM}:${provider.id}/${kind}`, connector: GRC_PLATFORM, provider: provider.id, rail: "security",
    revision: 1, format: "lines", observed_at: "", readers: GRC, text: lines.join("\n"),
    completeness: { read: l.list.length, total: l.total, of: kind },
  });
  return {
    id: GRC_PLATFORM, label: provider.label, rail: "security", every_minutes: 360, live_state: true,
    async read(api) {
      const s = await provider.snapshot(api);
      return [
        record("controls", s.controls, [...listing("controls", s.controls), ...s.controls.list.flatMap(controlLines)]),
        record("vendors", s.vendors, [...listing("vendors", s.vendors), ...s.vendors.list.flatMap(vendorLines)]),
        record("exceptions", s.exceptions, [...listing("exceptions", s.exceptions), ...s.exceptions.list.flatMap(exceptionLines)]),
      ];
    },
  };
}
