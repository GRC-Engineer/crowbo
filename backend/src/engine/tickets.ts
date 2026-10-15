import { line } from "./connectors";
import type { Connector, FetchJson, SourceRecord } from "./model";
import { collect } from "./paging";

/**
 * The tickets connector: one class, several providers (Linear, Jira). A provider reads its own API
 * into launches, each with a date, a lead and its issues; the connector turns them into records the
 * same way whichever provider read them. Labels carry meaning only in the forms the company uses:
 *  - control:<name>   the launch depends on that control; the assignee delivers it.
 *  - feature:<name>   the launch includes that feature; data:<class> on the same issue says the
 *                     feature handles that class of data.
 *  - security-review  the launch's security review; done when the issue is done.
 * A launch with no security-review issue is stated as such only when every issue of the launch was
 * read. Completeness must be stated by the provider (Linear's hasNextPage false, Jira's isLast):
 * unknown completeness is incomplete. A partial read states nothing about the review, and the
 * record says how much was read. A cancelled review counts as no review.
 */

export const TICKETS = "tickets";
const SECURITY_REVIEW = "security-review";

export interface Launch {
  key: string;
  /** Where the launch lives in the provider (a Jira project), so same-named launches do not share a record. */
  scope?: string;
  start_date: string | null;
  lead: string | null;
  issues: { labels: string[]; done: boolean; cancelled?: boolean; assignee: string | null }[];
  /** How many issues the launch has, as the provider stated it; null when it did not say. */
  issues_total: number | null;
  /** The listing the issues came from, as read: how many, out of the total the provider stated (null: not stated). */
  listing: { read: number; total: number | null };
}

export interface TicketsProvider {
  id: string;
  label: string;
  launches(api: FetchJson): Promise<Launch[]>;
}

