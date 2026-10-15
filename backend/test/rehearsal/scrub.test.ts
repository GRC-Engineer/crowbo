import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../src/engine/connectors";
import { OKTA_DEPROVISIONED } from "../../src/engine/identity";
import { recordProvider } from "../../scripts/rehearsal/record";
import { connectorFor, PROVIDER_CONNECTOR, type Recording, recordedApi } from "../../scripts/rehearsal/recording";
import { findLeaks, scrub } from "../../scripts/rehearsal/scrub";

const RECORDED = join(import.meta.dirname, "../fixtures/recorded");
// Credential-shaped strings are assembled here so this file itself holds none.
const fake = (...parts: string[]) => parts.join("");
const ORG = "https://dev-31337.okta.com";
const SANDBOX = "crowbo-sandbox.test";
const NOW = new Date("2026-10-20T09:00:00Z");

/** What an Okta developer org answers: real ids, links, the admin, the default group, a token in a description. */
function rawOkta(): Recording {
  const user = (id: string, login: string, status = "ACTIVE") => ({
    id, status, created: "2026-10-01T09:00:00.000Z", lastLogin: "2026-10-10T10:00:01.000Z",
    profile: { login, email: login, firstName: login.split("@")[0], lastName: "Okonkwo-Reyes", mobilePhone: "+44 7700 900123" },
    credentials: { provider: { type: "OKTA", name: "OKTA" } },
    _links: { self: { href: `${ORG}/api/v1/users/${id}` } },
  });
  const priya = user("00u1a2b3c4d5e6f7g8h9", `priya@northwind.example`);
  const u01 = user("00u9h8g7f6e5d4c3b2a1", `u01@northwind.example`);
  const admin = user("00uADMIN00000000000x", `founder@${SANDBOX}`);
  return {
    connector: "identity", provider: "okta", recorded_at: NOW.toISOString(),
    responses: {
      "/api/v1/groups": [
        { id: "00gEVERYONE000000001", profile: { name: "Everyone", description: "All users in your organization" } },
        { id: "00gBILLING0000000001", created: "2026-10-01T09:00:00.000Z", profile: { name: "billing-admins", app: "billing", description: fake("note: ", "xo", "xb-", "1234567890-abcdefghij") }, createdBy: "00uADMIN00000000000x" },
      ],
      "/api/v1/apps": [{ id: "0oaBILLING0000000001", name: "bookmark", label: "billing", profile: { businessOwner: `priya@northwind.example` }, settings: { app: { url: "https://billing.northwind.example" } } }],
      "/api/v1/users": [admin, priya],
      "/api/v1/users?after=00u1a2b3c4d5e6f7g8h9&limit=200": [u01],
      [OKTA_DEPROVISIONED]: [],
      "/api/v1/groups/00gEVERYONE000000001/users": [admin, priya, u01],
      "/api/v1/groups/00gBILLING0000000001/users": [u01],
    },
    links: { "/api/v1/users": "/api/v1/users?after=00u1a2b3c4d5e6f7g8h9&limit=200", "/api/v1/users?after=00u1a2b3c4d5e6f7g8h9&limit=200": null },
  };
}

const read = async (r: Recording) => connectorFor(r.connector, r.provider)!.read(recordedApi(r));

/** Shapes the review found surviving a key-based scrub: each must be a leak raw, and be gone once scrubbed. */
const SHAPES: [string, unknown][] = [
  ["an id under an unlisted key", { createdBy: "00uADMIN00000000000x", groupId: "00gBILLING0000000001", creator: "U012ABCDEF", inviter: "U012ABCDEG" }],
  ["ids in a list", { members: ["U012ABCDEF", "W0123ABCD"] }],
  ["an id inside a URL", { href: "/api/v1/users/00uB000000000000000x/groups", self: "https://x.atlassian.net/rest/api/3/user?accountId=5b10a2844c20165700ede21g" }],
  ["a numeric id", { id: 10042 }],
  ["ids and a name in free text", { summary: "Morgan Okonkwo-Reyes asked U012ABCDEF about customer C03abcde9" }],
  ["a host without a scheme", { domain: "dev-123456.okta.com", site: "acme.atlassian.net" }],
  ["unpatterned secrets", { refresh: fake("1//0", "gAbCdEfGhIjKlMnOpQrStUv"), secret: fake("GOCSPX", "-abcdefghijklmnopqrstuvwx"), signing: "8f14e45fceea167a5a36dedd4bea2543" }],
  ["an encoded email", { note: "morgan%40crowbo-sandbox.test" }],
  ["a token", { text: fake("xo", "xp-", "1234567890-0987654321-abcdefabcdef") }],
];

