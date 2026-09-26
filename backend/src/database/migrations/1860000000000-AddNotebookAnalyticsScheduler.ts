import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotebookAnalyticsScheduler1860000000000 implements MigrationInterface {
 name='AddNotebookAnalyticsScheduler1860000000000';
 async up(queryRunner:QueryRunner):Promise<void>{await queryRunner.query(`
  CREATE TABLE notebook_collections (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
   name varchar(120) NOT NULL, description text, color varchar(20) NOT NULL DEFAULT '#5b8f8a',
   is_pinned boolean NOT NULL DEFAULT false, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
   CONSTRAINT fk_notebook_collections_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX uq_notebook_collection_owner_name ON notebook_collections(user_id,lower(name));
  CREATE INDEX idx_notebook_collections_owner ON notebook_collections(user_id,updated_at);
  CREATE TRIGGER update_notebook_collections_updated_at BEFORE UPDATE ON notebook_collections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  CREATE TABLE notebook_tags (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
   name varchar(60) NOT NULL, color varchar(20) NOT NULL DEFAULT '#5b8f8a',
   created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
   CONSTRAINT fk_notebook_tags_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX uq_notebook_tag_owner_name ON notebook_tags(user_id,lower(name));
  CREATE INDEX idx_notebook_tags_owner ON notebook_tags(user_id,name);
  CREATE TRIGGER update_notebook_tags_updated_at BEFORE UPDATE ON notebook_tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  ALTER TABLE notebook_notes ADD COLUMN collection_id uuid, ADD COLUMN is_favorite boolean NOT NULL DEFAULT false,
   ADD COLUMN review_at timestamp, ADD COLUMN linked_question_id uuid, ADD COLUMN linked_lecture_id uuid;
  ALTER TABLE notebook_notes ADD CONSTRAINT fk_notebook_notes_collection FOREIGN KEY(collection_id) REFERENCES notebook_collections(id) ON DELETE SET NULL,
   ADD CONSTRAINT fk_notebook_notes_question FOREIGN KEY(linked_question_id) REFERENCES questions(id) ON DELETE SET NULL,
   ADD CONSTRAINT fk_notebook_notes_lecture FOREIGN KEY(linked_lecture_id) REFERENCES lectures(id) ON DELETE SET NULL;
  CREATE TABLE notebook_note_tags (
   note_id uuid NOT NULL, tag_id uuid NOT NULL, PRIMARY KEY(note_id,tag_id),
   CONSTRAINT fk_notebook_note_tags_note FOREIGN KEY(note_id) REFERENCES notebook_notes(id) ON DELETE CASCADE,
   CONSTRAINT fk_notebook_note_tags_tag FOREIGN KEY(tag_id) REFERENCES notebook_tags(id) ON DELETE CASCADE
  );
  CREATE TABLE notebook_attachments (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note_id uuid NOT NULL, kind varchar(20) NOT NULL,
   file_name varchar(255) NOT NULL, mime_type varchar(120) NOT NULL, file_url varchar(1000) NOT NULL,
   size_bytes bigint, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
   CONSTRAINT ck_notebook_attachment_kind CHECK(kind IN ('IMAGE','RESOURCE')),
   CONSTRAINT fk_notebook_attachments_note FOREIGN KEY(note_id) REFERENCES notebook_notes(id) ON DELETE CASCADE
  );
  CREATE INDEX idx_notebook_attachments_note ON notebook_attachments(note_id);
  CREATE TYPE study_plan_item_type AS ENUM ('QUESTIONS','FLASHCARDS','LECTURE','REVIEW','REST');
  CREATE TYPE study_plan_item_status AS ENUM ('PLANNED','COMPLETED','SKIPPED');
  ALTER TABLE student_study_plans ADD COLUMN generated_at timestamp, ADD COLUMN schedule_version int NOT NULL DEFAULT 0;
  CREATE TABLE study_plan_items (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL, scheduled_date date NOT NULL,
   item_type study_plan_item_type NOT NULL, status study_plan_item_status NOT NULL DEFAULT 'PLANNED',
   lecture_id uuid, target_count int, duration_minutes int NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
   completed_at timestamp, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
   CONSTRAINT ck_study_plan_item_duration CHECK(duration_minutes BETWEEN 1 AND 1440),
   CONSTRAINT ck_study_plan_item_target CHECK(target_count IS NULL OR target_count > 0),
   CONSTRAINT fk_study_plan_item_plan FOREIGN KEY(student_id) REFERENCES student_study_plans(student_id) ON DELETE CASCADE,
   CONSTRAINT fk_study_plan_item_lecture FOREIGN KEY(lecture_id) REFERENCES lectures(id) ON DELETE SET NULL
  );
  CREATE INDEX idx_study_plan_items_student_date ON study_plan_items(student_id,scheduled_date);
  CREATE TRIGGER update_study_plan_items_updated_at BEFORE UPDATE ON study_plan_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
 `);}
 async down(queryRunner:QueryRunner):Promise<void>{await queryRunner.query(`
  DROP TABLE IF EXISTS study_plan_items; ALTER TABLE student_study_plans DROP COLUMN IF EXISTS schedule_version, DROP COLUMN IF EXISTS generated_at;
  DROP TYPE IF EXISTS study_plan_item_status; DROP TYPE IF EXISTS study_plan_item_type;
  DROP TABLE IF EXISTS notebook_attachments; DROP TABLE IF EXISTS notebook_note_tags;
  ALTER TABLE notebook_notes DROP COLUMN IF EXISTS linked_lecture_id, DROP COLUMN IF EXISTS linked_question_id,
   DROP COLUMN IF EXISTS review_at, DROP COLUMN IF EXISTS is_favorite, DROP COLUMN IF EXISTS collection_id;
  DROP TABLE IF EXISTS notebook_tags; DROP TABLE IF EXISTS notebook_collections;
 `);}
}
