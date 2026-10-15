import { OKTA_DEPROVISIONED } from "../../src/engine/identity";
import { JIRA_ISSUE_FIELDS } from "../../src/engine/tickets";

/**
 * What a recording may contain, provider by provider: every field a connector reads, with the class
 * of value it holds, and every request path it makes, with the class of each variable part. The
 * scrubber keeps a value only as its class allows and pseudonymises the rest; a field or a path the
 * schema does not list is refused, so nothing unclassified reaches the repository. A test checks the
 * schema covers every field the connectors read on the fixtures, so a connector change cannot outrun it.
 */

export type ValueClass =
  /** An account, object or workspace identifier: always pseudonymised (id-<hmac>). */
  | "id"
  /** A paging cursor: always pseudonymised (cursor-<hmac>). */
  | "cursor"
  /** An email: Northwind's people and the roster's group addresses keep their name at northwind.example; anyone else is person-<hmac>. */
  | "email"
  /** An ISO date or time. */
  | "time"
  | "bool"
  | "count"
  /** A name from Northwind's roster (a group, app, label, version); any other name is value-<hmac>. */
  | "roster"
  /** A Slack message: one of the roster's messages, or value-<hmac>. */
  | "text"
  /** A Slack message timestamp. */
  | "ts"
  /** A container: an object or a list, whose own fields are listed separately. */
  | "object"
  /** One of a fixed list of provider words; any other word is value-<hmac>. */
  | { words: readonly string[] };

const OKTA_STATUSES = ["STAGED", "PROVISIONED", "ACTIVE", "RECOVERY", "LOCKED_OUT", "PASSWORD_EXPIRED", "SUSPENDED", "DEPROVISIONED"] as const;

/** A path the connector requests: literal segments and {class} slots, and the query names it may carry. */
export interface PathRule {
  path: string;
  query: Record<string, ValueClass | { literal: string } | { jql: true }>;
}

export interface ProviderSchema {
  fields: Record<string, ValueClass>;
  paths: PathRule[];
}

const oktaQuery = { after: "cursor", limit: "count" } as const;
const googleQuery = { customer: { literal: "my_customer" }, pageToken: "cursor" } as const;

const linearIssues = (at: string): Record<string, ValueClass> => ({
  [at]: "object", [`${at}.nodes`]: "object", [`${at}.nodes[].identifier`]: "id",
  [`${at}.nodes[].state`]: "object", [`${at}.nodes[].state.type`]: { words: ["triage", "backlog", "unstarted", "started", "completed", "canceled"] },
  [`${at}.nodes[].assignee`]: "object", [`${at}.nodes[].assignee.email`]: "email",
  [`${at}.nodes[].labels`]: "object", [`${at}.nodes[].labels.nodes`]: "object", [`${at}.nodes[].labels.nodes[].name`]: "roster",
  [`${at}.pageInfo`]: "object", [`${at}.pageInfo.hasNextPage`]: "bool", [`${at}.pageInfo.endCursor`]: "cursor",
});

export const SCHEMAS: Record<string, ProviderSchema> = {
  okta: {
    fields: {
      "[].id": "id", "[].label": "roster", "[].status": { words: OKTA_STATUSES }, "[].lastLogin": "time",
      "[].profile": "object", "[].profile.name": "roster", "[].profile.app": "roster", "[].profile.businessOwner": "email", "[].profile.login": "email",
    },
    paths: [
      { path: "/api/v1/groups", query: oktaQuery },
      { path: "/api/v1/apps", query: oktaQuery },
      { path: "/api/v1/users", query: { ...oktaQuery, filter: { literal: new URL(OKTA_DEPROVISIONED, "https://x").searchParams.get("filter")! } } },
      { path: "/api/v1/groups/{id}/users", query: oktaQuery },
    ],
  },
  "google-workspace": {
    fields: {
      users: "object", "users[].primaryEmail": "email", "users[].suspended": "bool", "users[].archived": "bool", "users[].isAdmin": "bool", "users[].lastLoginTime": "time",
      groups: "object", "groups[].id": "id", "groups[].email": "email",
      members: "object", "members[].email": "email", "members[].status": { words: ["ACTIVE", "SUSPENDED", "UNKNOWN"] },
      nextPageToken: "cursor",
    },
    paths: [
      { path: "/admin/directory/v1/users", query: googleQuery },
      { path: "/admin/directory/v1/groups", query: googleQuery },
      { path: "/admin/directory/v1/groups/{id}/members", query: { maxResults: { literal: "200" }, pageToken: "cursor" } },
    ],
  },
  linear: {
    fields: {
      data: "object", "data.projects": "object", "data.projects.nodes": "object",
      "data.projects.nodes[].slugId": "id", "data.projects.nodes[].startDate": "time",
      "data.projects.nodes[].lead": "object", "data.projects.nodes[].lead.email": "email",
      ...linearIssues("data.projects.nodes[].issues"),
      "data.project": "object", ...linearIssues("data.project.issues"),
    },
    paths: [{ path: "/graphql", query: { query: { words: ["projects", "project-issues"] }, project: "id", after: "cursor" } }],
  },
  jira: {
    fields: {
      values: "object", "values[].key": "id", "values[].lead": "object", "values[].lead.emailAddress": "email",
      "[].name": "roster", "[].releaseDate": "time", "[].released": "bool",
      issues: "object", isLast: "bool", nextPageToken: "cursor", "issues[].key": "id", "issues[].fields": "object",
      "issues[].fields.labels": "roster",
      "issues[].fields.status": "object", "issues[].fields.status.statusCategory": "object", "issues[].fields.status.statusCategory.key": { words: ["new", "indeterminate", "done", "undefined"] },
      "issues[].fields.resolution": "object", "issues[].fields.resolution.name": { words: ["Done", "Won't Do", "Cancelled", "Canceled", "Declined", "Duplicate", "Fixed"] },
      "issues[].fields.assignee": "object", "issues[].fields.assignee.emailAddress": "email",
      "issues[].fields.fixVersions": "object", "issues[].fields.fixVersions[].name": "roster",
    },
    paths: [
      { path: "/rest/api/3/project/search", query: {} },
      { path: "/rest/api/3/project/{id}/versions", query: {} },
      { path: "/rest/api/3/search/jql", query: { jql: { jql: true }, fields: { literal: JIRA_ISSUE_FIELDS.join(",") }, nextPageToken: "cursor" } },
    ],
  },
  slack: {
    fields: { messages: "object", "messages[].ts": "ts", "messages[].user": "id", "messages[].text": "text" },
    paths: [{ path: "/api/conversations.history", query: { channel: { literal: "C0GRC" } } }],
  },
};
