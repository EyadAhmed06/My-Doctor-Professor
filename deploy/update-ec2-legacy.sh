#!/usr/bin/env bash
# Backwards-compatible EC2 deployment entry point.
# Uses the current guarded deploy engine, not the unsafe historical migration.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ $# -le 1 ]] || { echo "Usage: sudo deploy/update-ec2-legacy.sh [expected-commit-prefix]" >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo "Run as root via sudo" >&2; exit 2; }
exec "$SCRIPT_DIR/update-ec2.sh" "$@"
