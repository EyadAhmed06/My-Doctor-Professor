-- Final compatibility reconciliation for installations upgraded from the Eyad baseline.
-- This migration is intentionally idempotent and must sort after earlier forward migrations.

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT auth_sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
ON auth_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
ON auth_sessions(expires_at);

UPDATE test_attempts
SET auto_submitted = FALSE
WHERE auto_submitted IS NULL;

ALTER TABLE test_attempts
    ALTER COLUMN auto_submitted SET DEFAULT FALSE,
    ALTER COLUMN auto_submitted SET NOT NULL;

DO $reconcile$
DECLARE
    relationship RECORD;
    existing_constraint TEXT;
BEGIN
    FOR relationship IN
        SELECT * FROM (VALUES
            ('flashcard_decks', 'course_id', 'courses', 'id'),
            ('student_answers', 'question_id', 'questions', 'id'),
            ('test_questions', 'question_id', 'questions', 'id'),
            ('test_attempts', 'test_id', 'tests', 'id'),
            ('question_flags', 'question_id', 'questions', 'id'),
            ('question_notes', 'question_id', 'questions', 'id'),
            ('student_course_progress', 'course_id', 'courses', 'id'),
            ('student_lecture_progress', 'lecture_id', 'lectures', 'id'),
            ('student_flashcard_progress', 'flashcard_id', 'flashcards', 'id'),
            ('student_topic_progress', 'topic_id', 'topics', 'id'),
            ('student_question_progress', 'question_id', 'questions', 'id')
        ) AS required_relationships(table_name, column_name, parent_table, parent_column)
    LOOP
        SELECT constraint_record.conname
        INTO existing_constraint
        FROM pg_constraint constraint_record
        JOIN pg_class source_table ON source_table.oid = constraint_record.conrelid
        JOIN pg_namespace source_schema ON source_schema.oid = source_table.relnamespace
        JOIN unnest(constraint_record.conkey) AS source_key(attnum) ON TRUE
        JOIN pg_attribute source_column
          ON source_column.attrelid = source_table.oid
         AND source_column.attnum = source_key.attnum
        WHERE constraint_record.contype = 'f'
          AND source_schema.nspname = current_schema()
          AND source_table.relname = relationship.table_name
          AND source_column.attname = relationship.column_name
        LIMIT 1;

        IF existing_constraint IS NOT NULL THEN
            EXECUTE format(
                'ALTER TABLE %I DROP CONSTRAINT %I',
                relationship.table_name,
                existing_constraint
            );
        END IF;

        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE RESTRICT',
            relationship.table_name,
            'fk_' || relationship.table_name || '_' || relationship.column_name || '_restrict',
            relationship.column_name,
            relationship.parent_table,
            relationship.parent_column
        );

        existing_constraint := NULL;
    END LOOP;
END
$reconcile$;
