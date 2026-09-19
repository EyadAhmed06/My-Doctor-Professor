import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentAchievements2040000000000 implements MigrationInterface {
  name = 'AddStudentAchievements2040000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS student_achievements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        achievement_code varchar(80) NOT NULL,
        unlocked_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_student_achievement_code UNIQUE(student_id, achievement_code)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_student_achievements_unlocked
      ON student_achievements(student_id, unlocked_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS student_achievements`);
  }
}
