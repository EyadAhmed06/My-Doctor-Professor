# Backup and recovery

The application has two stateful data stores that must be protected together:

1. PostgreSQL (`DB_*`)
2. Managed lecture files under `FILE_UPLOAD_PATH`

A database-only backup is incomplete because resource rows reference files stored outside PostgreSQL.

## Create a snapshot

Requirements: `pg_dump` must be available on `PATH` and the normal database environment variables must be configured.

```bash
npm run backup:create
```

The command creates a timestamped folder under `BACKUP_DIR` containing:

- `database.dump` — PostgreSQL custom-format dump
- `uploads/` — managed resource files
- `manifest.json` — creation time, database metadata, file count, and SHA-256 checksums

Snapshots older than `BACKUP_RETENTION_DAYS` are removed after a successful new backup.

## Verify a snapshot

Always verify copied/off-site backups before relying on them:

```bash
BACKUP_SNAPSHOT=/path/to/snapshot npm run backup:verify
```

Windows PowerShell:

```powershell
$env:BACKUP_SNAPSHOT = "D:\Backups\my_doctor_professor-..."
npm run backup:verify
```

Verification checks the database dump checksum and every managed upload checksum.

## Restore drill

Restore into a disposable database first. Do not test recovery against the live database.

```bash
DB_NAME=mdp_restore_drill RESTORE_MODE=replace BACKUP_SNAPSHOT=/path/to/snapshot npm run backup:restore
```

After restore:

1. Run `npm run migration:show` and confirm the expected migration ledger.
2. Run `npm run schema:check`.
3. Run backend E2E tests against the restored database.
4. Start the backend and open several managed PDF/image/video resources.
5. Compare the upload count with `manifest.json`.

A backup is not considered operationally proven until a restore drill succeeds.

## Production guard

`backup:restore` refuses production restore unless both are supplied:

```text
RESTORE_MODE=replace
CONFIRM_PRODUCTION_RESTORE=I_UNDERSTAND_THIS_REPLACES_DATA
```

This is deliberate. Production restore replaces database objects and the managed upload directory.

## RDS deployment

For an AWS RDS deployment, keep RDS automated backups/snapshots enabled in addition to these application snapshots. RDS protects PostgreSQL, while this application snapshot also protects the filesystem-backed managed resource files. Store production snapshots outside the application host and apply an organizational retention/encryption policy.

## Suggested cadence

- Database/platform snapshot: daily
- Before every schema migration or release: on-demand snapshot
- Restore drill: at least monthly and before a high-risk release
- Keep multiple generations so a corrupted recent snapshot does not become the only recovery point

Do not commit snapshots, `.env` files, or uploaded resources to Git.
