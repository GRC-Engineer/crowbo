import type { Assessment, Grant, SourceRevision } from "../domain/contracts";

/** Records, heads and search chunks for one tenant. Implemented by the tenant Durable Object. */
export interface Store {
  get(id: string): Promise<Record<string, any> | null>;
  getMany(ids: readonly string[]): Promise<Record<string, Record<string, any>>>;
  /**
   * `insertOnly`: fail unless the row is absent. `expectedHash`: fail unless the current body
   * hashes to it (compare-and-swap). Failures raise CrowboError.
   */
  put(id: string, kind: string, body: Record<string, any>, options?: PutOptions): Promise<void>;
  heads(reader: string, groups: readonly string[]): Promise<Record<string, any>[]>;
  /** Records of one kind, optionally only those stored under `logicalId` (e.g. a subject key). */
  scan(kind: string, logicalId?: string): Promise<Record<string, any>[]>;
  index(source: SourceRevision, grant: Grant, generation: number): Promise<void>;
  refreshIndex(source: SourceRevision, grant: Grant, generation: number): Promise<void>;
  deleteChunks(logicalId: string, generation: number): Promise<void>;
  search(reader: string, query: string, mode: "semantic" | "keyword", limit: number, groups: readonly string[]): Promise<SearchHit[]>;
}

export type PutOptions = {
  logicalId?: string;
  revisionId?: string;
  readers?: readonly string[];
  readerGroups?: readonly string[];
  expiresAt?: string | null;
  expectedHash?: string | null;
  insertOnly?: boolean;
};

export type SearchHit = { logical_id: string; revision_id: string; generation?: number | null };

/** Assesses one source revision against configured questions (Jev). */
export interface Assessor {
  assess(source: SourceRevision): Promise<Assessment>;
}

/** Bounded provider allowance: every external call reserves first and records a receipt. */
export interface Ledger {
  reserve(provider: string, operation: string): Promise<number>;
  receipt(call: number, values: Record<string, unknown>): Promise<void>;
}
