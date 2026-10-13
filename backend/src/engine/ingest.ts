import type { CompanyFixture, Connector, Rail, SourceRecord } from "./model";

/**
 * Layer 01, ingest. A connector reads one tool on its own schedule and returns the current
 * revision of each item. The prototype's connectors read a synthetic fixture; real ones call
 * Okta, GitHub, Workday and so on, each with its own sync cursor (see services/sync.ts for Slack).
 */

/** Serves the latest revision of each fixture record for one connector. Later revisions win. */
export class FixtureConnector implements Connector {
  constructor(
    readonly id: string,
    readonly rail: Rail,
    private records: SourceRecord[],
  ) {}

  /** A new revision arrives (an edit in the tool); the next read returns it. */
  receive(record: SourceRecord): void {
    if (record.connector !== this.id) throw new Error(`Record ${record.id} belongs to ${record.connector}, not ${this.id}`);
    this.records.push(record);
  }

  read(): SourceRecord[] {
    const latest = new Map<string, SourceRecord>();
    for (const r of this.records) if ((latest.get(r.id)?.revision ?? -1) < r.revision) latest.set(r.id, r);
    return [...latest.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }
}

export function connectorsFor(fixture: CompanyFixture): Map<string, FixtureConnector> {
  const byConnector = new Map<string, FixtureConnector>();
  for (const r of fixture.records) {
    if (!byConnector.has(r.connector)) byConnector.set(r.connector, new FixtureConnector(r.connector, r.rail, []));
    byConnector.get(r.connector)!.receive(structuredClone(r));
  }
  return byConnector;
}

/**
 * Read every connector and keep only what the viewer may read. Access is applied here, before
 * extraction, so nothing derived (facts, edges, decisions) can carry restricted content.
 */
export function ingest(connectors: Iterable<Connector>, viewer: string): { readable: SourceRecord[]; withheld: number } {
  const readable: SourceRecord[] = [];
  let withheld = 0;
  for (const c of connectors) {
    for (const r of c.read()) {
      if (r.readers.includes(viewer)) readable.push(r);
      else withheld++;
    }
  }
  return { readable, withheld };
}
