import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEssayImportSessions2420000000000 implements MigrationInterface {
  name = 'AddEssayImportSessions2420000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS essay_import_sessions (
        id uuid PRIMARY KEY,
        owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        original_filename varchar(255) NOT NULL,
        file_sha256 varchar(64) NOT NULL,
        inspection jsonb NOT NULL,
        review jsonb NOT NULL DEFAULT '{}'::jsonb,
        revision integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
        CONSTRAINT essay_import_sessions_revision_nonnegative CHECK (revision >= 0),
        CONSTRAINT essay_import_sessions_inspection_object CHECK (jsonb_typeof(inspection) = 'object'),
        CONSTRAINT essay_import_sessions_review_object CHECK (jsonb_typeof(review) = 'object')
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_essay_import_sessions_owner_recent ON essay_import_sessions(owner_id, created_at DESC)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_essay_import_sessions_expires ON essay_import_sessions(expires_at)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS essay_import_sessions');
  }
}
