import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeAcademicSemesters2115000000000
  implements MigrationInterface
{
  name = 'NormalizeAcademicSemesters2115000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO semesters (semester_number, title, description)
      SELECT
        semester_number,
        'Semester ' || semester_number,
        CASE semester_number
          WHEN 1 THEN 'First-semester medical curriculum.'
          WHEN 2 THEN 'Second-semester medical curriculum.'
          WHEN 3 THEN 'Third-semester medical curriculum.'
          WHEN 4 THEN 'Fourth-semester medical curriculum.'
          WHEN 5 THEN 'Fifth-semester medical curriculum.'
          WHEN 6 THEN 'Sixth-semester medical curriculum.'
        END
      FROM generate_series(1, 6) AS semester_number
      ON CONFLICT (semester_number) DO UPDATE
      SET
        title = EXCLUDED.title,
        description = COALESCE(
          NULLIF(semesters.description, ''),
          EXCLUDED.description
        ),
        updated_at = CURRENT_TIMESTAMP;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally preserve academic records: semesters may gain courses after
    // this migration, so deleting or renaming them during rollback is unsafe.
  }
}
