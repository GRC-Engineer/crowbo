// Give one named person their own Crowbo demo: a fresh token in your Keychain and an operator entry
// with its own tenant, so their calls and outcomes never mix with anyone else's. The token is never
// printed; read it from the Keychain when you send it to them over a private channel.
// Usage: bun scripts/new-tester.ts <name>     (letters, digits, dashes)
// Then add the printed entry to the staging CROWBO_OPERATORS secret (a Cloudflare change: confirm first).
// Revoke: remove the entry from CROWBO_OPERATORS; their connector stops working on the next request.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const name = process.argv[2];
if (!name || !/^[a-z0-9][a-z0-9-]{1,30}$/.test(name)) {
  console.error("usage: bun scripts/new-tester.ts <name>  (lowercase letters, digits, dashes)");
  process.exit(2);
}
const token = Buffer.from(randomBytes(32)).toString("base64url");
const service = `crowbo/tester/${name}`;
// -U updates an existing entry; the value goes in as an argument to /usr/bin/security only, never to stdout.
execFileSync("/usr/bin/security", ["add-generic-password", "-U", "-a", "crowbo", "-s", service, "-w", token], { stdio: "ignore" });
const entry = {
  [createHash("sha256").update(token, "utf8").digest("hex")]: {
    tenant: `demo-${name}`, reader: name, teams: [], roles: ["operator"], source_scopes: [], query_processors: [], experiment_id: `demo-${name}`,
  },
};
console.log(`Token stored in Keychain as ${service} (not printed).`);
console.log("Add this entry to the staging CROWBO_OPERATORS secret:");
console.log(JSON.stringify(entry, null, 2));
