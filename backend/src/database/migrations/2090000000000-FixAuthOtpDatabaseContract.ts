import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAuthOtpDatabaseContract2090000000000 implements MigrationInterface {
  name = 'FixAuthOtpDatabaseContract2090000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Repair session columns defensively. Some deployed databases were created
    // before the session-audit columns were introduced, while the current
    // AuthSession entity always writes them during login.
    await queryRunner.query(`
      ALTER TABLE auth_sessions
        ADD COLUMN IF NOT EXISTS ip_address inet,
        ADD COLUMN IF NOT EXISTS user_agent text,
        ADD COLUMN IF NOT EXISTS last_used_at timestamp;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
        ON auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
        ON auth_sessions(expires_at);
    `);

    // Keep the persisted contract in sync with AccountActionTokenPurpose.
    // The original schema CHECK allowed only EMAIL_VERIFICATION and
    // PASSWORD_RESET, so inserting the new PASSWORD_RESET_CODE purpose raised
    // PostgreSQL 23514 and surfaced as "A database business rule was violated".
    await queryRunner.query(`
      ALTER TABLE account_action_tokens
        ALTER COLUMN purpose TYPE varchar(32);
    `);

    await queryRunner.query(`
      DO $auth_contract$
      DECLARE
        constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT constraint_record.conname
          FROM pg_constraint constraint_record
          JOIN pg_class source_table
            ON source_table.oid = constraint_record.conrelid
          JOIN pg_namespace source_schema
            ON source_schema.oid = source_table.relnamespace
          WHERE constraint_record.contype = 'c'
            AND source_schema.nspname = current_schema()
            AND source_table.relname = 'account_action_tokens'
            AND pg_get_constraintdef(constraint_record.oid) ILIKE '%purpose%'
        LOOP
          EXECUTE format(
            'ALTER TABLE account_action_tokens DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
      END
      $auth_contract$;
    `);

    await queryRunner.query(`
      ALTER TABLE account_action_tokens
        ADD CONSTRAINT chk_account_action_token_purpose
        CHECK (
          purpose IN (
            'EMAIL_VERIFICATION',
            'PASSWORD_RESET',
            'PASSWORD_RESET_CODE'
          )
        );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_account_action_tokens_user_purpose
        ON account_action_tokens(user_id, purpose);
      CREATE INDEX IF NOT EXISTS idx_account_action_tokens_expiry
        ON account_action_tokens(expires_at);
    `);
  }

  public async down(): Promise<void> {
    // Forward-only contract repair. Removing PASSWORD_RESET_CODE or the session
    // audit columns could invalidate live recovery tokens/sessions during a
    // rollback, so destructive reversal is intentionally avoided.
  }
}
