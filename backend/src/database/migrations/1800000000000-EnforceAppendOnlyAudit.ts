import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceAppendOnlyAudit1800000000000 implements MigrationInterface {
  name = 'EnforceAppendOnlyAudit1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX idx_audit_entity_record
        ON audit_logs(entity_name,entity_id,created_at DESC);
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs are append-only' USING ERRCODE='55000';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_audit_logs_append_only
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON audit_logs;
      DROP FUNCTION IF EXISTS prevent_audit_log_mutation();
      DROP INDEX IF EXISTS idx_audit_entity_record;
    `);
  }
}
