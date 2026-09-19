import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowAuditLogUserNullification2110000000000 implements MigrationInterface {
  name = 'AllowAuditLogUserNullification2110000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND NEW.user_id IS NULL
           AND NEW.id = OLD.id
           AND NEW.action = OLD.action
           AND NEW.entity_name = OLD.entity_name
           AND NEW.created_at = OLD.created_at THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'audit_logs are append-only' USING ERRCODE = '55000';
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs are append-only' USING ERRCODE = '55000';
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}
