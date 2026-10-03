import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFourthYearSemesters2200000000000 implements MigrationInterface {
  name = 'AddFourthYearSemesters2200000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO semesters (semester_number, title, description)
      VALUES
        (7, 'Semester 7', 'Seventh-semester medical curriculum.'),
        (8, 'Semester 8', 'Eighth-semester medical curriculum.')
      ON CONFLICT (semester_number) DO NOTHING
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Retain semesters that may now contain courses, bundles and student records.
  }
}
