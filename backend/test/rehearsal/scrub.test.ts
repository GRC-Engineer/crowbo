import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../src/engine/connectors";
import { OKTA_DEPROVISIONED } from "../../src/engine/identity";
import { connectorFor, PROVIDER_CONNECTOR, type Recording, recordedApi } from "../../scripts/rehearsal/recording";
import { ROSTER } from "../../scripts/rehearsal/roster";
import { findLeaks, scrub } from "../../scripts/rehearsal/scrub";

const RECORDED = join(import.meta.dirname, "../fixtures/recorded");
// Token-shaped strings are assembled here so this file itself holds none.
const fake = (...parts: string[]) => parts.join("");
const ORG = "https://dev-31337.okta.com";
const SANDBOX = "crowbo-sandbox.test";

/** What a recorder would capture from an Okta developer org: real ids, a cursor, the admin, a token in a note. */
function rawOkta(): Recording {
  const user = (id: string, login: string, status = "ACTIVE") => ({
    id, status, lastLogin: "2026-10-10T10:00:01.000Z",
    profile: { login, email: login, firstName: login.split("@")[0], lastName: "Example" },
    _links: { self: { href: `${ORG}/api/v1/users/${id}` } },
  });
  const people = [user("00u1a2b3c4d5e6f7g8h9", `priya@${SANDBOX}`), user("00u9h8g7f6e5d4c3b2a1", `u01@${SANDBOX}`)];
  const admin = user("00uADMIN00000000000x", `founder@${SANDBOX}`);
  return {
    connector: "identity", provider: "okta", recorded_at: "2026-10-20T09:00:00Z",
    responses: {
      "/api/v1/groups": [{ id: "00gBILLING0000000001", profile: { name: "billing-admins", app: "billing", description: fake("note: ", "xo", "xb-", "1234567890-abcdefghij") } }],
      "/api/v1/apps": [{ id: "0oaBILLING0000000001", name: "bookmark", label: "billing", profile: { businessOwner: `priya@${SANDBOX}` }, _links: { self: { href: `${ORG}/api/v1/apps/0oaBILLING0000000001` } } }],
      "/api/v1/users": [admin, people[0]],
      [`/api/v1/users?after=00u1a2b3c4d5e6f7g8h9&limit=200`]: [people[1]],
      [OKTA_DEPROVISIONED]: [],
      "/api/v1/groups/00gBILLING0000000001/users": [people[1]],
    },
    links: { "/api/v1/users": `/api/v1/users?after=00u1a2b3c4d5e6f7g8h9&limit=200`, [`/api/v1/users?after=00u1a2b3c4d5e6f7g8h9&limit=200`]: null },
  };
}

const read = async (r: Recording) => connectorFor(r.connector, r.provider)!.read(recordedApi(r));

describe("scrubbing recordings", () => {
  it("a raw recording leaks ids, emails, the org host, a cursor, a name and a token; the scrubbed one leaks none", () => {
    const raw = rawOkta();
    const leaks = findLeaks(raw).join("\n");
    for (const kind of ["slack token", `email outside`, "URL host", "account identifier", "person's name"]) expect(leaks).toContain(kind);
    expect(findLeaks(scrub(raw, ROSTER.people))).toEqual([]);
  });

  it("the scrubbed recording reads the same records: joins through ids and Link pages still hold", async () => {
    const raw = rawOkta();
    const clean = scrub(raw, ROSTER.people);
    const [before, after] = [await read(raw), await read(clean)];
    expect(after.map((x) => x.id)).toEqual(before.map((x) => x.id));
    expect(after.map((x) => x.completeness)).toEqual(before.map((x) => x.completeness));
    // Synthetic people keep their names; the sandbox admin becomes a numbered person.
    const accounts = after.find((x) => x.id.endsWith("/accounts"))!.text;
    expect(accounts).toContain("person:priya account_status active");
    expect(accounts).toContain("person:u01 account_status active");
    expect(accounts).not.toContain("founder");
    expect(after.find((x) => x.id.endsWith("/group/billing-admins"))!.text).toBe("group:billing-admins grants_admin_on app:billing\nperson:u01 member_of group:billing-admins");
  });

  it("identifiers are replaced whole, never inside other values", () => {
    const r: Recording = { connector: "tickets", provider: "jira", recorded_at: "x", responses: { "/rest/api/3/project/NW/versions": [{ id: "10001", name: "checkout-v2", releaseDate: "2026-10-01", description: "10001 open issues" }] } };
    const [v] = scrub(r, ROSTER.people).responses["/rest/api/3/project/NW/versions"] as Record<string, string>[];
    expect(v).toEqual({ id: "id-1", name: "checkout-v2", releaseDate: "2026-10-01", description: "10001 open issues" });
  });

  it("every committed recording is scrubbed and replays to records through its connector", async () => {
    const files = existsSync(RECORDED) ? readdirSync(RECORDED).filter((f) => f.endsWith(".json")) : [];
    for (const f of files) {
      const r = JSON.parse(readFileSync(join(RECORDED, f), "utf8")) as Recording;
      expect({ f, leaks: findLeaks(r) }).toEqual({ f, leaks: [] });
      expect({ f, connector: r.connector }).toEqual({ f, connector: PROVIDER_CONNECTOR[r.provider] });
      expect((await read(r)).length).toBeGreaterThan(0);
    }
  });
});
