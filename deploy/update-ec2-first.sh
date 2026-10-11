#!/usr/bin/env bash
# Original/first EC2 deployment command, maintained as a supported entry point.
# Historical implementation is retained separately as update-ec2-original.reference.sh.
# Delegate to the actively maintained guarded engine, so either entry point
# provides the same preflight, backup, migration rehearsal and rollback behavior.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ $# -le 1 ]] || { echo "Usage: sudo deploy/update-ec2-first.sh [expected-commit-prefix]" >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo "Run as root via sudo" >&2; exit 2; }
exec "$SCRIPT_DIR/update-ec2.sh" "$@"
