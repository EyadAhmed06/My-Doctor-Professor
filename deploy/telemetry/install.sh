#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root on the EC2 host.' >&2; exit 1; }
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -d -m 0750 /opt/mdp/telemetry
install -d -m 0700 /opt/mdp/data/telemetry
install -m 0750 "$source_dir/collect.py" /opt/mdp/telemetry/collect.py
install -m 0750 "$source_dir/report.py" /opt/mdp/telemetry/report.py
cat >/etc/systemd/system/mdp-telemetry.service <<'UNIT'
[Unit]
Description=Collect My Doctor Professor capacity measurements
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/mdp/telemetry/collect.py
TimeoutStartSec=55
UNIT
cat >/etc/systemd/system/mdp-telemetry.timer <<'UNIT'
[Unit]
Description=Measure My Doctor Professor every 30 seconds

[Timer]
OnBootSec=1min
OnUnitInactiveSec=30s
AccuracySec=1s
Unit=mdp-telemetry.service

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now mdp-telemetry.timer
systemctl start mdp-telemetry.service
echo 'Telemetry installed. View: sudo python3 /opt/mdp/telemetry/report.py'
