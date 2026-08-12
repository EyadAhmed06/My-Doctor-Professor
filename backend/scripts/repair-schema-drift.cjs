require("dotenv").config();

const databaseHost = process.env.DB_HOST?.trim().toLowerCase();
if (databaseHost?.endsWith(".rds.amazonaws.com")) {
  process.env.DB_SSL_ENABLED = "true";
}

require("ts-node/register/transpile-only");
const { AppDataSource } = require("../src/database/data-source");

const requiredTables = ["bundles", "bundle_enrollments", "notebook_note_tags", "notebook_tags"];

const main = async () => {
  const sslMode = AppDataSource.options.ssl ? "encrypted" : "unencrypted";
  console.log(
    `Schema repair target: ${AppDataSource.options.username}@${AppDataSource.options.host}:` +
      `${AppDataSource.options.port}/${AppDataSource.options.database} (${sslMode})`,
  );

  await AppDataSource.initialize();
  try {
    const existingRows = await AppDataSource.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [requiredTables],
    );
    const existing = new Set(existingRows.map((row) => row.table_name));
    const missing = requiredTables.filter((table) => !existing.has(table));
    if (missing.length) {
      throw new Error(
        `Refusing targeted repair because the base application schema is incomplete. Missing table(s): ${missing.join(", ")}`,
      );
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bundle_payment_status') THEN
            CREATE TYPE bundle_payment_status AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'CANCELLED');
          END IF;
        END
        $$;
      `);

      await manager.query(`
        ALTER TABLE bundles
          ADD COLUMN IF NOT EXISTS price_amount numeric(10,2),
          ADD COLUMN IF NOT EXISTS price_currency varchar(3) NOT NULL DEFAULT 'EGP';
      `);

      await manager.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'bundles'::regclass AND conname = 'ck_bundle_price_positive'
          ) THEN
            ALTER TABLE bundles
              ADD CONSTRAINT ck_bundle_price_positive
              CHECK (price_amount IS NULL OR price_amount > 0);
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'bundles'::regclass AND conname = 'ck_bundle_price_currency'
          ) THEN
            ALTER TABLE bundles
              ADD CONSTRAINT ck_bundle_price_currency
              CHECK (price_currency ~ '^[A-Z]{3}$');
          END IF;
        END
        $$;
      `);

      await manager.query(`
        ALTER TABLE bundle_enrollments
          ADD COLUMN IF NOT EXISTS payment_status bundle_payment_status NOT NULL DEFAULT 'NOT_REQUIRED',
          ADD COLUMN IF NOT EXISTS paid_at timestamp,
          ADD COLUMN IF NOT EXISTS payment_reference varchar(200);
      `);

      // Preserve the semantics of AddBundlePricingPayments1950000000000 for legacy paid enrollments.
      await manager.query(`
        UPDATE bundle_enrollments enrollment
        SET payment_status = 'PENDING',
            status = 'REVOKED',
            paid_at = NULL,
            payment_reference = NULL
        FROM bundles bundle
        WHERE bundle.id = enrollment.bundle_id
          AND bundle.is_free = FALSE
          AND enrollment.payment_status = 'NOT_REQUIRED';
      `);

      await manager.query(`
        CREATE INDEX IF NOT EXISTS idx_bundle_enrollment_payment_status
          ON bundle_enrollments(bundle_id, payment_status);
      `);

      await manager.query(`
        DO $$
        DECLARE
          fk_name text;
          delete_action "char";
        BEGIN
          SELECT constraint_record.conname, constraint_record.confdeltype
          INTO fk_name, delete_action
          FROM pg_constraint constraint_record
          JOIN pg_class source ON source.oid = constraint_record.conrelid
          JOIN pg_class target ON target.oid = constraint_record.confrelid
          WHERE constraint_record.contype = 'f'
            AND source.relname = 'notebook_note_tags'
            AND target.relname = 'notebook_tags'
            AND pg_get_constraintdef(constraint_record.oid) LIKE 'FOREIGN KEY (tag_id)%'
          LIMIT 1;

          IF fk_name IS NULL THEN
            ALTER TABLE notebook_note_tags
              ADD CONSTRAINT fk_notebook_note_tags_tag
              FOREIGN KEY (tag_id) REFERENCES notebook_tags(id) ON DELETE CASCADE;
          ELSIF delete_action <> 'c' THEN
            EXECUTE format('ALTER TABLE notebook_note_tags DROP CONSTRAINT %I', fk_name);
            EXECUTE format(
              'ALTER TABLE notebook_note_tags ADD CONSTRAINT %I FOREIGN KEY (tag_id) REFERENCES notebook_tags(id) ON DELETE CASCADE',
              fk_name
            );
          END IF;
        END
        $$;
      `);
    });

    console.log("Targeted schema repair completed successfully.");
    console.log("Run `npm run schema:check` next; it should report a compatible schema.");
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
};

main().catch((error) => {
  console.error("Schema repair failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
