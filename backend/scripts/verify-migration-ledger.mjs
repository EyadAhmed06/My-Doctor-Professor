import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const migrationDirectory = path.join(root, 'src', 'database', 'migrations');
const ledger = fs.readFileSync(
  path.join(root, 'database', 'schemas', '10z_migration_ledger.sql'),
  'utf8',
);

/**
 * The SQL bootstrap represents the schema through this migration timestamp.
 * Those migrations are inserted into 10z_migration_ledger.sql so TypeORM does
 * not replay changes already represented by the fresh-install schema files.
 *
 * Migrations newer than the baseline MUST remain outside that ledger: they are
 * the forward upgrade path from the bootstrap schema to the current schema and
 * must execute on a fresh install as well as on an existing deployment.
 */
const BASELINE_MAX_TIMESTAMP = 2100000000000;

const migrations = fs
  .readdirSync(migrationDirectory)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => {
    const source = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
    const match = source.match(/export\s+class\s+([A-Za-z0-9_]*?(\d{13}))/);
    assert(match, `Migration ${file} must export a class ending in a 13-digit timestamp`);
    return {
      file,
      name: match[1],
      timestamp: match[2],
      timestampNumber: Number(match[2]),
    };
  });

const timestamps = migrations.map((migration) => migration.timestamp);
assert.equal(
  new Set(timestamps).size,
  timestamps.length,
  `Duplicate migration timestamp detected: ${timestamps.join(', ')}`,
);

for (const migration of migrations) {
  const ledgerHasName = ledger.includes(`'${migration.name}'`);
  const ledgerHasTimestamp = ledger.includes(`${migration.timestamp}::bigint`);

  if (migration.timestampNumber <= BASELINE_MAX_TIMESTAMP) {
    assert(
      ledgerHasName,
      `Fresh-install migration ledger is missing baseline migration ${migration.name}`,
    );
    assert(
      ledgerHasTimestamp,
      `Fresh-install migration ledger is missing baseline timestamp ${migration.timestamp}`,
    );
  } else {
    assert(
      !ledgerHasName && !ledgerHasTimestamp,
      `Post-baseline migration ${migration.name} must not be pre-recorded in the fresh-install ledger`,
    );
  }
}

assert(
  !ledger.includes('AddStudentWorkspace1840000000000'),
  'The legacy duplicate-timestamp workspace migration must not remain in the ledger',
);

console.log(
  `Migration ledger verified ${migrations.length} unique TypeORM migrations; ` +
    `baseline <= ${BASELINE_MAX_TIMESTAMP}, newer migrations execute after bootstrap.`,
);
