-- =====================================================
-- Medical Learning Platform
-- Student Progress Module
-- =====================================================
--
-- Contains:
-- • Course Progress
-- • Lecture Progress
-- • Topic Progress
-- • Question Progress
--
-- =====================================================

CREATE TABLE student_course_progress (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    student_id UUID NOT NULL,

    course_id UUID NOT NULL,

    completion_percentage NUMERIC(5,2)
        NOT NULL DEFAULT 0,

    lectures_completed INTEGER
        NOT NULL DEFAULT 0,

    total_lectures INTEGER
        NOT NULL DEFAULT 0,

    average_score NUMERIC(5,2),

    last_accessed_at TIMESTAMP,

    completed_at TIMESTAMP,

    created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (student_id)
        REFERENCES students(user_id)
        ON DELETE CASCADE,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_student_course
        UNIQUE(student_id, course_id),

    CONSTRAINT chk_completion
        CHECK (
            completion_percentage >= 0
            AND completion_percentage <= 100
        )

);

CREATE TABLE student_lecture_progress (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    student_id UUID NOT NULL,

    lecture_id UUID NOT NULL,

    is_completed BOOLEAN
        NOT NULL DEFAULT FALSE,

    completion_percentage NUMERIC(5,2)
        NOT NULL DEFAULT 0,

    time_spent_minutes INTEGER
        NOT NULL DEFAULT 0,

    last_accessed_at TIMESTAMP,

    completed_at TIMESTAMP,

    created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (student_id)
        REFERENCES students(user_id)
        ON DELETE CASCADE,

    FOREIGN KEY (lecture_id)
        REFERENCES lectures(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_student_lecture
        UNIQUE(student_id, lecture_id),

    CONSTRAINT chk_lecture_completion CHECK (
        completion_percentage >= 0 AND completion_percentage <= 100
        AND time_spent_minutes >= 0
        AND ((is_completed = FALSE AND completed_at IS NULL)
          OR (is_completed = TRUE AND completion_percentage = 100 AND completed_at IS NOT NULL))
    )

);

CREATE TABLE student_topic_progress (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    student_id UUID NOT NULL,

    topic_id UUID NOT NULL,

    questions_attempted INTEGER
        NOT NULL DEFAULT 0,

    questions_correct INTEGER
        NOT NULL DEFAULT 0,

    questions_incorrect INTEGER
        NOT NULL DEFAULT 0,

    confidence_level NUMERIC(5,2),

    average_score NUMERIC(5,2),

    mastery_percentage NUMERIC(5,2)
        NOT NULL DEFAULT 0,

    last_practiced_at TIMESTAMP,

    created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (student_id)
        REFERENCES students(user_id)
        ON DELETE CASCADE,

    FOREIGN KEY (topic_id)
        REFERENCES topics(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_student_topic
        UNIQUE(student_id, topic_id),

    CONSTRAINT chk_mastery CHECK (
        questions_attempted >= 0 AND questions_correct >= 0 AND questions_incorrect >= 0
        AND questions_attempted = questions_correct + questions_incorrect
        AND mastery_percentage >= 0 AND mastery_percentage <= 100
        AND (confidence_level IS NULL OR (confidence_level >= 0 AND confidence_level <= 100))
        AND (average_score IS NULL OR (average_score >= 0 AND average_score <= 100))
    )

);

CREATE TABLE student_question_progress (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    student_id UUID NOT NULL,

    question_id UUID NOT NULL,

    attempts INTEGER
        NOT NULL DEFAULT 0,

    correct_attempts INTEGER
        NOT NULL DEFAULT 0,

    incorrect_attempts INTEGER
        NOT NULL DEFAULT 0,

    last_answer_correct BOOLEAN,

    bookmarked BOOLEAN
        NOT NULL DEFAULT FALSE,

    last_attempted_at TIMESTAMP,

    created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (student_id)
        REFERENCES students(user_id)
        ON DELETE CASCADE,

    FOREIGN KEY (question_id)
        REFERENCES questions(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_student_question UNIQUE(student_id, question_id),
    CONSTRAINT chk_question_progress_counts CHECK (
        attempts >= 0 AND correct_attempts >= 0 AND incorrect_attempts >= 0
        AND attempts = correct_attempts + incorrect_attempts
    )

);

CREATE INDEX idx_course_progress_student
ON student_course_progress(student_id);

CREATE INDEX idx_course_progress_course
ON student_course_progress(course_id);

CREATE INDEX idx_lecture_progress_student
ON student_lecture_progress(student_id);

CREATE INDEX idx_topic_progress_student
ON student_topic_progress(student_id);

CREATE INDEX idx_question_progress_student
ON student_question_progress(student_id);

CREATE INDEX idx_question_progress_question
ON student_question_progress(question_id);