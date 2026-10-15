import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../src/engine/connectors";
import { NORTHWIND } from "../../src/engine/fixture";
import { NORTHWIND_IDENTITY } from "../../src/engine/fixture-identity";
import { NORTHWIND_TICKETS } from "../../src/engine/fixture-tickets";
import { OKTA_DEPROVISIONED } from "../../src/engine/identity";
import type { CompanyFixture } from "../../src/engine/model";
import { recordProvider } from "../../scripts/rehearsal/record";
import { connectorFor, PROVIDER_CONNECTOR, type Recording, recordedApi, recordingOf } from "../../scripts/rehearsal/recording";
import { pruneToReads } from "../../scripts/rehearsal/reads";
import { SCHEMAS } from "../../scripts/rehearsal/schema";
import { findLeaks, renameRecords, ScrubRefused, scrub } from "../../scripts/rehearsal/scrub";

const RECORDED = join(import.meta.dirname, "../fixtures/recorded");
const SALT = "a".repeat(64);
// Credential-shaped strings are assembled here so this file itself holds none.
const fake = (...parts: string[]) => parts.join("");
const ORG = "https://dev-31337.okta.com";
const SANDBOX = "crowbo-sandbox.test";
const NOW = new Date("2026-10-20T09:00:00Z");
const rec = (provider: string, responses: Record<string, unknown>): Recording => ({ connector: PROVIDER_CONNECTOR[provider], provider, recorded_at: "x", responses });

/** What an Okta developer org answers: real ids, links, the admin, the default group, a token in a description. */
function rawOkta(): Recording {
  const user = (id: string, login: string, status = "ACTIVE") => ({
    id, status, created: "2026-10-01T09:00:00.000Z", lastLogin: "2026-10-10T10:00:01.000Z",
    profile: { login, email: login, firstName: login.split("@")[0], lastName: "Okonkwo-Reyes", mobilePhone: "+44 7700 900123" },
    _links: { self: { href: `${ORG}/api/v1/users/${id}` } },
  });
  const priya = user("00u1a2b3c4d5e6f7g8h9", "priya@northwind.example");
  const u01 = user("00u9h8g7f6e5d4c3b2a1", "u01@northwind.example");
  const admin = user("00uADMIN00000000000x", `founder@${SANDBOX}`);
  const ops = user("00uOPS0000000000000x", `it-ops@${SANDBOX}`);
  return {
    connector: "identity", provider: "okta", recorded_at: NOW.toISOString(),
    responses: {
      "/api/v1/groups": [
        { id: "00gEVERYONE000000001", profile: { name: "Everyone", description: "All users in your organization" } },
        { id: "00gBILLING0000000001", profile: { name: "billing-admins", app: "billing", description: fake("note: ", "xo", "xb-", "1234567890-abcdefghij") }, createdBy: "00uADMIN00000000000x" },
      ],
      "/api/v1/apps": [{ id: "0oaBILLING0000000001", name: "bookmark", label: "billing", profile: { businessOwner: "priya@northwind.example" } }],
      "/api/v1/users": [admin, ops, priya],
      "/api/v1/users?after=00u1a2b3c4d5e6f7g8h9&limit=200": [u01],
      [OKTA_DEPROVISIONED]: [],
      "/api/v1/groups/00gEVERYONE000000001/users": [admin, priya, u01],
      "/api/v1/groups/00gBILLING0000000001/users": [u01],
    },
    links: { "/api/v1/users": "/api/v1/users?after=00u1a2b3c4d5e6f7g8h9&limit=200", "/api/v1/users?after=00u1a2b3c4d5e6f7g8h9&limit=200": null },
  };
}

/**
 * Every shape found to slip past an earlier scrubber, as [what, provider, responses, the private strings].
 * Each must be a leak before scrubbing, and after it either be refused or be gone.
 */
