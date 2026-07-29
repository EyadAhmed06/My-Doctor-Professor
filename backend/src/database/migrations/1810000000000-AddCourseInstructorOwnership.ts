import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCourseInstructorOwnership1810000000000 implements MigrationInterface {
  name = 'AddCourseInstructorOwnership1810000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS course_instructors (
        course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        instructor_id UUID NOT NULL REFERENCES instructors(user_id) ON DELETE CASCADE,
        assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (course_id, instructor_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_course_instructors_instructor
      ON course_instructors(instructor_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS course_instructors');
  }
}
