import Turbopuffer, { APIError, NotFoundError } from "@turbopuffer/turbopuffer";
import { digest } from "../domain/canonical";
import { type Grant, logicalId, revisionId, type SourceRevision } from "../domain/contracts";
import { CrowboError } from "../domain/errors";
import { now } from "../domain/time";
import type { Ledger, SearchHit } from "../services/ports";
import type { ChunkIndex } from "../storage/sql-store";
import { type FetchLike, fixedHostFetch } from "./http";

/**
 * Search chunks in Turbopuffer: BM25 plus native Voyage embeddings, access-filtered and
 * generation-guarded. This is a rebuildable index only; records live in the tenant object.
 */
export const CHUNK_SCHEMA = {
  logical_id: "string",
  revision_id: "string",
  generation: "uint",
  access_checked_at: "datetime",
  readers: "[]string",
  reader_groups: "[]string",
  expires_at: "datetime",
  chunk_text: { type: "string", full_text_search: true, embed: { model: "voyage/voyage-4-large", dims: 1024 } },
  offset_start: "uint",
  offset_end: "uint",
} as const;

export const REGION = "aws-eu-west-2";

export class TurbopufferChunks implements ChunkIndex {
  private readonly namespace;
  private schemaReady = false;

  constructor(
    apiKey: string,
    namespacePrefix: string,
    private readonly ledger: Ledger,
    fetchImpl?: FetchLike,
  ) {
    const client = new Turbopuffer({
      apiKey,
      region: REGION,
      baseURL: "https://{region}.turbopuffer.com",
      maxRetries: 0,
      timeout: 30_000,
      fetch: (fetchImpl ?? fixedHostFetch(`${REGION}.turbopuffer.com`)) as any,
    });
    this.namespace = client.namespace(`${namespacePrefix}-chunks`);
  }

  private async call<T extends { billing?: unknown }>(operation: string, run: () => Promise<T>): Promise<T> {
    const call = await this.ledger.reserve("turbopuffer", operation);
    try {
      const result = await run();
      await this.ledger.receipt(call, { ok: true, billing: result.billing ?? null });
      return result;
    } catch (error) {
      if (error instanceof NotFoundError) {
        await this.ledger.receipt(call, { http_status: 404 });
        throw error;
      }
      await this.ledger.receipt(call, { ok: false });
      if (error instanceof APIError || error instanceof TypeError || error instanceof CrowboError) {
        throw new CrowboError("Turbopuffer request failed; source preparation remains resumable");
      }
      throw error;
    }
  }

  static audience(reader: string, groups: readonly string[]): any {
    const direct = ["readers", "Contains", reader];
    return groups.length ? ["Or", [direct, ["reader_groups", "ContainsAny", [...groups]]]] : direct;
  }

  static rows(source: SourceRevision, generation: number) {
    const text = `${source.title}\n${source.text}`;
    // Offsets are code points, as in the Python pilot.
    const chars = [...text];
    const rows = [];
    for (let start = 0; start < chars.length; start += 1000) {
      const end = Math.min(chars.length, start + 1200);
      rows.push({
        id: generation === 0 ? digest([revisionId(source), start, "chunks-v1"]) : digest([logicalId(source), generation, start, "chunks-v2"]),
        logical_id: logicalId(source),
        revision_id: revisionId(source),
        generation,
        offset_start: start,
        offset_end: end,
        chunk_text: chars.slice(start, end).join(""),
      });
    }
    return rows;
  }

  static access(grant: Grant) {
    return {
      readers: grant.revoked ? [] : [...grant.readers],
      reader_groups: grant.revoked ? [] : [...grant.reader_groups],
      expires_at: grant.expires_at,
      access_checked_at: grant.checked_at,
    };
  }

  private static olderAccess(): any {
    return ["Or", [["access_checked_at", "Eq", null], ["access_checked_at", "Lte", { $ref_new: "access_checked_at" }]]];
  }

  private static generations(logical: string, generation: number, comparison: "Lt" | "Lte"): any {
    return ["And", [["logical_id", "Eq", logical], ["Or", [["generation", "Eq", null], ["generation", comparison, generation]]]]];
  }

