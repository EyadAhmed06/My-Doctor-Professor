import { MigrationInterface, QueryRunner } from 'typeorm';

export class ArchiveWeeks2430000000000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query('ALTER TABLE weeks ADD COLUMN archived_at timestamptz, DROP CONSTRAINT uq_course_week');
    await db.query('CREATE UNIQUE INDEX uq_course_week ON weeks(course_id, week_number) WHERE archived_at IS NULL');
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query('DROP INDEX uq_course_week');
    await db.query('ALTER TABLE weeks ADD CONSTRAINT uq_course_week UNIQUE(course_id, week_number), DROP COLUMN archived_at');
  }
}