describe("scrubbing recordings: fail closed", () => {
  for (const [what, body] of SHAPES) {
    it(`${what}: a leak before scrubbing, gone after`, () => {
      const r: Recording = { connector: "identity", provider: "okta", recorded_at: "x", responses: { "/api/v1/groups": [body] } };
      expect(findLeaks(r).length).toBeGreaterThan(0);
      const clean = scrub(r);
      expect(findLeaks(clean)).toEqual([]);
      for (const v of Object.values(body as Record<string, unknown>).flat()) expect(JSON.stringify(clean)).not.toContain(String(v));
    });
  }

  it("an id used as an object key, or in a path, is a leak; a path id is replaced consistently with its body", () => {
    expect(findLeaks({ connector: "identity", provider: "okta", recorded_at: "x", responses: { "/x": { "00uKEY00000000000001": true } } })).toEqual(["a response: unrecognised key"]);
    const r: Recording = { connector: "identity", provider: "okta", recorded_at: "x", responses: { "/api/v1/groups": [{ id: "00gPATHONLY000000001" }], "/api/v1/groups/00gPATHONLY000000001/users": [] } };
    expect(findLeaks(r)).toContain("a response path: unrecognised path part");
    expect(Object.keys(scrub(r).responses)).toEqual(["/api/v1/groups", "/api/v1/groups/id-1/users"]);
  });

  it("recording an Okta sandbox keeps only what the connector read, leaks nothing, and reads the same records", async () => {
    const raw = rawOkta();
    const { recording, records } = await recordProvider("okta", recordedApi(raw), [SANDBOX], NOW);
    expect(findLeaks(recording)).toEqual([]);
    const text = JSON.stringify(recording);
    for (const gone of ["mobilePhone", "_links", "createdBy", "Okonkwo", "dev-31337", "founder", "00u", "00g", "Everyone"]) expect(text).not.toContain(gone);
    const [before, after] = [await read(raw), await read(recording)];
    expect(after.length).toBe(records);
    expect(after.map((x) => x.completeness)).toEqual(before.map((x) => x.completeness));
    const accounts = after.find((x) => x.id.endsWith("/accounts"))!.text;
    expect(accounts).toContain("person:priya account_status active");
    expect(accounts).toContain("person:person-1 account_status active");
    expect(after.find((x) => x.id.endsWith("/group/billing-admins"))!.text).toBe("group:billing-admins grants_admin_on app:billing\nperson:u01 member_of group:billing-admins");
  });

  it("identifiers are replaced whole, never inside other values, and untouched path bytes are kept", () => {
    const search = "/rest/api/3/search/jql?jql=project%3DNW&fields=labels,status,resolution,assignee,fixVersions";
    const r: Recording = { connector: "tickets", provider: "jira", recorded_at: "x", responses: { "/rest/api/3/project/NW/versions": [{ id: "10001", name: "checkout-v2", releaseDate: "2026-10-01" }], [search]: { isLast: true, issues: [] } } };
    const clean = scrub(r);
    expect(clean.responses["/rest/api/3/project/NW/versions"]).toEqual([{ id: "id-1", name: "checkout-v2", releaseDate: "2026-10-01" }]);
    expect(Object.keys(clean.responses)).toContain(search);
  });

  it("every committed recording is on the allowlist and replays to records through its connector", async () => {
    const files = existsSync(RECORDED) ? readdirSync(RECORDED).filter((f) => f.endsWith(".json")) : [];
    for (const f of files) {
      const r = JSON.parse(readFileSync(join(RECORDED, f), "utf8")) as Recording;
      expect({ f, leaks: findLeaks(r) }).toEqual({ f, leaks: [] });
      expect({ f, connector: r.connector }).toEqual({ f, connector: PROVIDER_CONNECTOR[r.provider] });
      expect((await read(r)).length).toBeGreaterThan(0);
    }
  });
});
