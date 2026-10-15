import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { slack } from "../../src/engine/connectors";
import { NORTHWIND } from "../../src/engine/fixture";
import { NORTHWIND_IDENTITY } from "../../src/engine/fixture-identity";
import { NORTHWIND_TICKETS } from "../../src/engine/fixture-tickets";
import { googleWorkspace, identityConnector, okta } from "../../src/engine/identity";
import type { CompanyFixture, Connector } from "../../src/engine/model";
import { jira, JIRA_ISSUE_FIELDS, jiraIssueSearch, linear, ticketsConnector } from "../../src/engine/tickets";
import { type Endpoint, graphqlArgs, graphqlTypes, loadSpec, missingSpecs, recordingApi, schemaCheck, specFile } from "./specs";

/**
 * Each connector, replayed on its fixture, may only call endpoints and read fields its provider's
 * pinned spec defines (backend/contracts/SOURCES.md). The fixtures are written in the providers' API
 * shapes; this test is what holds them to it. Specs that cannot be committed are fetched into the
 * cache by `bun scripts/contracts.ts`; without them this suite fails rather than passing unchecked.
 * Vanta and Drata publish no machine-readable spec and are not covered here.
 */

const REPLAYS: { provider: string; connector: Connector; fixture: CompanyFixture }[] = [
  { provider: "okta", connector: identityConnector(okta), fixture: NORTHWIND_IDENTITY },
  { provider: "google-workspace", connector: identityConnector(googleWorkspace), fixture: NORTHWIND_IDENTITY },
  { provider: "linear", connector: ticketsConnector(linear), fixture: NORTHWIND_TICKETS },
  { provider: "jira", connector: ticketsConnector(jira), fixture: NORTHWIND_TICKETS },
  { provider: "slack", connector: slack, fixture: NORTHWIND },
];

/**
 * Fields a spec does not define but the connector reads on purpose, each with the reason. Okta lets a
 * company extend group and app profiles; the connector reads two such custom properties.
 */
const EXTENSIONS: Record<string, string> = {
  "okta /api/v1/groups [].profile.app": "custom group profile property: the app this group administers",
  "okta /api/v1/apps [].profile.businessOwner": "custom app profile property: the app's business owner",
};

/**
 * Jira types an issue's fields only as a map; the platform spec documents each system field's value
 * with a schema. A field read deeper than its name is checked against that schema.
 */
const JIRA_FIELD_SCHEMAS: Record<(typeof JIRA_ISSUE_FIELDS)[number], string> = {
  labels: "", status: "StatusDetails", resolution: "Resolution", assignee: "UserDetails", fixVersions: "Version",
};

/** The OAuth scopes Crowbo would request, checked against the scopes each endpoint read accepts. */
const SCOPE_CANDIDATES: Record<string, string[]> = {
  okta: ["okta.users.read", "okta.groups.read", "okta.apps.read"],
  "google-workspace": ["https://www.googleapis.com/auth/admin.directory.user.readonly", "https://www.googleapis.com/auth/admin.directory.group.readonly"],
  jira: ["read:jira-work"],
  slack: ["channels:history"],
};

async function replay(provider: string, connector: Connector, fixture: CompanyFixture) {
  const { api, reads } = recordingApi(structuredClone(fixture).api);
  await connector.read(api);
  const spec = loadSpec(provider);
  const endpoints = new Map<string, Endpoint | null>([...reads.keys()].map((path) => [path, spec(path)]));
  return { reads, endpoints };
}

/** Why a read is outside the spec, or null when the spec defines it. */
function problem(provider: string, path: string, endpoint: Endpoint, field: string): string | null {
  const v = endpoint.check(field);
  if (v.status === "defined" || EXTENSIONS[`${provider} ${endpoint.template} ${field}`]) return null;
  // Jira returns, under fields, exactly the fields the request names.
  if (provider === "jira" && v.status === "open" && v.at === "issues[].fields") {
    const asked = new URL(path, "https://x").searchParams.get("fields")?.split(",") ?? [];
    if (!asked.includes(v.key)) return `${path}: ${field} is read but not requested in fields=`;
    const rest = field.slice(`issues[].fields.${v.key}`.length).replace(/^\./, "");
    const schema = JIRA_FIELD_SCHEMAS[v.key as keyof typeof JIRA_FIELD_SCHEMAS];
    if (!rest || rest === "[]") return null;
    if (!schema) return `${path}: ${field} reads into a field with no documented schema`;
    const inner = schemaCheck("jira", schema, rest.replace(/^\[\]\.?/, ""));
    return inner.status === "defined" ? null : `${path}: ${field} is not in ${schema}`;
  }
  return `${endpoint.template}: ${field} is ${v.status === "open" ? "not named by the spec (open map)" : "not in the spec"}`;
}

