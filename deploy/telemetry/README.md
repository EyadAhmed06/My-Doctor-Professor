# Capacity telemetry (first measurement layer)

The collector runs on the existing production host every 30 seconds. It needs Python 3, systemd, Docker, and access to the existing PostgreSQL container. It uses only the Python standard library and stores aggregate data in `/opt/mdp/data/telemetry/capacity.sqlite3` (mode 0600). No public port, third-party service, or application database table is added.

It measures host CPU/memory/disk/load, Docker CPU/memory/network/block I/O, PostgreSQL database size/connections/cumulative transaction and cache counters, backend ten-second request aggregates with duration histograms/status/route template, and Caddy request counts/response bytes/latency by broad category. No IP, user ID, URL query string, question, answer, token, or request body is stored. Caddy already logs each request in production; configure bounded Docker log rotation for `mdp-caddy` before production volume grows. Verify with `docker inspect mdp-caddy --format '{{json .HostConfig.LogConfig}}'`. Current `/opt/mdp/compose.production.yml` is maintained on the host, so changing the repository copy alone does not change that host file.

## Install after deploying the instrumented backend

On the EC2 host, after `/opt/mdp-source` has the new commit and the backend has been deployed:

```bash
sudo bash /opt/mdp-source/deploy/telemetry/install.sh
sudo systemctl status mdp-telemetry.timer --no-pager
sudo python3 /opt/mdp/telemetry/report.py
```

The timer survives reboots and is independent of application image deployment. After updating collector source later, rerun the install command. Inspect failures with `sudo journalctl -u mdp-telemetry.service -n 100 --no-pager`.

## Export and transfer

Do not copy a live WAL database file directly. Use the consistent SQLite backup API:

```bash
sudo python3 /opt/mdp/telemetry/report.py export /opt/mdp/data/backups/capacity-export.sqlite3
```

Copy the resulting file alongside the PostgreSQL dump, upload/media directory, deployment configuration, and secrets during a migration. Keep the export private; even aggregate demand and infrastructure information should not be public.

## Interpretation and gaps

- The first CPU sample is intentionally null; CPU usage is calculated from consecutive `/proc/stat` counters.
- Backend counters flush every ten seconds; an abrupt process exit may lose its last partial window.
- API durations use fixed buckets (50/100/250/500/1000/2000/5000 ms and above), not exact p95 values. The report labels p95 as an approximate bucket.
- Docker network and block I/O counters are cumulative for each container lifetime. Calculate rates from deltas within a lifetime; a recreation resets counters.
- PostgreSQL counters reset when statistics are reset. They must be interpreted as deltas, not summed across resets.
- Caddy categories deliberately collapse dynamic paths and do not equate requests with unique people. Cached responses and bots must be accounted for when deriving human usage.
- The collector does not measure browser rendering, actual concurrent authenticated students, PDF/OCR work units, AI token/provider spend, storage transfer prices, recovery time, or failure thresholds. Add those measurements and realistic load/restore tests before making a hosting purchase recommendation.
- A local SQLite file cannot report a host-wide outage while the host is unavailable. Export it regularly and use a separate uptime checker if independent alerting becomes necessary.
- SQLite records are retained for 90 days of minute-level request aggregates and 365 days of resource samples. Estimate growth and observe telemetry disk usage before increasing retention.