const ATTACKS: [string, string, Record<string, unknown>, string[]][] = [
  ["a name as a status word", "okta", { "/api/v1/users": [{ status: "JonathanDoe" }] }, ["JonathanDoe"]],
  ["a company as a status word", "okta", { "/api/v1/users": [{ status: "ACMECORP" }] }, ["ACMECORP"]],
  ["a company word as a group name", "okta", { "/api/v1/groups": [{ profile: { name: "acme-internal" } }] }, ["acme"]],
  ["a company abbreviation as a Jira project key", "jira", { "/rest/api/3/project/search": { values: [{ key: "ACME" }] }, "/rest/api/3/project/ACME/versions": [] }, ["ACME"]],
  ["a word as a path id", "okta", { "/api/v1/groups/acmecorp/users": [] }, ["acmecorp"]],
  ["a host as a path id", "okta", { "/api/v1/groups/acme.okta.com/users": [] }, ["acme"]],
  ["a word as a cursor", "okta", { "/api/v1/users?after=johnsmith": [] }, ["johnsmith"]],
  ["a number where a time belongs", "okta", { "/api/v1/users": [{ lastLogin: 1791468000 }] }, ["1791468000"]],
  ["a token in a group name", "okta", { "/api/v1/groups": [{ profile: { name: fake("xo", "xp-", "1234567890-0987654321-abcdefabcdef") } }] }, ["xoxp"]],
  ["an encoded email", "okta", { "/api/v1/users": [{ profile: { login: "morgan%40crowbo-sandbox.test" } }] }, ["morgan"]],
  ["a real-looking email", "okta", { "/api/v1/users": [{ profile: { login: `founder@${SANDBOX}` } }] }, ["founder", SANDBOX]],
  ["a message that is not the roster's", "slack", { "/api/conversations.history?channel=C0GRC": { messages: [{ text: "Morgan asked U012ABCDEF about customer C03abcde9", user: "U012ABCDEF", ts: "1791468000.000100" }] } }, ["Morgan", "U012ABCDEF", "C03abcde9"]],
];

/** Shapes the schema has no place for: refused, never written. */
const REFUSED: [string, string, Record<string, unknown>][] = [
  ["an id under an unlisted key", "okta", { "/api/v1/groups": [{ createdBy: "00uADMIN00000000000x" }] }],
  ["an alphabetic key", "okta", { "/api/v1/users": [{ jsmith: true }] }],
  ["an id as a key", "okta", { "/api/v1/users": [{ "00uKEY00000000000001": true }] }],
  ["a phone number", "okta", { "/api/v1/users": [{ profile: { mobilePhone: 447700900123 } }] }],
  ["an unlisted query name", "okta", { "/api/v1/users?q=Jonathan%20Doe": [] }],
  ["a search filter", "okta", { '/api/v1/users?search=profile.lastName%20eq%20%22Doe%22': [] }],
  ["another filter value", "okta", { '/api/v1/users?filter=profile.lastName%20eq%20%22Doe%22': [] }],
  ["an unlisted path", "okta", { "/api/v1/users/00uX/groups": [] }],
  ["a link URL in a body", "okta", { "/api/v1/users": [{ _links: { self: { href: `${ORG}/api/v1/users/00uX` } } }] }],
  ["unpatterned secrets", "google-workspace", { "/admin/directory/v1/users?customer=my_customer": { users: [{ refresh: fake("1//0", "gAbCdEfGhIjKl"), secret: fake("GOCSPX", "-abcdefghijklmnop") }] } }],
  ["a bare host", "jira", { "/rest/api/3/project/search": { values: [{ site: "acme.atlassian.net" }] } }],
];

