"""SQLite FTS5 development experiment; not a hosted database benchmark."""

import argparse
import json
import platform
import re
import sqlite3
import statistics
import time
from pathlib import Path

from crowbo import FIXTURE, digest, packet, read_json, require


def search(connection, query, limit=5):
    terms = re.findall(r"[a-zA-Z0-9]+", query)
    if not terms:
        return []
    expression = " OR ".join('"' + term + '"' for term in terms[:40])
    return [row[0] for row in connection.execute(
        "SELECT id FROM evidence WHERE evidence MATCH ? ORDER BY bm25(evidence), id LIMIT ?",
        (expression, limit),
    )]


def run(queries_path):
    queries = read_json(queries_path)
    results = []
    for query in queries:
        basis = packet(FIXTURE, query["case"], "northstar-demo", "grc-lead", query["as_of"])
        with sqlite3.connect(":memory:") as connection:
            connection.execute("CREATE VIRTUAL TABLE evidence USING fts5(id UNINDEXED, content)")
            start = time.perf_counter_ns()
            connection.executemany("INSERT INTO evidence VALUES (?, ?)", [(e["id"], e["text"]) for e in basis["evidence"]])
            ingestion_ms = (time.perf_counter_ns() - start) / 1e6
            relevant = set(query["proposed_relevant_ids"])
            require(relevant <= {e["id"] for e in basis["evidence"]}, "Query labels contain unavailable evidence")
            latencies = []
            for _ in range(50):
                start = time.perf_counter_ns()
                found = search(connection, query["question"])
                latencies.append((time.perf_counter_ns() - start) / 1e6)
            results.append({"query_id": query["id"], "packet_hash": digest(basis), "ids": found,
                            "proposed_relevant_ids": sorted(relevant), "recall_at_5": len(set(found) & relevant) / len(relevant),
                            "precision_at_5_returned": len(set(found) & relevant) / len(found) if found else 0,
                            "visible_records": len(basis["evidence"]), "ingestion_ms": ingestion_ms,
                            "query_median_ms": statistics.median(latencies), "query_p95_ms": sorted(latencies)[47]})
    return {"experiment": "local SQLite FTS5 keyword baseline only", "sqlite_version": sqlite3.sqlite_version,
            "python_version": platform.python_version(), "platform": platform.platform(),
            "queries_hash": digest(queries), "repetitions": 50, "results": results,
            "mean_recall_at_5": statistics.mean(r["recall_at_5"] for r in results),
            "limitations": "Tiny public development corpus; proposed labels by the implementation author. First query included in timing. No embeddings, vendor runs, model runs, cold-cache isolation or decision-quality measurement."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queries", type=Path, default=Path(__file__).parent / "fixtures" / "queries.json")
    args = parser.parse_args()
    print(json.dumps(run(args.queries), indent=2, sort_keys=True))
