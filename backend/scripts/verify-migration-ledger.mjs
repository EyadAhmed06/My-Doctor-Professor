import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const migrationDirectory = path.join(root, 'src', 'database', 'migrations');
const ledger = fs.readFileSync(
  path.join(root, 'database', 'schemas', '10z_migration_ledger.sql'),
  'utf8',
);

const migrations = fs
  .readdirSync(migrationDirectory)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => {
    const source = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
    const match = source.match(/export\s+class\s+([A-Za-z0-9_]*?(\d{13}))/);
    assert(match, `Migration ${file} must export a class ending in a 13-digit timestamp`);
    return { file, name: match[1], timestamp: match[2] };
  });

const timestamps = migrations.map((migration) => migration.timestamp);
assert.equal(
  new Set(timestamps).size,
  timestamps.length,
  `Duplicate migration timestamp detected: ${timestamps.join(', ')}`,
);

for (const migration of migrations) {
  assert(
    ledger.includes(`'${migration.name}'`),
    `Fresh-install migration ledger is missing ${migration.name}`,
  );
  assert(
    ledger.includes(`${migration.timestamp}::bigint`),
    `Fresh-install migration ledger is missing timestamp ${migration.timestamp}`,
  );
}

assert(
  !ledger.includes('AddStudentWorkspace1840000000000'),
  'The legacy duplicate-timestamp workspace migration must not remain in the ledger',
);

console.log(
  `Migration ledger verified ${migrations.length} unique TypeORM migrations.`,
);