describe.skipIf(process.env.CROWBO_CONTRACTS === "skip")("provider contracts", () => {
  beforeAll(() => {
    const missing = missingSpecs();
    if (missing.length) throw new Error(`Provider specs not fetched: ${missing.join(", ")}. Run: bun scripts/contracts.ts`);
  });

  for (const { provider, connector, fixture } of REPLAYS) {
    it(`${provider}: every request is a documented GET with declared parameters, and every field read is defined`, async () => {
      const { reads, endpoints } = await replay(provider, connector, fixture);
      const problems: string[] = [];
      let fields = 0;
      for (const [path, read] of reads) {
        const endpoint = endpoints.get(path);
        if (!endpoint) {
          problems.push(`${path}: no such GET endpoint`);
          continue;
        }
        if (endpoint.undeclared.length) problems.push(`${path}: undeclared query parameters ${endpoint.undeclared.join(", ")}`);
        for (const field of read) {
          fields++;
          const p = problem(provider, path, endpoint, field);
          if (p) problems.push(p);
        }
      }
      expect(problems).toEqual([]);
      expect(fields).toBeGreaterThanOrEqual(3);
    });
  }

  it("the test catches a field the spec does not define", async () => {
    const { reads, endpoints } = await replay("jira", ticketsConnector(jira), NORTHWIND_TICKETS);
    const search = jiraIssueSearch("NW");
    expect(problem("jira", search, endpoints.get(search)!, "total")).toBe("/rest/api/3/search/jql: total is not in the spec");
    expect(problem("jira", search.replace(",fixVersions", ""), endpoints.get(search)!, "issues[].fields.fixVersions")).toMatch(/not requested in fields=/);
    expect(problem("jira", search, endpoints.get(search)!, "issues[].fields.status.statusCategory.colour")).toBe(`${search}: issues[].fields.status.statusCategory.colour is not in StatusDetails`);
    expect(reads.get(search)).toContain("issues[].fields.status.statusCategory.key");
  });

  it("every scope candidate is one the spec names, and covers each endpoint the connectors read", async () => {
    for (const [provider, candidates] of Object.entries(SCOPE_CANDIDATES)) {
      const r = REPLAYS.find((x) => x.provider === provider)!;
      const { endpoints } = await replay(provider, r.connector, r.fixture);
      for (const [path, e] of endpoints) expect({ path, covered: e!.scopes.some((s) => candidates.includes(s)) }).toEqual({ path, covered: true });
    }
  });

  it("the paging each connector relies on is documented", () => {
    const okta = loadSpec("okta");
    for (const path of ["/api/v1/users", "/api/v1/groups", "/api/v1/apps", "/api/v1/groups/x/users"]) expect(okta(`${path}?after=a&limit=200`)!.undeclared).toEqual([]);
    const google = loadSpec("google-workspace");
    for (const [path, list] of [["/admin/directory/v1/users?customer=c&pageToken=p", "users"], ["/admin/directory/v1/groups?customer=c&pageToken=p", "groups"], ["/admin/directory/v1/groups/g/members?maxResults=200&pageToken=p", "members"]]) {
      const e = google(path)!;
      expect([e.undeclared, e.check("nextPageToken").status, e.check(`${list}[]`).status]).toEqual([[], "defined", "defined"]);
    }
    const search = loadSpec("jira")(`${jiraIssueSearch("NW")}&nextPageToken=n`)!;
    expect([search.undeclared, search.check("isLast").status, search.check("nextPageToken").status, search.check("total").status]).toEqual([[], "defined", "defined", "undefined"]);
    const sdl = readFileSync(specFile("linear"), "utf8");
    const types = graphqlTypes(sdl);
    expect([types.get("PageInfo")?.get("hasNextPage"), types.get("PageInfo")?.get("endCursor"), types.get("Project")?.get("issues")]).toEqual(["Boolean", "String", "IssueConnection"]);
    expect(graphqlArgs(sdl, "Project", "issues")).toEqual(expect.arrayContaining(["after", "first"]));
  });

  it("Jira's search asks for every field the connector reads", () => {
    expect(new URL(jiraIssueSearch("NW"), "https://x").searchParams.get("fields")!.split(",")).toEqual([...JIRA_ISSUE_FIELDS]);
  });
});