  private async configure() {
    if (this.schemaReady) return;
    // Filter evaluation precedes schema changes within a write request.
    await this.call("configure_index", () => this.namespace.write({ schema: CHUNK_SCHEMA as any, distance_metric: "cosine_distance" }));
    this.schemaReady = true;
  }

  async index(source: SourceRevision, grant: Grant, generation = 0) {
    let exists = true;
    const vectors = new Map<string, number[]>();
    try {
      const previous = await this.call("reuse_vectors", () =>
        this.namespace.query({
          filters: ["logical_id", "Eq", logicalId(source)],
          rank_by: ["id", "asc"],
          top_k: 120,
          include_attributes: ["chunk_text", "embed_chunk_text"],
          consistency: { level: "strong" },
        } as any),
      );
      for (const row of (previous.rows ?? []) as any[]) {
        const vector = row.embed_chunk_text ?? row.attributes?.embed_chunk_text;
        const chunk = row.chunk_text ?? row.attributes?.chunk_text;
        if (Array.isArray(vector) && vector.length === 1024) vectors.set(chunk, vector);
      }
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
      exists = false;
    }
    if (exists) await this.configure();
    const rows = TurbopufferChunks.rows(source, generation).map((row) => ({
      ...row,
      ...TurbopufferChunks.access(grant),
      ...(vectors.has(row.chunk_text) ? { embed_chunk_text: vectors.get(row.chunk_text) } : {}),
    }));
    const conditions: Record<string, unknown> = {};
    if (exists) {
      conditions.upsert_condition = TurbopufferChunks.olderAccess();
      if (generation) conditions.delete_by_filter = TurbopufferChunks.generations(logicalId(source), generation, "Lt");
    }
    const result = await this.call("index", () =>
      this.namespace.write({ upsert_rows: rows, ...conditions, schema: CHUNK_SCHEMA, distance_metric: "cosine_distance" } as any),
    );
    if (result.rows_upserted !== rows.length || result.rows_remaining) {
      throw new CrowboError("Search generation was not fully published; resume preparation");
    }
    this.schemaReady = true;
  }

  async refreshIndex(source: SourceRevision, grant: Grant, generation: number) {
    await this.configure();
    const rows = TurbopufferChunks.rows(source, generation).map((row) => ({ id: row.id, ...TurbopufferChunks.access(grant) }));
    const result = await this.call("refresh_index_access", () =>
      this.namespace.write({ patch_rows: rows, patch_condition: TurbopufferChunks.olderAccess(), schema: CHUNK_SCHEMA } as any),
    );
    if (result.rows_patched !== rows.length) throw new CrowboError("Search permissions were not fully refreshed; resume preparation");
  }

  async deleteChunks(logical: string, generation: number) {
    try {
      await this.configure();
      const result = await this.call("withdraw_chunks", () =>
        this.namespace.write({ delete_by_filter: TurbopufferChunks.generations(logical, generation, "Lte"), schema: CHUNK_SCHEMA } as any),
      );
      if (result.rows_remaining) throw new CrowboError("Withdrawn chunks remain; resume withdrawal");
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  }

  async search(reader: string, query: string, mode: "semantic" | "keyword", limit: number, groups: readonly string[]): Promise<SearchHit[]> {
    const rank = mode === "semantic" ? ["chunk_text", "ANN", ["Embed", query]] : ["chunk_text", "BM25", query];
    try {
      const result = await this.call(`search_${mode}`, () =>
        this.namespace.query({
          rank_by: rank,
          top_k: limit,
          filters: ["And", [TurbopufferChunks.audience(reader, groups), ["expires_at", "Gt", now()]]],
          include_attributes: ["logical_id", "revision_id", "generation"],
          consistency: { level: "strong" },
        } as any),
      );
      return ((result.rows ?? []) as any[]).map((row) => ({
        logical_id: row.logical_id ?? row.attributes?.logical_id,
        revision_id: row.revision_id ?? row.attributes?.revision_id,
        generation: row.generation ?? row.attributes?.generation ?? null,
      }));
    } catch (error) {
      if (error instanceof NotFoundError) return [];
      throw error;
    }
  }
}

/** For local development and tests without a Turbopuffer key: indexing succeeds, search is empty. */
export class NoSearchIndex implements ChunkIndex {
  async index() {}
  async refreshIndex() {}
  async deleteChunks() {}
  async search() {
    return [];
  }
}
