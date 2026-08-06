import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentWorkspace1845000000000 implements MigrationInterface {
  name = 'AddStudentWorkspace1845000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const [existing] = await queryRunner.query(`
      SELECT
        to_regclass('public.notebook_notes') AS notebook_notes,
        to_regclass('public.student_study_plans') AS student_study_plans,
        to_regclass('public.drug_references') AS drug_references
    `);

    const present = [
      existing?.notebook_notes,
      existing?.student_study_plans,
      existing?.drug_references,
    ].filter(Boolean).length;

    // Deployments that already executed the legacy duplicate-timestamp migration
    // keep their data and simply record this uniquely ordered replacement.
    if (present === 3) return;
    if (present !== 0) {
      throw new Error(
        'Student workspace schema is partially present; reconcile it before running migrations',
      );
    }

    await queryRunner.query(`
      CREATE TABLE notebook_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        title varchar(200) NOT NULL,
        note_type varchar(30) NOT NULL,
        content text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_notebook_note_type CHECK (
          note_type IN ('PERSONAL','EXPLANATION','PEARL','IMAGE','LINKED_CASE')
        ),
        CONSTRAINT fk_notebook_notes_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_notebook_notes_owner_updated
        ON notebook_notes(user_id, updated_at);
      CREATE TRIGGER update_notebook_notes_updated_at
        BEFORE UPDATE ON notebook_notes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TABLE student_study_plans (
        student_id uuid PRIMARY KEY,
        target_exam varchar(100),
        exam_date date,
        daily_question_target int NOT NULL DEFAULT 20,
        weekly_hours_target int NOT NULL DEFAULT 10,
        daily_flashcard_target int NOT NULL DEFAULT 20,
        preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_study_plan_question_target
          CHECK (daily_question_target BETWEEN 1 AND 500),
        CONSTRAINT ck_study_plan_hours
          CHECK (weekly_hours_target BETWEEN 1 AND 168),
        CONSTRAINT fk_study_plan_student
          FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE
      );
      CREATE TRIGGER update_student_study_plans_updated_at
        BEFORE UPDATE ON student_study_plans
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TABLE drug_references (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(180) NOT NULL,
        slug varchar(200) NOT NULL,
        category varchar(120) NOT NULL,
        drug_class varchar(180) NOT NULL,
        content jsonb NOT NULL,
        is_published boolean NOT NULL DEFAULT false,
        created_by uuid NOT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_drug_reference_slug UNIQUE(slug),
        CONSTRAINT fk_drug_reference_creator
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_drug_reference_category ON drug_references(category);
      CREATE TRIGGER update_drug_references_updated_at
        BEFORE UPDATE ON drug_references
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS drug_references;
      DROP TABLE IF EXISTS student_study_plans;
      DROP TABLE IF EXISTS notebook_notes;
    `);
  }
}
