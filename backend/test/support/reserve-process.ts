// A separate OS process that opens the shared ledger file and reserves once when told to.
// Used to prove that a reservation's quota check and insert are one atomic transaction.
import { createInterface } from "node:readline";
import { CrowboError } from "../../src/domain/errors";
import { SqlLedger } from "../../src/storage/sql-store";
import { SqliteStorage } from "./sqlite";

const [path, settingsJson] = process.argv.slice(2);
const storage = new SqliteStorage(path);
const ledger = new SqlLedger(storage.storage, JSON.parse(settingsJson));
process.stdout.write("ready\n");
const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (line !== "go") continue;
  let outcome: string;
  try {
    await ledger.reserve("glm", "review");
    outcome = "reserved";
  } catch (error) {
    outcome = error instanceof CrowboError ? error.message : `unexpected: ${String(error)}`;
  }
  storage.close();
  process.stdout.write(`${JSON.stringify(outcome)}\n`);
  break;
}
lines.close();
