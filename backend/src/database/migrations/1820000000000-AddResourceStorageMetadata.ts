import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResourceStorageMetadata1820000000000 implements MigrationInterface {
  name = 'AddResourceStorageMetadata1820000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE resources ADD COLUMN IF NOT EXISTS storage_key VARCHAR(255)');
    await queryRunner.query('ALTER TABLE resources ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255)');
    await queryRunner.query('ALTER TABLE resources ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100)');
    await queryRunner.query('ALTER TABLE resources ADD COLUMN IF NOT EXISTS checksum_sha256 CHAR(64)');
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_resources_storage_key
      ON resources(storage_key) WHERE storage_key IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS uq_resources_storage_key');
    await queryRunner.query('ALTER TABLE resources DROP COLUMN IF EXISTS checksum_sha256');
    await queryRunner.query('ALTER TABLE resources DROP COLUMN IF EXISTS mime_type');
    await queryRunner.query('ALTER TABLE resources DROP COLUMN IF EXISTS original_filename');
    await queryRunner.query('ALTER TABLE resources DROP COLUMN IF EXISTS storage_key');
  }
}
