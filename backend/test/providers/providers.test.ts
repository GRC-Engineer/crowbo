// Port of tests/test_providers.py. httpx MockTransport becomes an injected fetch; the pinned
// host, redirect and size checks are exercised through fixedHostFetch with a stub base fetch.
import { describe, expect, it } from "vitest";
import { logicalId, revisionId } from "../../src/domain/contracts";
import { CrowboError } from "../../src/domain/errors";
import { Jev } from "../../src/providers/cloudflare-ai";
import { type FetchLike, fixedHostFetch } from "../../src/providers/http";
import { NoSearchIndex, TurbopufferChunks } from "../../src/providers/turbopuffer";
import { SqlStore } from "../../src/storage/sql-store";
import { SqliteStorage } from "../support/sqlite";
import { answers, makeItem, makeSettings, MemoryLedger } from "../helpers";

function payload(): Record<string, any> {
  return {
    success: true,
    errors: [],
    result: {
      state: "Completed",
      result: { model: "jev-test", answers: answers(), usage: { input_tokens: 40, output_tokens: 20 } },
    },
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function jev(fetch: FetchLike, ledger = new MemoryLedger()) {
  const settings = makeSettings();
  return new Jev({ account: settings.cloudflare_account, gateway: settings.gateway, token: "test-token", fetch }, ledger);
}

describe("Jev", () => {
  it("py: tests/test_providers.py::test_jev_validates_nested_response_and_disables_payload_logging", async () => {
    const item = makeItem();
    const adapter = jev(async (url, init) => {
      expect(new URL(url).host).toBe("api.cloudflare.com");
      const headers = new Headers(init?.headers);
      expect(headers.get("cf-aig-collect-log")).toBe("false");
      expect(headers.get("cf-aig-collect-log-payload")).toBe("false");
      expect(headers.get("cf-aig-skip-cache")).toBe("true");
      return json(payload());
    });
    const result = await adapter.assess(item.source);
    expect(result.source_revision).toBe(revisionId(item.source));
    expect((result.answers.commitment_evidence as any).choice).toBe("insufficient");
    expect(result.input_tokens).toBe(40);
  });

  // py: tests/test_providers.py::test_jev_invalid_responses_cannot_become_assessments[missing_answer]
  // py: tests/test_providers.py::test_jev_invalid_responses_cannot_become_assessments[probabilities]
  // py: tests/test_providers.py::test_jev_invalid_responses_cannot_become_assessments[failed_state]
  // py: tests/test_providers.py::test_jev_invalid_responses_cannot_become_assessments[failed_envelope]
  for (const failure of ["missing_answer", "probabilities", "failed_state", "failed_envelope"]) {
    it(`tests/test_providers.py::test_jev_invalid_responses_cannot_become_assessments[${failure}]`, async () => {
      const body = payload();
      if (failure === "missing_answer") delete body.result.result.answers.deadline_stated;
      else if (failure === "probabilities") body.result.result.answers.commitment_evidence.probabilities.sufficient = 1.0;
      else if (failure === "failed_state") body.result.state = "queued";
      else body.success = false;
      await expect(jev(async () => json(body)).assess(makeItem().source)).rejects.toBeInstanceOf(CrowboError);
    });
  }

  it("py: tests/test_providers.py::test_creating_jev_does_not_resolve_credentials", () => {
    // Credentials are resolved by the operation context, never by the adapter; constructing
    // one must not touch the network or reserve provider allowance.
    const ledger = new MemoryLedger();
    jev(() => {
      throw new Error("Construction must not call the provider");
    }, ledger);
    expect(ledger.calls).toEqual([]);
  });
});

describe("fixed-host transport", () => {
  // py: tests/test_providers.py::test_provider_transport_rejects_other_destinations[http://api.cloudflare.com/a]
  // py: tests/test_providers.py::test_provider_transport_rejects_other_destinations[https://attacker.example/a]
  // py: tests/test_providers.py::test_provider_transport_rejects_other_destinations[https://api.cloudflare.com:444/a]
  for (const url of ["http://api.cloudflare.com/a", "https://attacker.example/a", "https://api.cloudflare.com:444/a"]) {
    it(`tests/test_providers.py::test_provider_transport_rejects_other_destinations[${url}]`, async () => {
      let called = false;
      const client = fixedHostFetch("api.cloudflare.com", 8_000_000, async () => {
        called = true;
        return new Response("");
      });
      await expect(client(url)).rejects.toThrow(new CrowboError("Provider request destination is not permitted"));
      expect(called).toBe(false);
    });
  }

  it("py: tests/test_providers.py::test_provider_transport_rejects_redirects", async () => {
    let redirect: RequestInit["redirect"];
    const client = fixedHostFetch("api.cloudflare.com", 8_000_000, async (_url, init) => {
      redirect = init?.redirect;
      return new Response(null, { status: 302, headers: { location: "https://attacker.example" } });
    });
    await expect(client("https://api.cloudflare.com/test")).rejects.toThrow(/redirects/);
    expect(redirect).toBe("manual");
  });

  it("py: tests/test_providers.py::test_response_size_is_bounded", async () => {
    const client = fixedHostFetch("api.cloudflare.com", 4, async () => new Response("12345"));
    await expect(client("https://api.cloudflare.com/a")).rejects.toThrow(/size limit/);
    const exact = fixedHostFetch("api.cloudflare.com", 5, async () => new Response("12345"));
    expect(await (await exact("https://api.cloudflare.com/a")).text()).toBe("12345");
  });
});

describe("Turbopuffer search index", () => {
  it("py: tests/test_providers.py::test_index_reuses_unchanged_vectors_and_cleanup_only_targets_older_generations", async () => {
    const item = makeItem();
    const writes: any[] = [];
    const fetch: FetchLike = async (url, init) => {
      const body = JSON.parse(String(init?.body));
      if (new URL(url).pathname.endsWith("/query")) {
        return json({
          rows: [{ id: "prior", chunk_text: `${item.source.title}\n${item.source.text}`, embed_chunk_text: Array(1024).fill(0.25) }],
          billing: {},
        });
      }
      if (!("upsert_rows" in body) && !("patch_rows" in body)) {
        expect(body.schema.generation).toBe("uint");
        writes.push("schema_ready");
        return json({ rows_affected: 0, billing: {} });
      }
      // Conditional filters require the schema migration first.
      expect(writes[0]).toBe("schema_ready");
      writes.push(body);
      return json({ rows_affected: 1, rows_upserted: 1, rows_patched: 1, rows_deleted: 0, rows_remaining: false, billing: {} });
    };
    const store = new TurbopufferChunks("x".repeat(32), "synthetic", new MemoryLedger(), fetch);
    await store.index(item.source, item.grant, 2);
    expect(writes[1].upsert_rows[0].embed_chunk_text).toEqual(Array(1024).fill(0.25));
    expect(writes[1].delete_by_filter).toEqual([
      "And",
      [
        ["logical_id", "Eq", logicalId(item.source)],
        ["Or", [["generation", "Eq", null], ["generation", "Lt", 2]]],
      ],
    ]);
    await store.refreshIndex(item.source, item.grant, 2);
    expect(new Set(Object.keys(writes[2].patch_rows[0]))).toEqual(new Set(["id", "readers", "reader_groups", "expires_at", "access_checked_at"]));
    expect(writes[2].patch_rows[0].readers).toEqual(["operator"]);
    expect(writes[2].patch_condition).toEqual([
      "Or",
      [
        ["access_checked_at", "Eq", null],
        ["access_checked_at", "Lte", { $ref_new: "access_checked_at" }],
      ],
    ]);
  });

  it("py: tests/test_providers.py::test_batch_lookup_is_bounded_and_checks_returned_ids[None]", async () => {
    // Records moved from a Turbopuffer namespace to the tenant object's SQLite (SqlStore), so a
    // batch lookup is a local keyed read: still bounded, and it spends no provider allowance.
    const storage = new SqliteStorage();
    try {
      const store = new SqlStore(storage.storage.sql, new NoSearchIndex());
      const keys = ["a".repeat(64), "b".repeat(64)];
      for (const key of [...keys].reverse()) await store.put(key, "revision", { value: key });
      expect(await store.getMany([])).toEqual({});
      await expect(store.getMany(Array.from({ length: 121 }, (_, i) => String(i)))).rejects.toThrow(/limit/);
      expect(await store.getMany(keys)).toEqual(Object.fromEntries(keys.map((key) => [key, { value: key }])));
      expect(await store.getMany([...keys, "c".repeat(64)])).toEqual(Object.fromEntries(keys.map((key) => [key, { value: key }])));
      expect(storage.sql.exec<{ n: number }>("SELECT count(*) AS n FROM calls").one().n).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("py: tests/test_providers.py::test_missing_index_rows_are_not_claimed_as_refreshed", async () => {
    const item = makeItem();
    const store = new TurbopufferChunks("x".repeat(32), "synthetic", new MemoryLedger(), async () =>
      json({ rows_affected: 0, rows_patched: 0, billing: {} }),
    );
    await expect(store.refreshIndex(item.source, item.grant, 2)).rejects.toThrow(/not fully refreshed/);
  });
});