const person = (email: string) => `person:${email.split("@")[0].toLowerCase()}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
const GRC = ["grc-lead"];

const ISSUE_FIELDS = "nodes { identifier state { type } assignee { email } labels { nodes { name } } } pageInfo { hasNextPage endCursor }";

/**
 * The GraphQL documents behind the Linear connector's two named requests. The connector asks for
 * "/graphql?query=projects" and "/graphql?query=project-issues&project=<slugId>&after=<cursor>"; a live
 * transport sends the matching document (linearOperation). The contract test checks that every field
 * the connector reads is selected here, and that every selection is in Linear's schema.
 */
export const LINEAR_QUERIES = {
  projects: `query Projects { projects(first: 50) { nodes { slugId startDate lead { email } issues(first: 50) { ${ISSUE_FIELDS} } } } }`,
  "project-issues": `query ProjectIssues($project: String!, $after: String) { project(id: $project) { issues(first: 50, after: $after) { ${ISSUE_FIELDS} } } }`,
} as const;

/** The GraphQL request for one of the connector's named Linear paths, or null for any other path. */
export function linearOperation(path: string): { query: string; variables: Record<string, string> } | null {
  const u = new URL(path, "https://linear.invalid");
  const name = u.searchParams.get("query");
  if (u.pathname !== "/graphql" || (name !== "projects" && name !== "project-issues")) return null;
  const variables: Record<string, string> = {};
  for (const k of ["project", "after"]) {
    const v = u.searchParams.get(k);
    if (v !== null) variables[k] = v;
  }
  return { query: LINEAR_QUERIES[name], variables };
}

/** Linear GraphQL: projects (launches) with start date and lead, and their issues with state, assignee and labels. */
export const linear: TicketsProvider = {
  id: "linear", label: "Linear",
  async launches(api) {
    type Issue = { state?: { type: string }; assignee: { email: string } | null; labels: { nodes: { name: string }[] } };
    // Linear states completeness only through pageInfo; without it the total is unknown.
    type Issues = { nodes: Issue[]; pageInfo?: { hasNextPage: boolean; endCursor?: string | null } };
    /** A project's issues: the first page from the projects query, the rest by cursor until a page says it is the last. */
    const allIssues = async (slugId: string, first: Issues) => {
      const l = await collect<Issue>("first", async (cursor) => {
        const page = cursor === "first" ? first : ((await api(`/graphql?query=project-issues&project=${encodeURIComponent(slugId)}&after=${encodeURIComponent(cursor)}`)) as null | { data: { project: { issues: Issues } } })?.data.project.issues;
        if (!page) return null;
        const info = page.pageInfo;
        return { items: page.nodes, next: info?.hasNextPage === false ? null : info?.hasNextPage && info.endCursor ? info.endCursor : undefined };
      }, (i) => (i as { identifier?: string }).identifier ?? JSON.stringify(i));
      return { nodes: l.items, complete: l.complete };
    };
    const r = (await api("/graphql?query=projects")) as null | {
      data: { projects: { nodes: { slugId: string; startDate: string | null; lead?: { email: string } | null; issues: Issues }[] } };
    };
    const out: Launch[] = [];
    for (const p of r?.data.projects.nodes ?? []) {
      const { nodes, complete } = await allIssues(p.slugId, p.issues);
      out.push({
        key: p.slugId, start_date: p.startDate, lead: p.lead?.email ?? null,
        issues: nodes.map((i) => ({ labels: i.labels.nodes.map((l) => l.name), done: i.state?.type === "completed", cancelled: i.state?.type === "canceled", assignee: i.assignee?.email ?? null })),
        issues_total: complete ? nodes.length : null,
        listing: { read: nodes.length, total: complete ? nodes.length : null },
      });
    }
    return out;
  },
};

/**
 * Jira's issue search for one project. The enhanced search returns only issue ids unless fields are
 * named, so the fields the connector reads are asked for explicitly.
 */
export const JIRA_ISSUE_FIELDS = ["labels", "status", "resolution", "assignee", "fixVersions"] as const;
export const jiraIssueSearch = (projectKey: string) => `/rest/api/3/search/jql?jql=project%3D${encodeURIComponent(projectKey)}&fields=${JIRA_ISSUE_FIELDS.join(",")}`;

/** Jira Cloud REST v3: each project's versions are launches (release date, project lead); issues name their fix version. */
export const jira: TicketsProvider = {
  id: "jira", label: "Jira",
  async launches(api) {
    type Project = { key: string; lead?: { emailAddress?: string } };
    type Issue = { key?: string; fields: { labels: string[]; status: { statusCategory: { key: string } }; resolution?: { name: string } | null; assignee: { emailAddress?: string } | null; fixVersions: { name: string }[] } };
    const projects = ((await api("/rest/api/3/project/search")) as null | { values: Project[] })?.values ?? [];
    const out: Launch[] = [];
    for (const p of projects) {
      const versions = ((await api(`/rest/api/3/project/${p.key}/versions`)) ?? []) as { name: string; releaseDate?: string; released: boolean }[];
      // The enhanced search pages by nextPageToken and states no total: the list is complete only when a
      // page says it is the last (isLast). A page that does not say leaves the list incomplete.
      const base = jiraIssueSearch(p.key);
      const listing = await collect<Issue>(base, async (path) => {
        const page = (await api(path)) as null | { issues: Issue[]; isLast?: boolean; nextPageToken?: string };
        if (!page) return null;
        return { items: page.issues, next: page.isLast === true ? null : page.nextPageToken ? `${base}&nextPageToken=${encodeURIComponent(page.nextPageToken)}` : undefined };
      }, (i) => i.key ?? JSON.stringify(i));
      const issues = listing.items;
      const complete = listing.complete;
      for (const v of versions.filter((x) => !x.released)) {
        const mine = issues.filter((i) => i.fields.fixVersions.some((f) => f.name === v.name));
        out.push({
          key: slug(v.name), scope: p.key, start_date: v.releaseDate ?? null, lead: p.lead?.emailAddress ?? null,
          issues: mine.map((i) => {
            const cancelled = /^(won't do|cancel+ed|declined)$/i.test(i.fields.resolution?.name ?? "");
            return { labels: i.fields.labels, done: i.fields.status.statusCategory.key === "done" && !cancelled, cancelled, assignee: i.fields.assignee?.emailAddress ?? null };
          }),
          issues_total: complete ? mine.length : null,
          listing: { read: issues.length, total: complete ? issues.length : null },
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
  const reviews = l.issues.filter((i) => i.labels.includes(SECURITY_REVIEW) && !i.cancelled);
  const complete = l.issues_total !== null && l.issues.length >= l.issues_total;
  // An open review is open however much was read; "none" and "done" need every issue.
  const review = reviews.some((i) => !i.done) ? "open" : !complete ? null : reviews.length === 0 ? "none" : "done";
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
        id: `${TICKETS}:${provider.id}/launch/${l.scope ? `${slug(l.scope)}/` : ""}${slug(l.key)}`, connector: TICKETS, provider: provider.id, rail: "engineering",
        revision: 1, format: "lines", observed_at: "", readers: GRC, text: launchLines(l).join("\n"),
        completeness: { ...l.listing, of: "issues" },
      }));
    },
  };
}
