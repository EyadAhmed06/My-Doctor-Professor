-- Essay case practice module
DO $$ BEGIN
  CREATE TYPE essay_case_attempt_status AS ENUM ('SUBMITTED','REVEALED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS essay_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL,
  stem text NOT NULL,
  section varchar(120),
  source_case_number int,
  display_order int NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_essay_cases_week ON essay_cases(week_id, display_order);

CREATE TABLE IF NOT EXISTS essay_case_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES essay_cases(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  model_answer text NOT NULL,
  display_order int NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_essay_case_question_order UNIQUE(case_id, display_order)
);

CREATE TABLE IF NOT EXISTS essay_case_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES essay_cases(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status essay_case_attempt_status NOT NULL DEFAULT 'SUBMITTED',
  submitted_at timestamp NOT NULL DEFAULT now(),
  revealed_at timestamp,
  CONSTRAINT uq_student_essay_case_attempt UNIQUE(case_id, student_id)
);

CREATE TABLE IF NOT EXISTS essay_case_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES essay_case_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES essay_case_questions(id) ON DELETE CASCADE,
  answer_text text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_essay_attempt_question UNIQUE(attempt_id, question_id)
);
