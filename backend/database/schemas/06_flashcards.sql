-- =====================================================
-- Medical Learning Platform
-- Flashcards Module
-- =====================================================
--
-- Contains:
-- • Flashcard Decks
-- • Flashcards
-- • Student Flashcard Progress
--
-- =====================================================

CREATE TABLE flashcard_decks (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    course_id UUID NOT NULL,

    topic_id UUID,

    lecture_id UUID,

    title VARCHAR(200) NOT NULL,

    description TEXT,

    is_published BOOLEAN NOT NULL DEFAULT FALSE,

    display_order INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (topic_id)
        REFERENCES topics(id)
        ON DELETE SET NULL,

    FOREIGN KEY (lecture_id)
        REFERENCES lectures(id)
        ON DELETE SET NULL
);

CREATE TABLE flashcards (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    deck_id UUID NOT NULL,

    title VARCHAR(200) NOT NULL,

    front_content TEXT NOT NULL,

    back_content TEXT NOT NULL,

    difficulty question_difficulty NOT NULL DEFAULT 'MEDIUM',

    explanation TEXT,

    hint TEXT,

    estimated_review_seconds INTEGER

    display_order INTEGER NOT NULL DEFAULT 1,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (deck_id)
        REFERENCES flashcard_decks(id)
        ON DELETE CASCADE
);

CREATE TABLE student_flashcard_progress (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    student_id UUID NOT NULL,

    flashcard_id UUID NOT NULL,

    times_reviewed INTEGER NOT NULL DEFAULT 0,

    times_correct INTEGER NOT NULL DEFAULT 0,

    times_incorrect INTEGER NOT NULL DEFAULT 0,

    review_streak INTEGER NOT NULL DEFAULT 0,

    last_reviewed_at TIMESTAMP,

    next_review_at TIMESTAMP,

    is_mastered BOOLEAN NOT NULL DEFAULT FALSE,

    mastered_at TIMESTAMP,

    ease_factor NUMERIC(4,2),

    interval_days INTEGER,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (student_id)
        REFERENCES students(user_id)
        ON DELETE CASCADE,

    FOREIGN KEY (flashcard_id)
        REFERENCES flashcards(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_student_flashcard
        UNIQUE(student_id, flashcard_id),

    CONSTRAINT chk_review_counts
        CHECK (
            times_reviewed >= 0
            AND times_correct >= 0
            AND times_incorrect >= 0
        ),

    CONSTRAINT chk_interval
        CHECK (
            interval_days IS NULL
            OR interval_days >= 0
        )
);

CREATE INDEX idx_flashcard_decks_course
ON flashcard_decks(course_id);

CREATE INDEX idx_flashcard_decks_topic
ON flashcard_decks(topic_id);

CREATE INDEX idx_flashcard_decks_lecture
ON flashcard_decks(lecture_id);

CREATE INDEX idx_flashcards_deck
ON flashcards(deck_id);

CREATE INDEX idx_flashcards_difficulty
ON flashcards(difficulty);

CREATE INDEX idx_student_flashcards_student
ON student_flashcard_progress(student_id);

CREATE INDEX idx_student_flashcards_flashcard
ON student_flashcard_progress(flashcard_id);

