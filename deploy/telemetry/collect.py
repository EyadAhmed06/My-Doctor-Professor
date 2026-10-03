#!/usr/bin/env python3
"""Collect portable, aggregate capacity data on the EC2 host. Python stdlib only."""
import datetime as dt
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
from urllib.parse import urlsplit
from pathlib import Path

ROOT = Path(os.environ.get("MDP_TELEMETRY_DIR", "/opt/mdp/data/telemetry"))
DB = ROOT / "capacity.sqlite3"
CONTAINERS = ("mdp-backend", "mdp-frontend", "mdp-postgres", "mdp-caddy")


def command(*args, timeout=12, merge_stderr=False):
    result = subprocess.run(args, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT if merge_stderr else subprocess.PIPE,
                            text=True, timeout=timeout, check=True)
    return result.stdout


def bytes_value(value):
    number, unit = re.match(r"\s*([\d.]+)\s*([kMGTPE]?i?B|B)\s*$", value).groups()
    factors = {"B": 1, "kB": 1000, "MB": 1000**2, "GB": 1000**3, "TB": 1000**4,
               "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3, "TiB": 1024**4}
    return int(float(number) * factors[unit])


def initialize(db):
    db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS host_samples (
            at TEXT PRIMARY KEY, cpu_percent REAL, memory_used_bytes INTEGER,
            memory_total_bytes INTEGER, disk_used_bytes INTEGER, disk_total_bytes INTEGER,
            load_1m REAL
        );
        CREATE TABLE IF NOT EXISTS container_samples (
            at TEXT NOT NULL, name TEXT NOT NULL, cpu_percent REAL, memory_bytes INTEGER,
            net_rx_bytes INTEGER, net_tx_bytes INTEGER, block_read_bytes INTEGER,
            block_write_bytes INTEGER, pids INTEGER, PRIMARY KEY (at, name)
        );
        CREATE TABLE IF NOT EXISTS database_samples (
            at TEXT PRIMARY KEY, database_bytes INTEGER, active_connections INTEGER,
            total_connections INTEGER, commits INTEGER, rollbacks INTEGER, cache_hits INTEGER,
            blocks_read INTEGER, temporary_bytes INTEGER
        );
        CREATE TABLE IF NOT EXISTS api_minutes (
            minute TEXT NOT NULL, route TEXT NOT NULL, method TEXT NOT NULL,
            status_class INTEGER NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
            duration_sum_ms INTEGER NOT NULL DEFAULT 0, duration_max_ms INTEGER NOT NULL DEFAULT 0,
            buckets_json TEXT NOT NULL, PRIMARY KEY (minute, route, method, status_class)
        );
        CREATE TABLE IF NOT EXISTS edge_minutes (
            minute TEXT NOT NULL, category TEXT NOT NULL, status_class INTEGER NOT NULL,
            requests INTEGER NOT NULL DEFAULT 0, response_bytes INTEGER NOT NULL DEFAULT 0,
            duration_sum_ms INTEGER NOT NULL DEFAULT 0, duration_max_ms INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (minute, category, status_class)
        );
    """)


def host_sample(db, at):
    mem = {key: int(value.split()[0]) * 1024 for key, value in
           (line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines())}
    cpu = [int(n) for n in Path("/proc/stat").read_text().splitlines()[0].split()[1:]]
    total, idle = sum(cpu), cpu[3] + cpu[4]
    previous = db.execute("SELECT value FROM meta WHERE key='cpu_counters'").fetchone()
    percent = None
    if previous:
        old_total, old_idle = json.loads(previous[0])
        if total > old_total:
            percent = round(100 * (1 - (idle - old_idle) / (total - old_total)), 2)
    db.execute("INSERT OR REPLACE INTO meta VALUES ('cpu_counters', ?)", (json.dumps([total, idle]),))
    disk = shutil.disk_usage("/opt/mdp/data" if Path("/opt/mdp/data").exists() else ROOT)
    db.execute("INSERT INTO host_samples VALUES (?,?,?,?,?,?,?)",
               (at, percent, mem["MemTotal"] - mem["MemAvailable"], mem["MemTotal"],
                disk.used, disk.total, os.getloadavg()[0]))


def container_samples(db, at):
    for line in command("docker", "stats", "--no-stream", "--format", "{{json .}}", *CONTAINERS).splitlines():
        entry = json.loads(line)
        try:
            memory = bytes_value(entry["MemUsage"].split("/")[0])
            net_rx, net_tx = (bytes_value(v) for v in entry["NetIO"].split("/"))
            read, write = (bytes_value(v) for v in entry["BlockIO"].split("/"))
            db.execute("INSERT INTO container_samples VALUES (?,?,?,?,?,?,?,?,?)",
                       (at, entry["Name"], float(entry["CPUPerc"].rstrip("%")), memory,
                        net_rx, net_tx, read, write, int(entry["PIDs"])))
        except (KeyError, ValueError, AttributeError) as exc:
            print(f"Skipping malformed docker stats record: {exc}", file=sys.stderr)


def database_sample(db, at):
    sql = ("SELECT pg_database_size(current_database()), "
           "(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active'), "
           "(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()), "
           "xact_commit, xact_rollback, blks_hit, blks_read, temp_bytes "
           "FROM pg_stat_database WHERE datname=current_database()")
    result = command("docker", "exec", "mdp-postgres", "sh", "-c",
                     'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F , -c "$1"',
                     "sh", sql).strip().splitlines()[-1]
    values = [int(value) for value in result.split(",")]
    if len(values) != 8:
        raise ValueError("Unexpected PostgreSQL stats shape")
    db.execute("INSERT INTO database_samples VALUES (?,?,?,?,?,?,?,?,?)", (at, *values))


def api_samples(db, _at):
    cursor = db.execute("SELECT value FROM meta WHERE key='backend_log_cursor'").fetchone()
    since = cursor[0] if cursor else "5m"
    output = command("docker", "logs", "--timestamps", "--since", since, "mdp-backend", timeout=20, merge_stderr=True)
    latest = cursor[0] if cursor else ""
    for line in output.splitlines():
        stamp, _, payload = line.partition(" ")
        if not payload or stamp <= latest:
            continue
        # The cursor advances for non-request lines as well, so restarts don't replay old output.
        latest = stamp
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if event.get("event") != "http_request_aggregate":
            continue
        route = event.get("route")
        method = event.get("method")
        status_class = event.get("status_class")
        minute = event.get("minute")
        count = event.get("requests")
        total = event.get("duration_sum_ms")
        maximum = event.get("duration_max_ms")
        buckets = event.get("buckets")
        if (not isinstance(route, str) or len(route) > 160 or not route.startswith(("/", "__unmatched__"))
                or not isinstance(method, str) or method not in ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")
                or not isinstance(status_class, int) or not 1 <= status_class <= 5
                or not isinstance(minute, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z", minute)
                or not isinstance(count, int) or not 0 < count <= 10_000_000
                or not isinstance(total, int) or total < 0
                or not isinstance(maximum, int) or maximum < 0
                or not isinstance(buckets, list) or len(buckets) != 8
                or not all(isinstance(value, int) and value >= 0 for value in buckets)
                or sum(buckets) != count):
            continue
        row = db.execute("SELECT requests, duration_sum_ms, duration_max_ms, buckets_json FROM api_minutes "
                         "WHERE minute=? AND route=? AND method=? AND status_class=?",
                         (minute, route, method, status_class)).fetchone()
        old_count, old_total, old_max, old_buckets = (row[0], row[1], row[2], json.loads(row[3])) if row else (0, 0, 0, [0] * 8)
        combined = [left + right for left, right in zip(old_buckets, buckets)]
        db.execute("INSERT INTO api_minutes VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(minute,route,method,status_class) "
                   "DO UPDATE SET requests=excluded.requests,duration_sum_ms=excluded.duration_sum_ms,"
                   "duration_max_ms=excluded.duration_max_ms,buckets_json=excluded.buckets_json",
                   (minute, route, method, status_class, old_count + count, old_total + total,
                    max(old_max, maximum), json.dumps(combined)))
    if latest:
        db.execute("INSERT OR REPLACE INTO meta VALUES ('backend_log_cursor', ?)", (latest,))


def edge_category(uri):
    path = urlsplit(uri).path
    if path.startswith("/api/v1/"):
        parts = path.split("/")
        return "/api/v1/" + (parts[3] if len(parts) > 3 else "other")
    if path.startswith("/_next/static/"):
        return "static"
    if path.startswith("/anatomy/") or path.startswith("/draco/"):
        return "anatomy"
    return "page"


def edge_samples(db, _at):
    cursor = db.execute("SELECT value FROM meta WHERE key='caddy_log_cursor'").fetchone()
    output = command("docker", "logs", "--timestamps", "--since", cursor[0] if cursor else "5m",
                     "mdp-caddy", timeout=20, merge_stderr=True)
    latest = cursor[0] if cursor else ""
    for line in output.splitlines():
        stamp, _, payload = line.partition(" ")
        if not payload or stamp <= latest:
            continue
        latest = stamp
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue
        request = event.get("request")
        if not isinstance(request, dict) or not isinstance(request.get("uri"), str):
            continue
        status, size, duration = event.get("status"), event.get("size"), event.get("duration")
        if (not isinstance(status, int) or not 100 <= status <= 599
                or not isinstance(size, int) or size < 0
                or not isinstance(duration, (int, float)) or not 0 <= duration <= 3600):
            continue
        minute = stamp[:16] + "Z"
        category = edge_category(request["uri"])
        key = (minute, category, status // 100)
        old = db.execute("SELECT requests,response_bytes,duration_sum_ms,duration_max_ms "
                         "FROM edge_minutes WHERE minute=? AND category=? AND status_class=?", key).fetchone()
        count, total_bytes, total_ms, max_ms = old if old else (0, 0, 0, 0)
        ms = int(duration * 1000)
        db.execute("INSERT INTO edge_minutes VALUES (?,?,?,?,?,?,?) ON CONFLICT(minute,category,status_class) "
                   "DO UPDATE SET requests=excluded.requests,response_bytes=excluded.response_bytes,"
                   "duration_sum_ms=excluded.duration_sum_ms,duration_max_ms=excluded.duration_max_ms",
                   (*key, count + 1, total_bytes + size, total_ms + ms, max(max_ms, ms)))
    if latest:
        db.execute("INSERT OR REPLACE INTO meta VALUES ('caddy_log_cursor', ?)", (latest,))


def collect():
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(ROOT, 0o700)
    at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="microseconds")
    with sqlite3.connect(DB, timeout=20) as db:
        initialize(db)
        host_sample(db, at)
        for name, operation in (("docker", container_samples), ("postgres", database_sample),
                                ("api", api_samples), ("edge", edge_samples)):
            try:
                operation(db, at)
            except (OSError, ValueError, subprocess.SubprocessError) as exc:
                print(f"{name} sample failed: {exc}", file=sys.stderr)
        # Retain 90 days of minute-level data and 365 days of resource samples.
        db.execute("DELETE FROM api_minutes WHERE minute < datetime('now', '-90 days')")
        db.execute("DELETE FROM edge_minutes WHERE minute < datetime('now', '-90 days')")
        for table in ("host_samples", "container_samples", "database_samples"):
            db.execute(f"DELETE FROM {table} WHERE at < datetime('now', '-365 days')")
    os.chmod(DB, 0o600)


if __name__ == "__main__":
    collect()
