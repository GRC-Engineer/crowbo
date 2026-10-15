import { describe, expect, it } from "vitest";
import { changedParts, digest, type PinnedSource, partsOf, revisionOf } from "../../scripts/contract-hash";

/**
 * Subset pins: a provider that revises its document often (Google, Jira) is pinned by the parts the
 * connectors use. These small documents stand in for the real ones, so the rule is tested everywhere.
 */

const bytes = (doc: unknown) => new TextEncoder().encode(JSON.stringify(doc));

const GOOGLE: PinnedSource = { label: "g", url: "", sha256: "", hash: "subset", subset: { methods: ["admin/directory/v1/users"] }, file: "", format: "google-discovery", committed: false };
const google = () => ({
  revision: "20261012", rootUrl: "https://admin.googleapis.com/", servicePath: "",
  resources: {
    users: { methods: { list: { httpMethod: "GET", path: "admin/directory/v1/users", parameters: { pageToken: { location: "query" }, customer: { location: "query" } }, response: { $ref: "Users" }, scopes: ["a.readonly", "b"] } } },
    chromeosdevices: { methods: { list: { httpMethod: "GET", path: "admin/directory/v1/customer/{customerId}/devices/chromeos", response: { $ref: "ChromeOsDevices" } } } },
  },
  schemas: { Users: { properties: { users: { items: { $ref: "User" } }, nextPageToken: { type: "string" } } }, User: { properties: { primaryEmail: { type: "string" } } }, ChromeOsDevices: { properties: {} } },
});

const JIRA: PinnedSource = { label: "j", url: "", sha256: "", hash: "subset", subset: { paths: ["/rest/api/3/search/jql"], schemas: ["Version"] }, file: "", format: "openapi", committed: false };
const jira = () => ({
  info: { version: "1001.0.0-SNAPSHOT-aaa" },
  paths: {
    "/rest/api/3/search/jql": { get: { parameters: [{ name: "nextPageToken", in: "query" }], responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/Results" } } } } } }, post: { summary: "not read" } },
    "/rest/api/3/dashboard": { get: { summary: "not read" } },
  },
  components: { schemas: { Results: { properties: { isLast: { type: "boolean" } } }, Version: { properties: { name: { type: "string" } } }, Dashboard: { properties: {} } } },
});

describe("subset pins", () => {
  it("Google: a change elsewhere in the document, a new revision or a reordered list keeps the pin", () => {
    const pinned = digest(GOOGLE, bytes(google()));
    const elsewhere = google();
    elsewhere.revision = "20261020";
    elsewhere.schemas.ChromeOsDevices = { properties: { serialNumber: { type: "string" } } } as never;
    elsewhere.resources.users.methods.list.scopes = ["b", "a.readonly"];
    expect(digest(GOOGLE, bytes(elsewhere))).toBe(pinned);
    expect(revisionOf(GOOGLE, bytes(elsewhere))).toBe("20261020");
  });

  it("Google: a change to a parameter or a schema the connector reads breaks the pin and names the part", () => {
    const before = partsOf(GOOGLE, bytes(google()));
    const param = google();
    delete (param.resources.users.methods.list.parameters as Record<string, unknown>).pageToken;
    expect(digest(GOOGLE, bytes(param))).not.toBe(digest(GOOGLE, bytes(google())));
    expect(changedParts(before, partsOf(GOOGLE, bytes(param)))).toEqual(["method:admin/directory/v1/users"]);
    const schema = google();
    schema.schemas.User = { properties: { primaryEmail: { type: "integer" } } } as never;
    expect(changedParts(before, partsOf(GOOGLE, bytes(schema)))).toEqual(["schema:User"]);
    const gone = google();
    delete (gone.resources as Record<string, unknown>).users;
    expect(changedParts(before, partsOf(GOOGLE, bytes(gone)))).toContain("method:admin/directory/v1/users");
  });

  it("Jira: another path, another method on the same path or another schema keeps the pin; a read schema breaks it", () => {
    const pinned = digest(JIRA, bytes(jira()));
    const elsewhere = jira();
    elsewhere.info.version = "1001.0.0-SNAPSHOT-bbb";
    elsewhere.paths["/rest/api/3/dashboard"].get.summary = "changed";
    elsewhere.paths["/rest/api/3/search/jql"].post.summary = "changed";
    elsewhere.components.schemas.Dashboard = { properties: { id: { type: "string" } } } as never;
    expect(digest(JIRA, bytes(elsewhere))).toBe(pinned);
    const read = jira();
    read.components.schemas.Results = { properties: { isLast: { type: "string" } } } as never;
    expect(changedParts(partsOf(JIRA, bytes(jira())), partsOf(JIRA, bytes(read)))).toEqual(["schemas/Results"]);
    const named = jira();
    named.components.schemas.Version = { properties: {} } as never;
    expect(changedParts(partsOf(JIRA, bytes(jira())), partsOf(JIRA, bytes(named)))).toEqual(["schemas/Version"]);
  });

  it("a versioned release is pinned whole, by its bytes", () => {
    const whole: PinnedSource = { ...JIRA, hash: undefined };
    const a = digest(whole, bytes(jira()));
    const elsewhere = jira();
    elsewhere.paths["/rest/api/3/dashboard"].get.summary = "changed";
    expect(digest(whole, bytes(elsewhere))).not.toBe(a);
  });
});
