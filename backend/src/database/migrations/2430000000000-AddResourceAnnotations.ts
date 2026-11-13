import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResourceAnnotations2430000000000 implements MigrationInterface {
  name = 'AddResourceAnnotations2430000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE resource_annotations (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind varchar(12) NOT NULL CHECK (kind IN ('NOTE', 'HIGHLIGHT')),
        page_number integer NOT NULL CHECK (page_number BETWEEN 1 AND 10000),
        body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX idx_resource_annotations_owner_resource ON resource_annotations(user_id, resource_id, page_number, created_at)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS resource_annotations');
  }
}
