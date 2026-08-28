-- Assessment module
CREATE TABLE tests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title VARCHAR(200) NOT NULL, description TEXT,
 test_type test_type NOT NULL, course_id UUID, week_id UUID, lecture_id UUID,
 duration_minutes INTEGER, total_marks NUMERIC(6,2), passing_marks NUMERIC(6,2),
 is_published BOOLEAN NOT NULL DEFAULT FALSE, available_from TIMESTAMP, available_until TIMESTAMP,
 generation_key VARCHAR(128), generation_fingerprint VARCHAR(64),
 created_by UUID NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
 FOREIGN KEY (week_id) REFERENCES weeks(id) ON DELETE SET NULL,
 FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE SET NULL,
 FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT chk_duration CHECK (duration_minutes IS NULL OR duration_minutes > 0),
 CONSTRAINT chk_total_marks CHECK (total_marks IS NULL OR total_marks > 0),
 CONSTRAINT chk_passing_marks CHECK (passing_marks IS NULL OR passing_marks >= 0),
 CONSTRAINT chk_test_window CHECK (available_from IS NULL OR available_until IS NULL OR available_until > available_from)
);
CREATE UNIQUE INDEX uq_tests_creator_generation_key ON tests(created_by, generation_key) WHERE generation_key IS NOT NULL;
CREATE TABLE test_questions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), test_id UUID NOT NULL, question_id UUID NOT NULL,
 display_order INTEGER NOT NULL, marks NUMERIC(5,2) NOT NULL DEFAULT 1, time_limit_seconds INTEGER,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
 FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT,
 CONSTRAINT uq_test_question UNIQUE(test_id, question_id),
 CONSTRAINT uq_display_order UNIQUE(test_id, display_order),
 CONSTRAINT chk_test_question_order CHECK (display_order > 0),
 CONSTRAINT chk_test_question_marks CHECK (marks > 0),
 CONSTRAINT chk_question_time_limit CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0)
);
CREATE TABLE test_attempts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id UUID NOT NULL, test_id UUID NOT NULL,
 test_mode test_mode NOT NULL, status test_attempt_status NOT NULL DEFAULT 'NOT_STARTED',
 score NUMERIC(6,2), started_at TIMESTAMP, submitted_at TIMESTAMP, last_activity_at TIMESTAMP,
 auto_submitted BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE,
 FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE RESTRICT,
 CONSTRAINT chk_attempt_score CHECK (score IS NULL OR score >= 0)
);
CREATE UNIQUE INDEX uq_active_student_test_attempt ON test_attempts(student_id, test_id) WHERE status = 'IN_PROGRESS';
CREATE TABLE student_answers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id UUID NOT NULL, question_id UUID NOT NULL,
 selected_option_id UUID, essay_answer TEXT, awarded_marks NUMERIC(5,2), is_correct BOOLEAN,
 feedback TEXT, graded_by UUID, graded_at TIMESTAMP, answered_at TIMESTAMP,
 FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
 FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT,
 FOREIGN KEY (selected_option_id) REFERENCES mcq_options(id) ON DELETE SET NULL,
 FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL,
 CONSTRAINT uq_attempt_question_answer UNIQUE(attempt_id, question_id),
 CONSTRAINT chk_answer_shape CHECK (NOT (selected_option_id IS NOT NULL AND essay_answer IS NOT NULL)),
 CONSTRAINT chk_awarded_marks CHECK (awarded_marks IS NULL OR awarded_marks >= 0)
);
CREATE TABLE question_flags (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id UUID NOT NULL, question_id UUID NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
 FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT,
 CONSTRAINT uq_flag UNIQUE(attempt_id, question_id)
);
CREATE TABLE question_notes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id UUID NOT NULL, question_id UUID NOT NULL,
 note TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
 FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT,
 CONSTRAINT uq_note UNIQUE(attempt_id, question_id),
 CONSTRAINT chk_note_not_blank CHECK (length(btrim(note)) > 0)
);
CREATE INDEX idx_tests_course ON tests(course_id);
CREATE INDEX idx_tests_type ON tests(test_type);
CREATE INDEX idx_attempt_student ON test_attempts(student_id);
CREATE INDEX idx_attempt_test ON test_attempts(test_id);
CREATE INDEX idx_answers_attempt ON student_answers(attempt_id);
CREATE INDEX idx_answers_question ON student_answers(question_id);
CREATE INDEX idx_flags_attempt ON question_flags(attempt_id);
CREATE INDEX idx_notes_attempt ON question_notes(attempt_id);

-- Published assessment MCQ integrity is enforced in the database as well as the API.
CREATE OR REPLACE FUNCTION assert_published_test_mcq_shape(target_test_id uuid)
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM test_questions tq
    JOIN questions q ON q.id = tq.question_id
    WHERE tq.test_id = target_test_id
      AND q.question_type = 'MCQ'
      AND (
        (SELECT COUNT(*) FROM mcq_options mo WHERE mo.question_id = q.id) <> 5
        OR
        (SELECT COUNT(*) FROM mcq_options mo WHERE mo.question_id = q.id AND mo.is_correct = TRUE) <> 1
      )
  ) THEN
    RAISE EXCEPTION 'Published assessments require every MCQ to have exactly five options and exactly one correct answer'
      USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_test_mcq_shape_on_publish()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_published = TRUE THEN
    PERFORM assert_published_test_mcq_shape(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tests_mcq_shape
BEFORE UPDATE OF is_published ON tests
FOR EACH ROW
WHEN (NEW.is_published = TRUE)
EXECUTE FUNCTION enforce_test_mcq_shape_on_publish();

CREATE OR REPLACE FUNCTION enforce_test_question_mcq_shape()
RETURNS trigger AS $$
DECLARE
  target_test uuid;
  published boolean;
BEGIN
  target_test := COALESCE(NEW.test_id, OLD.test_id);
  SELECT is_published INTO published FROM tests WHERE id = target_test;
  IF published = TRUE THEN
    PERFORM assert_published_test_mcq_shape(target_test);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_test_questions_mcq_shape
AFTER INSERT OR UPDATE OR DELETE ON test_questions
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION enforce_test_question_mcq_shape();

CREATE OR REPLACE FUNCTION enforce_option_mcq_shape_for_published_tests()
RETURNS trigger AS $$
DECLARE
  target_question uuid;
BEGIN
  target_question := COALESCE(NEW.question_id, OLD.question_id);
  IF EXISTS (
    SELECT 1
    FROM test_questions tq
    JOIN tests t ON t.id = tq.test_id
    WHERE tq.question_id = target_question AND t.is_published = TRUE
  ) THEN
    PERFORM assert_published_test_mcq_shape(tq.test_id)
    FROM test_questions tq
    JOIN tests t ON t.id = tq.test_id
    WHERE tq.question_id = target_question AND t.is_published = TRUE;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_mcq_options_published_shape
AFTER INSERT OR UPDATE OR DELETE ON mcq_options
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION enforce_option_mcq_shape_for_published_tests();