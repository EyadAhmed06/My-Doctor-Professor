-- =====================================================
-- Medical Learning Platform
-- Performance & Utility Module
-- =====================================================
--
-- Contains:
-- • Additional Indexes
-- • Trigger Functions
-- • Triggers
-- • Database Views
--
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
AS
$$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$
LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_courses_updated_at
BEFORE UPDATE ON courses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_weeks_updated_at
BEFORE UPDATE ON weeks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_lectures_updated_at
BEFORE UPDATE ON lectures
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_topics_updated_at
BEFORE UPDATE ON topics
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_resources_updated_at
BEFORE UPDATE ON resources
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_questions_updated_at
BEFORE UPDATE ON questions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_flashcard_decks_updated_at
BEFORE UPDATE ON flashcard_decks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_flashcards_updated_at
BEFORE UPDATE ON flashcards
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_tests_updated_at
BEFORE UPDATE ON tests
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_question_notes_updated_at
BEFORE UPDATE ON question_notes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_student_course_progress_updated_at
BEFORE UPDATE ON student_course_progress
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_student_lecture_progress_updated_at
BEFORE UPDATE ON student_lecture_progress
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_student_topic_progress_updated_at
BEFORE UPDATE ON student_topic_progress
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_student_question_progress_updated_at
BEFORE UPDATE ON student_question_progress
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_courses_name
ON courses(course_name);

CREATE INDEX idx_topics_name
ON topics(topic_name);

CREATE INDEX idx_questions_title
ON questions(title);

CREATE INDEX idx_flashcards_title
ON flashcards(title);

CREATE INDEX idx_tests_title
ON tests(title);

CREATE INDEX idx_notifications_created_at
ON notifications(created_at);

CREATE INDEX idx_audit_created_at
ON audit_logs(created_at DESC);

CREATE VIEW student_dashboard AS
SELECT

    s.user_id,

    u.full_name,

    COUNT(DISTINCT scp.course_id) AS enrolled_courses,

    AVG(scp.completion_percentage) AS average_completion,

    AVG(scp.average_score) AS average_score

FROM students s

JOIN users u
ON s.user_id = u.id

LEFT JOIN student_course_progress scp
ON s.user_id = scp.student_id

GROUP BY
    s.user_id,
    u.full_name;

CREATE VIEW question_bank_statistics AS
SELECT

    t.topic_name,

    q.question_type,

    COUNT(*) AS total_questions

FROM questions q

JOIN topics t
ON q.topic_id = t.id

WHERE q.is_question_bank = TRUE

GROUP BY

    t.topic_name,
    q.question_type;

CREATE VIEW instructor_dashboard AS
SELECT

    i.user_id,

    u.full_name,

    COUNT(DISTINCT t.id) AS tests_created,

    COUNT(DISTINCT fd.id) AS flashcard_decks,

    COUNT(DISTINCT q.id) AS questions_created

FROM instructors i

JOIN users u
ON i.user_id = u.id

LEFT JOIN tests t
ON t.created_by = i.user_id

LEFT JOIN flashcard_decks fd
ON fd.created_by = i.user_id

LEFT JOIN questions q
ON q.created_by = i.user_id
AND q.is_question_bank = TRUE

GROUP BY

    i.user_id,
    u.full_name;

