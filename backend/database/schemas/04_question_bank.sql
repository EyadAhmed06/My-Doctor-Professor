-- =====================================================
-- Medical Learning Platform
-- Question Bank Module
-- =====================================================
--
-- Contains:
--  • Questions
--  • MCQ Options
--  • Essay Configuration
--  • Tags
--  • Question Tags
--
-- =====================================================

CREATE TABLE questions (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    topic_id UUID NOT NULL,

    question_type question_type NOT NULL,

    title VARCHAR(200),

    question_text TEXT NOT NULL,

    explanation TEXT,

    hint TEXT,

    reference TEXT,

    difficulty question_difficulty NOT NULL DEFAULT 'MEDIUM',

    estimated_time_seconds INTEGER,

    marks NUMERIC(5,2) NOT NULL DEFAULT 1.0,

    is_question_bank BOOLEAN NOT NULL DEFAULT TRUE,

    version INTEGER NOT NULL DEFAULT 1,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by UUID NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (topic_id)
        REFERENCES topics(id)
        ON DELETE CASCADE,

    FOREIGN KEY (created_by)
        REFERENCES instructors(user_id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_estimated_time
        CHECK (
            estimated_time_seconds IS NULL
            OR estimated_time_seconds > 0
        ),

    CONSTRAINT chk_marks
        CHECK (marks > 0)

);

CREATE TABLE mcq_options (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    question_id UUID NOT NULL,

    option_text TEXT NOT NULL,

    is_correct BOOLEAN NOT NULL DEFAULT FALSE,

    display_order INTEGER NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (question_id)
        REFERENCES questions(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_question_option_order
        UNIQUE(question_id, display_order)

);

CREATE TABLE essay_configurations (

    question_id UUID PRIMARY KEY,

    minimum_word_count INTEGER,

    maximum_word_count INTEGER,

    model_answer TEXT,

    grading_rubric TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (question_id)
        REFERENCES questions(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_word_count
        CHECK (

            minimum_word_count IS NULL
            OR maximum_word_count IS NULL
            OR minimum_word_count <= maximum_word_count

        )

);

CREATE TABLE tags (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tag_name VARCHAR(100) NOT NULL UNIQUE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE question_tags (

    question_id UUID NOT NULL,

    tag_id UUID NOT NULL,

    PRIMARY KEY (
        question_id,
        tag_id
    ),

    FOREIGN KEY (question_id)
        REFERENCES questions(id)
        ON DELETE CASCADE,

    FOREIGN KEY (tag_id)
        REFERENCES tags(id)
        ON DELETE CASCADE

);

CREATE INDEX idx_questions_topic
ON questions(topic_id);

CREATE INDEX idx_questions_type
ON questions(question_type);

CREATE INDEX idx_questions_difficulty
ON questions(difficulty);

CREATE INDEX idx_questions_bank
ON questions(is_question_bank);

CREATE INDEX idx_mcq_question
ON mcq_options(question_id);

CREATE INDEX idx_question_tags_tag
ON question_tags(tag_id);