describe("scrubbing recordings: the schema decides, everything else is refused or replaced", () => {
  for (const [what, provider, responses, secrets] of ATTACKS) {
    it(`${what}: a leak before scrubbing, gone after`, () => {
      const r = rec(provider, responses);
      expect(findLeaks(r).length).toBeGreaterThan(0);
      const { recording } = scrub(r, SALT);
      expect(findLeaks(recording)).toEqual([]);
      for (const s of secrets) expect(JSON.stringify(recording)).not.toContain(s);
    });
  }

  for (const [what, provider, responses] of REFUSED) {
    it(`${what}: a leak, and the scrub refuses it`, () => {
      const r = rec(provider, responses);
      expect(findLeaks(r).length).toBeGreaterThan(0);
      expect(() => scrub(r, SALT)).toThrow(ScrubRefused);
    });
  }

  it("a pseudonym is the same in every recording made with the salt, and differs under another salt", () => {
    const one = scrub(rec("okta", { "/api/v1/groups": [{ id: "00gX0000000000000001" }] }), SALT).recording;
    const two = scrub(rec("okta", { "/api/v1/apps": [{ id: "0oaY" }], "/api/v1/groups/00gX0000000000000001/users": [], "/api/v1/groups": [{ id: "00gX0000000000000001" }] }), SALT).recording;
    const id = (one.responses["/api/v1/groups"] as { id: string }[])[0].id;
    expect((two.responses["/api/v1/groups"] as { id: string }[])[0].id).toBe(id);
    expect(Object.keys(two.responses)).toContain(`/api/v1/groups/${id}/users`);
    expect((scrub(rec("okta", { "/api/v1/groups": [{ id: "00gX0000000000000001" }] }), "b".repeat(64)).recording.responses["/api/v1/groups"] as { id: string }[])[0].id).not.toBe(id);
    expect(() => scrub(rec("okta", {}), "short")).toThrow(/salt/);
  });

  it("recording an Okta sandbox keeps only what was read, leaks nothing, and replays to exactly the live records renamed", async () => {
    const raw = rawOkta();
    const { recording } = await recordProvider("okta", recordedApi(raw), [SANDBOX], NOW, SALT);
    expect(findLeaks(recording)).toEqual([]);
    const text = JSON.stringify(recording);
    for (const gone of ["mobilePhone", "_links", "createdBy", "Okonkwo", "dev-31337", "founder", "00u", "00g", "0oa", "Everyone", "description"]) expect(text).not.toContain(gone);
    // The same check the recorder makes, shown here: the replay equals the live read, renamed.
    const { api, responses, reads, links } = recordingOf(recordedApi(raw));
    const live = await connectorFor("identity", "okta")!.read(api);
    const pruned = { ...raw, links, responses: Object.fromEntries(Object.entries(responses).map(([p, body]) => [p, pruneToReads(body, reads[p])])) };
    const { aliases } = scrub(pruned, SALT);
    const replayed = await connectorFor("identity", "okta")!.read(recordedApi(recording));
    const view = (rs: { id: string; text: string }[]) => rs.map((r) => [r.id, r.text]).sort();
    expect(view(replayed)).toEqual(view(renameRecords(live, aliases)));
    expect(replayed.find((x) => x.id.endsWith("/group/billing-admins"))!.text).toBe("group:billing-admins grants_admin_on app:billing\nperson:u01 member_of group:billing-admins");
  });

  it("the schema classifies every field each connector reads and every path it requests", async () => {
    const paged = structuredClone(NORTHWIND_TICKETS);
    const projects = paged.api.find((r) => r.path === "/graphql?query=projects")!.versions[0].body as { data: { projects: { nodes: { slugId: string; issues: { nodes: unknown[]; pageInfo: unknown } }[] } } };
    const checkout = projects.data.projects.nodes.find((n) => n.slugId === "checkout-v2")!;
    const [first, ...rest] = checkout.issues.nodes;
    checkout.issues = { nodes: [first], pageInfo: { hasNextPage: true, endCursor: "c1" } };
    paged.api.push({ path: "/graphql?query=project-issues&project=checkout-v2&after=c1", versions: [{ from: "2025-01-01T00:00:00Z", body: { data: { project: { issues: { nodes: rest, pageInfo: { hasNextPage: false, endCursor: null } } } } } }] });
    const cases: [string, CompanyFixture][] = [["okta", NORTHWIND_IDENTITY], ["google-workspace", NORTHWIND_IDENTITY], ["linear", paged], ["jira", NORTHWIND_TICKETS], ["slack", NORTHWIND]];
    for (const [provider, fixture] of cases) {
      const { api, reads } = recordingOf(recordedApi({ responses: Object.fromEntries(fixture.api.map((r) => [r.path, r.versions.at(-1)!.body])) }));
      await connectorFor(PROVIDER_CONNECTOR[provider], provider)!.read(api);
      const fields = [...new Set(Object.values(reads).flatMap((s) => [...s]))];
      expect({ provider, unclassified: fields.filter((f) => !(f in SCHEMAS[provider].fields)) }).toEqual({ provider, unclassified: [] });
      expect(() => scrub(rec(provider, Object.fromEntries(Object.keys(reads).map((p) => [p, null]))), SALT)).not.toThrow();
    }
  });

  it("every committed recording passes the schema check and replays to records through its connector", async () => {
    const files = existsSync(RECORDED) ? readdirSync(RECORDED).filter((f) => f.endsWith(".json")) : [];
    for (const f of files) {
      const r = JSON.parse(readFileSync(join(RECORDED, f), "utf8")) as Recording;
      expect({ f, leaks: findLeaks(r) }).toEqual({ f, leaks: [] });
      expect({ f, connector: r.connector }).toEqual({ f, connector: PROVIDER_CONNECTOR[r.provider] });
      expect((await connectorFor(r.connector, r.provider)!.read(recordedApi(r))).length).toBeGreaterThan(0);
    }
  });
});
