import { identityConnector, okta } from "./identity";
import { linear, ticketsConnector } from "./tickets";
import { line } from "./line";
import type { AudienceGrant, Connector, FakeApiRoute, FetchJson, SourceRecord } from "./model";

/**
 * Layer 01, ingest. Each connector reads one tool through the shape of that tool's API and turns
 * the response into source records: typed fields as "subject predicate value" lines, or the prose
 * itself for documents and messages. The same mapping runs against the real API or the fake one
 * below; only the base URL and key differ. Readers are set here, before anything is derived.
 */

const person = (email: string) => `person:${email.split("@")[0].toLowerCase()}`;
const day = (iso: string) => iso.slice(0, 10);
const GRC = ["grc-lead"];

const record = (r: Omit<SourceRecord, "revision" | "format" | "text"> & { lines: string[] }): SourceRecord => {
  const { lines, ...rest } = r;
  return { ...rest, revision: 1, format: "lines", text: lines.join("\n") };
};
const prose = (r: Omit<SourceRecord, "revision" | "format">): SourceRecord => ({ ...r, revision: 1, format: "prose" });

/** Serves each path's latest version that was already true at `now`; a missing route is an empty read. */
export class FakeApi {
  constructor(private routes: FakeApiRoute[], public now: string) {}

  private live(path: string) {
    const route = this.routes.find((r) => r.path === path);
    return route?.versions.filter((v) => v.from <= this.now).sort((a, b) => (a.from < b.from ? -1 : 1)).at(-1);
  }

  /** The body, and (like an HTTP Link header) the next page's path when the route names one. */
  fetch: FetchJson = Object.assign(async (path: string) => {
    const live = this.live(path);
    return live ? structuredClone(live.body) : null;
  }, {
    page: async (path: string) => {
      const live = this.live(path);
      return live ? { body: structuredClone(live.body), next: live.next ?? null } : null;
    },
  });
}

/** The billing app's audit API: last action and the actions each person has taken. */
export const billing: Connector = {
  id: "billing", label: "Billing apps", rail: "security", every_minutes: 1440, live_state: false,
  async read(api) {
    const r = (await api("/v1/audit/summary?window=90d")) as null | {
      generated_at: string; window_days: number; days_with_data: number; missing_days: string[];
      actors: { email: string; last_action_at: string | null; actions: string[] }[];
    };
    if (!r) return [];
    return [record({
      id: "billing:audit/90d", connector: "billing", rail: "security", observed_at: day(r.generated_at), readers: GRC,
      coverage: { window_days: r.window_days, days_with_data: r.days_with_data, missing: r.missing_days },
      lines: r.actors.flatMap((a) => [
        ...(a.last_action_at ? line(person(a.email), "last_billing_action", day(a.last_action_at)) : []),
        ...(a.actions.length ? line(person(a.email), "billing_actions", [...a.actions].sort().join(",")) : []),
      ]),
    })];
  },
};

/** Google Sheets values API: the risk register and the controls register. */
export const sheets: Connector = {
  id: "sheets", label: "Sheets", rail: "business", every_minutes: 360, live_state: false,
  async read(api) {
    const out: SourceRecord[] = [];
    for (const [sheet, label] of [["risk-register", "Risk register"], ["controls-register", "Controls register"]] as const) {
      const r = (await api(`/v4/spreadsheets/${sheet}/values/A1:F50`)) as null | { modifiedTime: string; values: string[][] };
      if (!r) continue;
      const [header, ...rows] = r.values;
      const col = (name: string) => header.indexOf(name);
      out.push(record({
        id: `sheets:${sheet}`, connector: "sheets", rail: "business", observed_at: day(r.modifiedTime), readers: GRC, label,
        lines: rows.flatMap((row) => line(String(row[col("subject")] ?? ""), String(row[col("field")] ?? ""), String(row[col("value")] ?? ""))),
      }));
    }
    return out;
  },
};

/** A vendor's release notes page: prose, so facts come from the model extractor. */
export const vendorDocs: Connector = {
  id: "vendor-docs", label: "Vendor docs", rail: "business", every_minutes: 10080, live_state: false,
  async read(api) {
    const r = (await api("/changelog/billing.md")) as null | { updated_at: string; markdown: string };
    return r ? [prose({ id: "vendor-docs:billing-changelog", connector: "vendor-docs", rail: "business", observed_at: day(r.updated_at), readers: GRC, text: r.markdown })] : [];
  },
};

/** Workday workers: teams and managers. Terminations are readable by the people team only. */
export const workday: Connector = {
  id: "workday", label: "Workday", rail: "business", every_minutes: 1440, live_state: true,
  async read(api) {
    const r = (await api("/ccx/api/v1/workers")) as null | { asOf: string; total?: number; data: { email: string; org: string; isManager: boolean; terminated?: string }[] };
    if (!r) return [];
    // Complete only when the response states a total no larger than what was read.
    const completeness = { read: r.data.length, total: typeof r.total === "number" ? r.total : null, of: "workers" };
    const complete = completeness.total !== null && completeness.read >= completeness.total;
    const team = (org: string) => `team:${org.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return [
      record({
        id: "workday:workers", connector: "workday", rail: "business", observed_at: day(r.asOf), readers: GRC, completeness,
        lines: r.data.filter((w) => !w.terminated).flatMap((w) => [...line(person(w.email), "member_of", team(w.org)), ...(w.isManager ? line(person(w.email), "leads", team(w.org)) : [])]),
      }),
      record({
        id: "workday:terminations", connector: "workday", rail: "business", observed_at: day(r.asOf), readers: ["people-team"], completeness,
        // The listing line lets a join tell "nobody left" from "terminations not readable" or "read in part".
        lines: [...line("listing:workday.terminations", "read", complete ? "complete" : "partial"), ...r.data.filter((w) => w.terminated).flatMap((w) => line(person(w.email), "terminated_on", w.terminated!))],
      }),
    ];
  },
};

/** Slack conversations API: one record per message, prose for the model extractor. */
export const slack: Connector = {
  id: "slack", label: "Slack", rail: "engineering", every_minutes: 15, live_state: false,
  async read(api) {
    const r = (await api("/api/conversations.history?channel=C0GRC")) as null | { messages: { ts: string; user: string; text: string }[] };
    return (r?.messages ?? []).map((m) => prose({
      id: `slack:C0GRC/${m.ts}`, connector: "slack", rail: "engineering", observed_at: new Date(Number(m.ts) * 1000).toISOString().slice(0, 10), readers: GRC, text: `${m.user}: ${m.text}`,
    }));
  },
};

export const CONNECTORS: Connector[] = [identityConnector(okta), billing, sheets, ticketsConnector(linear), vendorDocs, workday, slack];

/**
 * Keep only what the viewer may read: the record's own readers, plus any audience the company granted
 * for that record. Applied before extraction, so a fact derived from several records only exists for
 * a viewer who may read every one of them: it inherits the narrowest audience of its contributors.
 */
export function readable(records: SourceRecord[], viewer: string, grants: AudienceGrant[] = []): { readable: SourceRecord[]; withheld: number } {
  const granted = (r: SourceRecord) => grants.some((g) => g.record === r.id && g.readers.includes(viewer));
  const ok = records.filter((r) => r.readers.includes(viewer) || granted(r));
  return { readable: ok, withheld: records.length - ok.length };
}
