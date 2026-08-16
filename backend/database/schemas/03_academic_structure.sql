-- =====================================================
-- Medical Learning Platform
-- Academic Structure Module
-- =====================================================
-- Description:
-- Defines the academic hierarchy.
--
-- Semester
--      ↓
-- Course
--      ↓
-- Week
--      ↓
-- Lecture
--      ↓
-- Topic
--
-- Resources may belong to a lecture.
-- =====================================================

CREATE TABLE semesters (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    semester_number INTEGER NOT NULL UNIQUE,

    title VARCHAR(100),

    description TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_semester_number
        CHECK (semester_number > 0)

);

CREATE TABLE courses (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    semester_id UUID NOT NULL,

    course_code VARCHAR(20) NOT NULL UNIQUE,

    course_name VARCHAR(150) NOT NULL,

    slug VARCHAR(150) NOT NULL UNIQUE,

    description TEXT,

    credit_hours INTEGER,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    display_order INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (semester_id)
        REFERENCES semesters(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_credit_hours
        CHECK (credit_hours IS NULL OR credit_hours > 0)
        
);




CREATE TABLE weeks (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    course_id UUID NOT NULL,

    week_number INTEGER NOT NULL,

    title VARCHAR(150),

    description TEXT,

    display_order INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_week_number
        CHECK (week_number > 0),

    CONSTRAINT uq_course_week
        UNIQUE(course_id, week_number)

);

CREATE TABLE lectures (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    week_id UUID NOT NULL,

    lecture_number INTEGER NOT NULL,

    title VARCHAR(200) NOT NULL,

    description TEXT,

    estimated_duration_minutes INTEGER,

    is_published BOOLEAN NOT NULL DEFAULT FALSE,

    display_order INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (week_id)
        REFERENCES weeks(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_lecture_number
        CHECK (lecture_number > 0),

    CONSTRAINT chk_duration
        CHECK (
            estimated_duration_minutes IS NULL
            OR estimated_duration_minutes > 0
        ),

    CONSTRAINT uq_week_lecture
        UNIQUE(week_id, lecture_number)

);

CREATE TABLE topics (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    lecture_id UUID NOT NULL,

    topic_name VARCHAR(150) NOT NULL,

    description TEXT,

    display_order INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lecture_id)
        REFERENCES lectures(id)
        ON DELETE CASCADE

);

CREATE TABLE resources (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    lecture_id UUID NOT NULL,

    resource_name VARCHAR(200) NOT NULL,

    resource_type resource_type NOT NULL,

    upload_status upload_status NOT NULL DEFAULT 'UPLOADED',

    file_url TEXT NOT NULL,

    file_size BIGINT,

    storage_key VARCHAR(255),

    original_filename VARCHAR(255),

    mime_type VARCHAR(100),

    checksum_sha256 CHAR(64),

    description TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lecture_id)
        REFERENCES lectures(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_file_size
        CHECK (
            file_size IS NULL
            OR file_size >= 0
        )

);

CREATE INDEX idx_courses_semester
ON courses(semester_id);

CREATE INDEX idx_weeks_course
ON weeks(course_id);

CREATE INDEX idx_lectures_week
ON lectures(week_id);

CREATE INDEX idx_topics_lecture
ON topics(lecture_id);

CREATE INDEX idx_resources_lecture
ON resources(lecture_id);

CREATE INDEX idx_resources_type
ON resources(resource_type);

-- Explicit instructor authorization boundary for course content.
CREATE TABLE course_instructors (
    course_id UUID NOT NULL,
    instructor_id UUID NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (course_id, instructor_id),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (instructor_id) REFERENCES instructors(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_course_instructors_instructor
ON course_instructors(instructor_id);


CREATE UNIQUE INDEX uq_resources_storage_key
ON resources(storage_key) WHERE storage_key IS NOT NULL;
