#!/usr/bin/env python3
"""Read-only capacity summary and consistent SQLite export."""
import datetime as dt
import json
import os
import sqlite3
import sys
from pathlib import Path

directory = Path(os.environ.get("MDP_TELEMETRY_DIR", "/opt/mdp/data/telemetry"))
source = directory / "capacity.sqlite3"
if not source.exists():
    raise SystemExit(f"No measurements yet: {source}")

with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as db:
    if len(sys.argv) > 1 and sys.argv[1] == "export":
        destination = Path(sys.argv[2]) if len(sys.argv) > 2 else directory / ("capacity-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S") + ".sqlite3")
        if destination.resolve() == source.resolve():
            raise SystemExit("Export destination must differ from the live database")
        with sqlite3.connect(destination) as target:
            db.backup(target)
        os.chmod(destination, 0o600)
        print(destination)
        raise SystemExit(0)
    if len(sys.argv) > 1:
        raise SystemExit("Usage: report.py [export [destination]]")

    def one(query):
        return db.execute(query).fetchone()[0]

    first, last = db.execute("SELECT min(at), max(at) FROM host_samples").fetchone()
    print(f"Observation window: {first or 'none'} to {last or 'none'} UTC")
    print("This is observed load; it does not establish the system's maximum capacity.")
    for label, query, unit in (
        ("Peak host CPU", "SELECT max(cpu_percent) FROM host_samples", "%"),
        ("Peak host memory", "SELECT max(100.0 * memory_used_bytes / memory_total_bytes) FROM host_samples", "%"),
        ("Peak disk usage", "SELECT max(100.0 * disk_used_bytes / disk_total_bytes) FROM host_samples", "%"),
        ("Largest database", "SELECT max(database_bytes / 1048576.0) FROM database_samples", " MiB"),
        ("Peak DB connections", "SELECT max(total_connections) FROM database_samples", ""),
        ("Peak edge requests/min", "SELECT max(total) FROM (SELECT sum(requests) total FROM edge_minutes GROUP BY minute)", ""),
        ("Peak API requests/min", "SELECT max(total) FROM (SELECT sum(requests) total FROM api_minutes GROUP BY minute)", ""),
    ):
        value = one(query)
        print(f"{label}: {round(value, 2) if value is not None else 'unavailable'}{unit if value is not None else ''}")
    print("\nAPI route groups (last 24h; count / mean ms / max ms / 5xx):")
    rows = db.execute("""
        SELECT route, sum(requests), round(1.0 * sum(duration_sum_ms) / sum(requests), 1),
               max(duration_max_ms), sum(CASE WHEN status_class = 5 THEN requests ELSE 0 END)
        FROM api_minutes WHERE minute >= strftime('%Y-%m-%dT%H:%M', 'now', '-24 hours')
        GROUP BY route ORDER BY sum(requests) DESC LIMIT 20
    """).fetchall()
    for row in rows:
        print("  " + " | ".join(map(str, row)))
    if not rows:
        print("  unavailable; deploy the instrumented backend and wait for requests")
    bucket_rows = db.execute("SELECT buckets_json FROM api_minutes WHERE minute >= strftime('%Y-%m-%dT%H:%M', 'now', '-24 hours')").fetchall()
    histogram = [0] * 8
    for (payload,) in bucket_rows:
        histogram = [left + right for left, right in zip(histogram, json.loads(payload))]
    total = sum(histogram)
    if total:
        rank, cumulative = (95 * total + 99) // 100, 0
        for bound, count in zip((50, 100, 250, 500, 1000, 2000, 5000, None), histogram):
            cumulative += count
            if cumulative >= rank:
                print(f"Approximate API p95 upper bucket (24h): {'over 5000' if bound is None else 'at most ' + str(bound)} ms; n={total}")
                break
