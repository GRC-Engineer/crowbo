import { line } from "./connectors";
import type { Connector, FetchJson, SourceRecord } from "./model";

/**
 * The tickets connector: one class, several providers (Linear, Jira). A provider reads its own API
 * into launches, each with a date, a lead and its issues; the connector turns them into records the
 * same way whichever provider read them. Labels carry meaning only in the forms the company uses:
 *  - control:<name>   the launch depends on that control; the assignee delivers it.
 *  - feature:<name>   the launch includes that feature; data:<class> on the same issue says the
 *                     feature handles that class of data.
 *  - security-review  the launch's security review; done when the issue is done.
 * A launch with no security-review issue is stated as such only when every issue of the launch was
 * read. A paged list read only in part states nothing about the review, so the gap stays unresolved.
 */

export const TICKETS = "tickets";
const SECURITY_REVIEW = "security-review";

export interface Launch {
  key: string;
  start_date: string | null;
  lead: string | null;
  issues: { labels: string[]; done: boolean; assignee: string | null }[];
  /** False when the provider reported more issues than were read (a page not fetched). */
  complete: boolean;
}

export interface TicketsProvider {
  id: string;
  label: string;
  launches(api: FetchJson): Promise<Launch[]>;
}

const person = (email: string) => `person:${email.split("@")[0].toLowerCase()}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
const GRC = ["grc-lead"];

/** Linear GraphQL: projects (launches) with start date and lead, and their issues with state, assignee and labels. */
export const linear: TicketsProvider = {
  id: "linear", label: "Linear",
  async launches(api) {
    type Issue = { state?: { type: string }; assignee: { email: string } | null; labels: { nodes: { name: string }[] } };
    type Issues = { nodes: Issue[]; pageInfo?: { hasNextPage: boolean } };
    const r = (await api("/graphql?query=projects")) as null | {
      data: { projects: { nodes: { slugId: string; startDate: string | null; lead?: { email: string } | null; issues: Issues }[] } };
    };
    return (r?.data.projects.nodes ?? []).map((p) => ({
      key: p.slugId, start_date: p.startDate, lead: p.lead?.email ?? null,
      issues: p.issues.nodes.map((i) => ({ labels: i.labels.nodes.map((l) => l.name), done: i.state?.type === "completed", assignee: i.assignee?.email ?? null })),
      complete: p.issues.pageInfo?.hasNextPage !== true,
    }));
  },
};

/** Jira Cloud REST v3: each project's versions are launches (release date, project lead); issues name their fix version. */
export const jira: TicketsProvider = {
  id: "jira", label: "Jira",
  async launches(api) {
    type Project = { key: string; lead?: { emailAddress?: string } };
    type Issue = { fields: { labels: string[]; status: { statusCategory: { key: string } }; assignee: { emailAddress?: string } | null; fixVersions: { name: string }[] } };
    const projects = ((await api("/rest/api/3/project/search")) as null | { values: Project[] })?.values ?? [];
    const out: Launch[] = [];
    for (const p of projects) {
      const versions = ((await api(`/rest/api/3/project/${p.key}/versions`)) ?? []) as { name: string; releaseDate?: string; released: boolean }[];
      const page = (await api(`/rest/api/3/search?jql=project%3D${p.key}`)) as null | { issues: Issue[]; total?: number };
      const issues = page?.issues ?? [];
      const complete = page !== null && (page.total === undefined || page.total <= issues.length);
      for (const v of versions.filter((x) => !x.released)) {
        out.push({
          key: slug(v.name), start_date: v.releaseDate ?? null, lead: p.lead?.emailAddress ?? null,
          issues: issues.filter((i) => i.fields.fixVersions.some((f) => f.name === v.name)).map((i) => ({
            labels: i.fields.labels, done: i.fields.status.statusCategory.key === "done", assignee: i.fields.assignee?.emailAddress ?? null,
          })),
          complete,
        });
      }
    }
    return out;
  },
};

export const TICKETS_PROVIDERS = { linear, jira } as const;

/** The lines one launch states, the same whichever provider read it. */
export function launchLines(l: Launch): string[] {
  const launch = `launch:${slug(l.key)}`;
  const out = [...(l.start_date ? line(launch, "start_date", l.start_date) : []), ...(l.lead ? line(launch, "led_by", person(l.lead)) : [])];
  for (const i of l.issues) {
    for (const label of i.labels) {
      if (label.startsWith("control:")) out.push(...line(launch, "depends_on", label), ...(i.assignee ? line(label, "assigned_to", person(i.assignee)) : []));
      if (label.startsWith("feature:")) {
        out.push(...line(launch, "includes", label));
        for (const data of i.labels.filter((x) => x.startsWith("data:"))) out.push(...line(label, "handles_data", data));
      }
    }
  }
  const reviews = l.issues.filter((i) => i.labels.includes(SECURITY_REVIEW));
  // An open review is open however much was read; "none" and "done" need every issue.
  const review = reviews.some((i) => !i.done) ? "open" : !l.complete ? null : reviews.length === 0 ? "none" : "done";
  if (review) out.push(...line(launch, "security_review", review));
  for (const r of reviews) if (r.assignee) out.push(...line("control:security-review", "assigned_to", person(r.assignee)));
  return [...new Set(out)];
}

/** The tickets connector for one provider: one record per launch. */
export function ticketsConnector(provider: TicketsProvider): Connector {
  return {
    id: TICKETS, label: provider.label, rail: "engineering", every_minutes: 15, live_state: true,
    async read(api) {
      const launches = await provider.launches(api);
      // Live state: the engine stamps each record with the time it was read.
      return launches.map((l): SourceRecord => ({
        id: `${TICKETS}:${provider.id}/launch/${slug(l.key)}`, connector: TICKETS, provider: provider.id, rail: "engineering",
        revision: 1, format: "lines", observed_at: "", readers: GRC, text: launchLines(l).join("\n"),
      }));
    },
  };
}
