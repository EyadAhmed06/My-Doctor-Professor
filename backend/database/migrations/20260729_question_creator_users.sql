BEGIN;

ALTER TABLE questions
    DROP CONSTRAINT IF EXISTS questions_created_by_fkey;

ALTER TABLE questions
    ADD CONSTRAINT questions_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES users(id)
    ON DELETE RESTRICT;

COMMIT;
