import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBundleCoursePlannedWeeks2210000000000 implements MigrationInterface {
  name = 'AddBundleCoursePlannedWeeks2210000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE bundle_courses ADD COLUMN planned_week_count integer NULL');
    await queryRunner.query('ALTER TABLE bundle_courses ADD CONSTRAINT chk_bundle_courses_planned_week_count CHECK (planned_week_count BETWEEN 1 AND 52)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE bundle_courses DROP CONSTRAINT chk_bundle_courses_planned_week_count');
    await queryRunner.query('ALTER TABLE bundle_courses DROP COLUMN planned_week_count');
  }
}
