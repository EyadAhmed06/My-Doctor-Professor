import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenFlashcardWorkflow1770000000000 implements MigrationInterface {
  name = 'HardenFlashcardWorkflow1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ DECLARE constraint_name text;
      BEGIN
        SELECT constraint_record.conname INTO constraint_name
        FROM pg_constraint constraint_record
        JOIN pg_class source_table ON source_table.oid = constraint_record.conrelid
        JOIN pg_namespace source_schema ON source_schema.oid = source_table.relnamespace
        JOIN unnest(constraint_record.conkey) AS source_key(attnum) ON TRUE
        JOIN pg_attribute source_column
          ON source_column.attrelid = source_table.oid
         AND source_column.attnum = source_key.attnum
        WHERE source_schema.nspname = current_schema() AND source_table.relname = 'flashcard_decks'
          AND constraint_record.contype = 'f' AND source_column.attname = 'created_by'
        LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE flashcard_decks DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
      ALTER TABLE flashcard_decks ADD CONSTRAINT fk_flashcard_decks_creator_users
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;

      DO $$ DECLARE constraint_name text;
      BEGIN
        SELECT constraint_record.conname INTO constraint_name
        FROM pg_constraint constraint_record
        JOIN pg_class source_table ON source_table.oid = constraint_record.conrelid
        JOIN pg_namespace source_schema ON source_schema.oid = source_table.relnamespace
        JOIN unnest(constraint_record.conkey) AS source_key(attnum) ON TRUE
        JOIN pg_attribute source_column
          ON source_column.attrelid = source_table.oid
         AND source_column.attnum = source_key.attnum
        WHERE source_schema.nspname = current_schema() AND source_table.relname = 'flashcard_decks'
          AND constraint_record.contype = 'f' AND source_column.attname = 'course_id'
        LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE flashcard_decks DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
      ALTER TABLE flashcard_decks ADD CONSTRAINT fk_flashcard_decks_course_restrict
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT;

      DO $$ DECLARE constraint_name text;
      BEGIN
        SELECT constraint_record.conname INTO constraint_name
        FROM pg_constraint constraint_record
        JOIN pg_class source_table ON source_table.oid = constraint_record.conrelid
        JOIN pg_namespace source_schema ON source_schema.oid = source_table.relnamespace
        JOIN unnest(constraint_record.conkey) AS source_key(attnum) ON TRUE
        JOIN pg_attribute source_column
          ON source_column.attrelid = source_table.oid
         AND source_column.attnum = source_key.attnum
        WHERE source_schema.nspname = current_schema()
          AND source_table.relname = 'student_flashcard_progress'
          AND constraint_record.contype = 'f' AND source_column.attname = 'flashcard_id'
        LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE student_flashcard_progress DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
      ALTER TABLE student_flashcard_progress ADD CONSTRAINT fk_student_flashcard_card_restrict
        FOREIGN KEY (flashcard_id) REFERENCES flashcards(id) ON DELETE RESTRICT;

      ALTER TABLE student_flashcard_progress DROP COLUMN IF EXISTS created_by;
      UPDATE student_flashcard_progress SET ease_factor = 2.50 WHERE ease_factor IS NULL;
      UPDATE student_flashcard_progress SET interval_days = 0 WHERE interval_days IS NULL;
      ALTER TABLE student_flashcard_progress
        ALTER COLUMN ease_factor SET DEFAULT 2.50,
        ALTER COLUMN ease_factor SET NOT NULL,
        ALTER COLUMN interval_days SET DEFAULT 0,
        ALTER COLUMN interval_days SET NOT NULL;

      WITH ranked_cards AS (
        SELECT id, row_number() OVER (
          PARTITION BY deck_id, display_order ORDER BY created_at, id
        ) AS position
        FROM flashcards
      )
      UPDATE flashcards card
      SET display_order = card.display_order + 1000000 + ranked.position
      FROM ranked_cards ranked
      WHERE card.id = ranked.id AND ranked.position > 1;

      ALTER TABLE flashcards ADD CONSTRAINT uq_flashcard_deck_order
        UNIQUE(deck_id, display_order);
      CREATE INDEX idx_student_flashcards_due
        ON student_flashcard_progress(student_id, next_review_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_student_flashcards_due;
      ALTER TABLE flashcards DROP CONSTRAINT IF EXISTS uq_flashcard_deck_order;
      ALTER TABLE student_flashcard_progress
        ALTER COLUMN ease_factor DROP NOT NULL,
        ALTER COLUMN interval_days DROP NOT NULL;
      ALTER TABLE student_flashcard_progress ADD COLUMN created_by UUID;
      ALTER TABLE student_flashcard_progress DROP CONSTRAINT IF EXISTS fk_student_flashcard_card_restrict;
      ALTER TABLE student_flashcard_progress ADD CONSTRAINT fk_student_flashcard_card
        FOREIGN KEY (flashcard_id) REFERENCES flashcards(id) ON DELETE CASCADE;
      ALTER TABLE flashcard_decks DROP CONSTRAINT IF EXISTS fk_flashcard_decks_course_restrict;
      ALTER TABLE flashcard_decks ADD CONSTRAINT fk_flashcard_decks_course
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
      ALTER TABLE flashcard_decks DROP CONSTRAINT IF EXISTS fk_flashcard_decks_creator_users;
      ALTER TABLE flashcard_decks ADD CONSTRAINT fk_flashcard_decks_creator_instructors
        FOREIGN KEY (created_by) REFERENCES instructors(user_id) ON DELETE RESTRICT;
    `);
  }
}
