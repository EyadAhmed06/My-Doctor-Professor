# Backend Operations Runbook

## Release prerequisites

A release requires the backend CI build, lint, unit, PostgreSQL bootstrap, migration, schema-drift, integration, concurrency, dependency-audit, and load-smoke gates to pass for the exact commit being deployed.

## Backup

Set the database variables, `PGPASSWORD`, and an encrypted backup destination:

```bash
export DB_HOST=...
export DB_PORT=5432
export DB_USERNAME=...
export DB_NAME=...
export PGPASSWORD=...
export BACKUP_DIRECTORY=/secure/backups
./scripts/backup-db.sh
```

The script creates a PostgreSQL custom-format backup, verifies its catalog, writes a SHA-256 manifest, and restricts file permissions.

Backups must be copied to storage outside the deployment failure domain. Test a restore into a disposable database before each production release.

## Application rollback

1. Stop new deployments and record the failing commit and time.
2. If the database migration is backward-compatible, deploy the previous application image without changing the database.
3. If a migration must be reversed, stop all application writers first.
4. Prefer a forward corrective migration. Use a TypeORM `down` migration only after it has been tested against a copy of production data.
5. Re-run readiness and a minimal authentication workflow.
6. Preserve logs and audit evidence for diagnosis.

## Database restore

Restore is destructive and must target an explicitly confirmed database:

```bash
export BACKUP_FILE=/secure/backups/example.dump
export CONFIRM_RESTORE="$DB_NAME"
./scripts/restore-db.sh
```

Never restore directly over production before validating the checksum, restore catalog, recovery point, and application compatibility in a disposable environment.

## Recovery validation

After restore or rollback:

- `GET /api/v1/health/live` returns 200.
- `GET /api/v1/health/ready` returns 200 and reports the database up.
- Login, refresh, logout, and one representative read flow succeed.
- Migration state and schema drift are clean.
- Email outbox, audit append-only trigger, and notification inbox remain operational.
