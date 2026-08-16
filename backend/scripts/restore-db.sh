#!/usr/bin/env bash
set -euo pipefail

: "${DB_HOST:?DB_HOST is required}"
: "${DB_PORT:?DB_PORT is required}"
: "${DB_USERNAME:?DB_USERNAME is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

if [[ "${CONFIRM_RESTORE:-}" != "${DB_NAME}" ]]; then
  echo "Refusing destructive restore. Set CONFIRM_RESTORE exactly to DB_NAME." >&2
  exit 2
fi

test -f "${BACKUP_FILE}"
test -f "${BACKUP_FILE}.sha256"
sha256sum --check "${BACKUP_FILE}.sha256"
pg_restore --list "${BACKUP_FILE}" >/dev/null

pg_restore   --host="${DB_HOST}"   --port="${DB_PORT}"   --username="${DB_USERNAME}"   --dbname="${DB_NAME}"   --clean   --if-exists   --no-owner   --no-privileges   --exit-on-error   "${BACKUP_FILE}"

printf 'Restore completed for %s\n' "${DB_NAME}"
