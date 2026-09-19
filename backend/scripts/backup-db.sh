#!/usr/bin/env bash
set -euo pipefail

: "${DB_HOST:?DB_HOST is required}"
: "${DB_PORT:?DB_PORT is required}"
: "${DB_USERNAME:?DB_USERNAME is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${BACKUP_DIRECTORY:?BACKUP_DIRECTORY is required}"

mkdir -p "${BACKUP_DIRECTORY}"
chmod 700 "${BACKUP_DIRECTORY}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${BACKUP_DIRECTORY}/${DB_NAME}-${timestamp}.dump"
manifest="${target}.sha256"

pg_dump   --host="${DB_HOST}"   --port="${DB_PORT}"   --username="${DB_USERNAME}"   --dbname="${DB_NAME}"   --format=custom   --compress=9   --no-owner   --no-privileges   --file="${target}"

pg_restore --list "${target}" >/dev/null
sha256sum "${target}" >"${manifest}"
chmod 600 "${target}" "${manifest}"
printf 'Backup verified: %s\n' "${target}"
