import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReconcileMissingStudentWorkspace2140000000000
  implements MigrationInterface
{
  name = 'ReconcileMissingStudentWorkspace2140000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const [state] = await queryRunner.query(`
      SELECT
        to_regclass('public.notebook_notes') AS notebook_notes,
        to_regclass('public.student_study_plans') AS student_study_plans,
        to_regclass('public.drug_references') AS drug_references,
        to_regclass('public.notebook_collections') AS notebook_collections,
        to_regclass('public.notebook_tags') AS notebook_tags,
        to_regclass('public.notebook_note_tags') AS notebook_note_tags,
        to_regclass('public.notebook_attachments') AS notebook_attachments,
        to_regclass('public.study_plan_items') AS study_plan_items,
        to_regtype('public.study_plan_item_type') AS study_plan_item_type,
        to_regtype('public.study_plan_item_status') AS study_plan_item_status
    `);

    const tableKeys = [
      'notebook_notes',
      'student_study_plans',
      'drug_references',
      'notebook_collections',
      'notebook_tags',
      'notebook_note_tags',
      'notebook_attachments',
      'study_plan_items',
    ];
    const typeKeys = ['study_plan_item_type', 'study_plan_item_status'];

    const presentTables = tableKeys.filter((key) => Boolean(state?.[key]));
    const presentTypes = typeKeys.filter((key) => Boolean(state?.[key]));

    if (
      presentTables.length === tableKeys.length &&
      presentTypes.length === typeKeys.length
    ) {
      return;
    }

    if (presentTables.length !== 0 || presentTypes.length !== 0) {
      throw new Error(
        `Student workspace schema is partially present; refusing automatic reconstruction. ` +
          `Present tables: ${presentTables.join(', ') || 'none'}. ` +
          `Present types: ${presentTypes.join(', ') || 'none'}.`,
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
        collection_id uuid,
        is_favorite boolean NOT NULL DEFAULT false,
        review_at timestamp,
        linked_question_id uuid,
        linked_lecture_id uuid,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_notebook_note_type CHECK (
          note_type IN ('PERSONAL','EXPLANATION','PEARL','IMAGE','LINKED_CASE')
        ),
        CONSTRAINT fk_notebook_notes_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_notebook_notes_question
          FOREIGN KEY (linked_question_id) REFERENCES questions(id) ON DELETE SET NULL,
        CONSTRAINT fk_notebook_notes_lecture
          FOREIGN KEY (linked_lecture_id) REFERENCES lectures(id) ON DELETE SET NULL
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
        generated_at timestamp,
        schedule_version int NOT NULL DEFAULT 0,
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

      CREATE TABLE notebook_collections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        description text,
        color varchar(20) NOT NULL DEFAULT '#5b8f8a',
        is_pinned boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_notebook_collections_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX uq_notebook_collection_owner_name
        ON notebook_collections(user_id, lower(name));
      CREATE INDEX idx_notebook_collections_owner
        ON notebook_collections(user_id, updated_at);

      CREATE TRIGGER update_notebook_collections_updated_at
        BEFORE UPDATE ON notebook_collections
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TABLE notebook_tags (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        name varchar(60) NOT NULL,
        color varchar(20) NOT NULL DEFAULT '#5b8f8a',
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_notebook_tags_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX uq_notebook_tag_owner_name
        ON notebook_tags(user_id, lower(name));
      CREATE INDEX idx_notebook_tags_owner
        ON notebook_tags(user_id, name);

      CREATE TRIGGER update_notebook_tags_updated_at
        BEFORE UPDATE ON notebook_tags
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      ALTER TABLE notebook_notes
        ADD CONSTRAINT fk_notebook_notes_collection
          FOREIGN KEY (collection_id) REFERENCES notebook_collections(id) ON DELETE SET NULL;

      CREATE TABLE notebook_note_tags (
        note_id uuid NOT NULL,
        tag_id uuid NOT NULL,
        PRIMARY KEY (note_id, tag_id),
        CONSTRAINT fk_notebook_note_tags_note
          FOREIGN KEY (note_id) REFERENCES notebook_notes(id) ON DELETE CASCADE,
        CONSTRAINT fk_notebook_note_tags_tag
          FOREIGN KEY (tag_id) REFERENCES notebook_tags(id) ON DELETE CASCADE
      );

      CREATE TABLE notebook_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id uuid NOT NULL,
        kind varchar(20) NOT NULL,
        file_name varchar(255) NOT NULL,
        mime_type varchar(120) NOT NULL,
        file_url varchar(1000) NOT NULL,
        size_bytes bigint,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_notebook_attachment_kind CHECK (kind IN ('IMAGE','RESOURCE')),
        CONSTRAINT fk_notebook_attachments_note
          FOREIGN KEY (note_id) REFERENCES notebook_notes(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_notebook_attachments_note
        ON notebook_attachments(note_id);

      CREATE TYPE study_plan_item_type AS ENUM (
        'QUESTIONS','FLASHCARDS','LECTURE','REVIEW','REST'
      );
      CREATE TYPE study_plan_item_status AS ENUM (
        'PLANNED','COMPLETED','SKIPPED'
      );

      CREATE TABLE study_plan_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id uuid NOT NULL,
        scheduled_date date NOT NULL,
        item_type study_plan_item_type NOT NULL,
        status study_plan_item_status NOT NULL DEFAULT 'PLANNED',
        lecture_id uuid,
        target_count int,
        duration_minutes int NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        completed_at timestamp,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_study_plan_item_duration
          CHECK (duration_minutes BETWEEN 1 AND 1440),
        CONSTRAINT ck_study_plan_item_target
          CHECK (target_count IS NULL OR target_count > 0),
        CONSTRAINT fk_study_plan_item_plan
          FOREIGN KEY (student_id) REFERENCES student_study_plans(student_id) ON DELETE CASCADE,
        CONSTRAINT fk_study_plan_item_lecture
          FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_study_plan_items_student_date
        ON study_plan_items(student_id, scheduled_date);

      CREATE TRIGGER update_study_plan_items_updated_at
        BEFORE UPDATE ON study_plan_items
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  async down(): Promise<void> {
    throw new Error(
      'ReconcileMissingStudentWorkspace2140000000000 cannot be safely reverted automatically',
    );
  }
}
