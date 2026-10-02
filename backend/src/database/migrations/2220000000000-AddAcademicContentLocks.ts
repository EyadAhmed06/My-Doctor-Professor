import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAcademicContentLocks2220000000000 implements MigrationInterface {
  name = 'AddAcademicContentLocks2220000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "weeks" ADD COLUMN IF NOT EXISTS "is_locked" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "lectures" ADD COLUMN IF NOT EXISTS "is_locked" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "is_locked" boolean NOT NULL DEFAULT false`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "topics" DROP COLUMN IF EXISTS "is_locked"`);
    await queryRunner.query(`ALTER TABLE "lectures" DROP COLUMN IF EXISTS "is_locked"`);
    await queryRunner.query(`ALTER TABLE "weeks" DROP COLUMN IF EXISTS "is_locked"`);
  }
}
